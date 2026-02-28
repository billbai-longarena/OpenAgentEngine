# AI Presence (Phase-0)

Run locally:

```bash
cd apps/ai-presence
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Optional env vars for continuous subscription baseline:

```bash
export GATEWAY_WORLD_WS_BASE=ws://127.0.0.1:3001/ws/world
export PRESENCE_WORLD_IDS=world-0001,world-0002
export DEFAULT_WORLD_ID=world-0001
export PRESENCE_RETRY_MS=1000
```

State endpoints:

- `GET /presence/state` returns all tracked world presence states
- `GET /presence/state/{worldId}` returns one world's state
