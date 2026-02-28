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
Pass marker: `S-013 moment/fork verified: parent_replay=... moment_tick=... fork=... forks=... inherited=... fork_replay=...`

8. Verify phase-9 governance runbook and branch-protection policy artifacts:
```bash
node scripts/verify-s014-governance-runbook.mjs
```
Pass marker: `S-014 governance runbook verified: branch=main checks=verify-gate approvals=1`

9. Verify phase-10 branch-protection drift audit (token-aware, CI-safe skip when credentials are absent):
```bash
node scripts/verify-s015-branch-protection-drift.mjs
```
Pass marker: `S-015 branch-protection drift verified: ...`

Optional strict mode (fail if live audit cannot run):
```bash
S015_REQUIRE_LIVE_BRANCH_PROTECTION=1 \
S015_REPO=<owner/repo> \
BRANCH_PROTECTION_AUDIT_TOKEN=<token> \
node scripts/verify-s015-branch-protection-drift.mjs
```

10. Verify phase-11 invite creation/redeem flow on top of moment/fork substrate:
```bash
node scripts/verify-s018-invite-flow.mjs
```
Pass marker: `S-018 invite flow verified: ...`

11. Verify phase-12 cross-instance invite redeem atomicity with shared transactional lock/store:
```bash
node scripts/verify-s019-invite-store.mjs
```
Pass marker: `S-019 invite store verified: ...`

12. Run the phase quality gate (single command for workspace + S-005 + S-006 + S-007 + S-010 + S-011 + S-013 + S-014 + S-015 + S-018 + S-019 checks):
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
- `phase-9-governance-runbook` prints `S-014 governance runbook verified...`
- `phase-10-governance-drift-audit` prints `S-015 branch-protection drift verified...`
- `phase-11-invite-flow` prints `S-018 invite flow verified...`
- `phase-12-invite-store` prints `S-019 invite store verified...`
- command exits `0` and ends with `Quality gate passed.`
- In GitHub Actions, `push` to `main` runs `phase-10-governance-drift-audit` in required-live mode using `BRANCH_PROTECTION_AUDIT_TOKEN`.

13. CI wiring:
```text
.github/workflows/verify-gate.yml
```
This workflow runs `pnpm run verify:gate` on `pull_request`, `push` to `main`, and manual dispatch.
Manual dispatch supports input `require_live_branch_protection_audit=true` to force required-live S-015 audit in CI.

14. Start local infra baseline (PostgreSQL + Redis + NATS):
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

15. Optional workspace commands (after installing deps):
```bash
pnpm install
pnpm run lint
pnpm run build
```

## Notes

- This is architecture scaffolding, not production runtime.
- See `docs/plans/2026-02-28-s004-scaffold-contract.md` for implementation constraints.
