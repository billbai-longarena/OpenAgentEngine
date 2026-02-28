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

3. Verify phase-2 persistence+replay baseline:
```bash
node scripts/verify-s006-replay.mjs
```

4. Verify phase-3 multi-world routing (world-scoped WS + replay isolation):
```bash
node scripts/verify-s007-routing.mjs
```

5. Start local infra baseline (PostgreSQL + Redis + NATS):
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

6. Optional workspace commands (after installing deps):
```bash
pnpm install
pnpm run lint
pnpm run build
```

## Notes

- This is architecture scaffolding, not production runtime.
- See `docs/plans/2026-02-28-s004-scaffold-contract.md` for implementation constraints.
