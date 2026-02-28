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

5. Verify phase-4 AI Presence continuous world.delta subscription baseline:
```bash
node scripts/verify-s010-ai-presence.mjs
```
Pass marker: `S-010 ai-presence verified: world=... tick=... deltas=... role=... status=connected`

6. Verify phase-6 DB export narrative preservation:
```bash
node scripts/verify-s011-export-preserve.mjs
```
Pass marker: `S-011 export-preserve verified: signal=... observation=... markers retained`

7. Verify phase-8 moment crystallization and world fork lineage baseline:
```bash
node scripts/verify-s013-moment-fork.mjs
```
Pass marker: `S-013 moment/fork verified: parent_replay=... moment_tick=... fork=... inherited=... fork_replay=...`

8. Run the phase quality gate (single command for workspace + S-005 + S-006 + S-007 + S-010 + S-011 + S-013 checks):
```bash
pnpm run verify:gate
```

Pass criteria:
- `workspace-baseline` prints `Workspace verification passed.`
- `phase-1-ws-flow` prints `S-005 flow verified...`
- `phase-2-replay` prints `S-006 replay verified...`
- `phase-3-routing` prints `S-007 routing verified...`
- `phase-4-ai-presence` prints `S-010 ai-presence verified...`
- `phase-6-export-preserve` prints `S-011 export-preserve verified...`
- `phase-8-moment-fork` prints `S-013 moment/fork verified...`
- command exits `0` and ends with `Quality gate passed.`

9. CI wiring:
```text
.github/workflows/verify-gate.yml
```
This workflow runs `pnpm run verify:gate` on `pull_request`, `push` to `main`, and manual dispatch.

10. Start local infra baseline (PostgreSQL + Redis + NATS):
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

11. Optional workspace commands (after installing deps):
```bash
pnpm install
pnpm run lint
pnpm run build
```

## Notes

- This is architecture scaffolding, not production runtime.
- See `docs/plans/2026-02-28-s004-scaffold-contract.md` for implementation constraints.
