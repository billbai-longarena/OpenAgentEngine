from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="OpenAgentEngine AI Presence", version="0.0.0")


class PresenceSignal(BaseModel):
    signal_id: str
    source: str
    weight: int
    context: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-presence"}


@app.post("/presence/signal")
def receive_signal(payload: PresenceSignal) -> dict[str, str | int]:
    # Placeholder seam for continuous signal subscription/processing.
    return {
        "accepted": "true",
        "signal_id": payload.signal_id,
        "weight": payload.weight,
    }
