# OpenAgentEngine

OpenAgentEngine is a world substrate for human-AI co-inhabitation.

## Phase-0 Scaffold (S-004)

This repository currently contains a phase-0 monorepo scaffold for:
- `apps/web` (Next.js placeholder for inhabitant UX)
- `apps/gateway` (Fastify + WebSocket seam)
- `apps/runtime` (world loop seam)
- `apps/ai-presence` (FastAPI health + signal ingress)
- shared substrate packages under `packages/`

## Local Bring-up (Scaffold Validation)

1. Verify workspace structure:
```bash
node scripts/verify-workspace.mjs
```

2. Verify phase-1 runtime→gateway WS delta flow:
```bash
node scripts/verify-s005-flow.mjs
```

3. Start local infra baseline (PostgreSQL + Redis + NATS):
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

4. Optional workspace commands (after installing deps):
```bash
pnpm install
pnpm run lint
pnpm run build
```

## Notes

- This is architecture scaffolding, not production runtime.
- See `docs/plans/2026-02-28-s004-scaffold-contract.md` for implementation constraints.
