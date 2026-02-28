from __future__ import annotations

import asyncio
import contextlib
import json
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI
from pydantic import BaseModel

try:
    import websockets
except ImportError:  # pragma: no cover - handled in runtime state
    websockets = None

app = FastAPI(title="OpenAgentEngine AI Presence", version="0.0.0")

DEFAULT_WORLD_ID = os.getenv("DEFAULT_WORLD_ID", "world-0001")
GATEWAY_WORLD_WS_BASE = os.getenv("GATEWAY_WORLD_WS_BASE", "ws://127.0.0.1:3001/ws/world")
PRESENCE_RETRY_MS = max(200, int(os.getenv("PRESENCE_RETRY_MS", "1000")))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def configured_world_ids() -> list[str]:
    raw = os.getenv("PRESENCE_WORLD_IDS", "")
    parsed = [item.strip() for item in raw.split(",") if item.strip()]
    if parsed:
        return parsed
    return [DEFAULT_WORLD_ID]


WORLD_IDS = configured_world_ids()


class PresenceSignal(BaseModel):
    signal_id: str
    source: str
    weight: int
    context: str
    world_id: str | None = None


class PresenceState(BaseModel):
    world_id: str
    connection_status: str = "disconnected"
    role: str = "idle"
    last_tick: int = 0
    total_deltas: int = 0
    last_signal_id: str | None = None
    last_signal_source: str | None = None
    last_signal_weight: int | None = None
    last_signal_context: str | None = None
    last_updated: str | None = None
    last_error: str | None = None


presence_state_by_world: dict[str, PresenceState] = {
    world_id: PresenceState(world_id=world_id) for world_id in WORLD_IDS
}
subscription_tasks: dict[str, asyncio.Task[Any]] = {}
shutdown_event = asyncio.Event()


def state_for_world(world_id: str) -> PresenceState:
    state = presence_state_by_world.get(world_id)
    if state is None:
        state = PresenceState(world_id=world_id)
        presence_state_by_world[world_id] = state
    return state


def resolve_role(signal_context: str, weight: int) -> str:
    if signal_context.startswith("runtime."):
        return "physics"
    if weight >= 8:
        return "conversational"
    if weight >= 5:
        return "craftsman"
    return "idle"


def apply_signal(
    *,
    world_id: str,
    signal_id: str,
    source: str,
    weight: int,
    context: str,
    tick: int,
) -> PresenceState:
    state = state_for_world(world_id)
    state.role = resolve_role(context, weight)
    state.last_tick = max(state.last_tick, tick)
    state.total_deltas += 1
    state.last_signal_id = signal_id
    state.last_signal_source = source
    state.last_signal_weight = weight
    state.last_signal_context = context or None
    state.last_updated = now_iso()
    state.last_error = None
    return state


async def subscribe_world(world_id: str) -> None:
    state = state_for_world(world_id)
    ws_url = f"{GATEWAY_WORLD_WS_BASE}?worldId={quote(world_id, safe='')}"
    retry_seconds = PRESENCE_RETRY_MS / 1000.0

    while not shutdown_event.is_set():
        state.connection_status = "connecting"
        state.last_updated = now_iso()
        state.last_error = None

        try:
            if websockets is None:
                raise RuntimeError("websockets dependency is not installed")

            async with websockets.connect(
                ws_url, ping_interval=20, ping_timeout=20, close_timeout=3
            ) as socket:
                state.connection_status = "connected"
                state.last_updated = now_iso()

                async for raw_message in socket:
                    if shutdown_event.is_set():
                        break
                    try:
                        payload = json.loads(raw_message)
                    except json.JSONDecodeError:
                        continue

                    if payload.get("type") == "gateway.ready":
                        continue
                    if payload.get("type") != "world.delta":
                        continue
                    if payload.get("worldId") != world_id:
                        continue

                    signal = payload.get("signal")
                    if not isinstance(signal, dict):
                        continue

                    tick_value = payload.get("tick")
                    try:
                        tick = int(tick_value)
                    except (TypeError, ValueError):
                        tick = state.last_tick

                    signal_id = signal.get("id")
                    if not isinstance(signal_id, str):
                        signal_id = f"{world_id}-signal-{tick}"

                    source = signal.get("source")
                    if not isinstance(source, str):
                        source = "unknown"

                    weight_value = signal.get("weight")
                    try:
                        weight = int(weight_value)
                    except (TypeError, ValueError):
                        weight = 0

                    context = signal.get("context")
                    if not isinstance(context, str):
                        context = ""

                    state.connection_status = "connected"
                    apply_signal(
                        world_id=world_id,
                        signal_id=signal_id,
                        source=source,
                        weight=weight,
                        context=context,
                        tick=tick,
                    )
        except Exception as error:  # pragma: no cover - network timing dependent
            state.connection_status = "disconnected"
            state.last_error = f"{type(error).__name__}: {error}"
            state.last_updated = now_iso()

        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=retry_seconds)
        except asyncio.TimeoutError:
            continue


@app.on_event("startup")
async def startup() -> None:
    shutdown_event.clear()

    if websockets is None:
        for world_id in WORLD_IDS:
            state = state_for_world(world_id)
            state.connection_status = "disconnected"
            state.last_error = "ImportError: websockets dependency is not installed"
            state.last_updated = now_iso()
        return

    for world_id in WORLD_IDS:
        subscription_tasks[world_id] = asyncio.create_task(
            subscribe_world(world_id), name=f"presence-subscribe-{world_id}"
        )


@app.on_event("shutdown")
async def shutdown() -> None:
    shutdown_event.set()
    for task in subscription_tasks.values():
        task.cancel()
    for task in subscription_tasks.values():
        with contextlib.suppress(asyncio.CancelledError):
            await task
    subscription_tasks.clear()


@app.get("/health")
def health() -> dict[str, str | int]:
    connected = sum(
        1 for state in presence_state_by_world.values() if state.connection_status == "connected"
    )
    return {
        "status": "ok",
        "service": "ai-presence",
        "configured_worlds": len(WORLD_IDS),
        "connected_worlds": connected,
    }


@app.post("/presence/signal")
def receive_signal(payload: PresenceSignal) -> dict[str, str | int]:
    world_id = payload.world_id or DEFAULT_WORLD_ID
    state = apply_signal(
        world_id=world_id,
        signal_id=payload.signal_id,
        source=payload.source,
        weight=payload.weight,
        context=payload.context,
        tick=state_for_world(world_id).last_tick + 1,
    )
    return {
        "accepted": "true",
        "world_id": world_id,
        "signal_id": payload.signal_id,
        "weight": payload.weight,
        "role": state.role,
    }


@app.get("/presence/state")
def list_presence_state() -> dict[str, list[dict[str, Any]]]:
    worlds = [
        presence_state_by_world[world_id].model_dump()
        for world_id in sorted(presence_state_by_world.keys())
    ]
    return {"worlds": worlds}


@app.get("/presence/state/{world_id}")
def get_presence_state(world_id: str) -> dict[str, Any]:
    return state_for_world(world_id).model_dump()
