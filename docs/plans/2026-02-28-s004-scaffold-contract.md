# S-004 Scaffold Contract (Phase 0)

> Date: 2026-02-28
> Status: Active contract for implementation
> Source signals: S-003 (worldview authority), S-004 (implementation HOLE)
> Depends on: CHARTER.md, docs/plans/2026-02-28-worldview-design.md, docs/plans/2026-02-28-tech-stack-architecture.md

## 1. Purpose

Translate worldview principles into executable constraints for S-004 phase-0 scaffolding.

This contract prevents phase-0 from drifting into a traditional CRUD game-admin app.

## 2. Non-Negotiable Constraints

1. Naming follows worldview semantics.
- Prefer `world`, `inhabitant`, `presence`, `moment`, `fork`, `signal`.
- Avoid centering terms like `game`, `player`, `level-editor` in core module names.

2. Substrate/world boundary is explicit (C-205).
- Substrate capabilities live in shared packages/runtime infrastructure.
- Concrete world content/presets stay outside substrate core.

3. Real-time first, request-response second.
- Gateway must reserve a clear WS channel path in phase-0 scaffold.
- Do not scaffold as HTTP-only backend.

4. Continuous AI presence path is reserved.
- `apps/ai-presence` exists from day one, even if minimal.
- Runtime emits signal/event contracts that AI service can subscribe to.

5. Signal-centric data contracts from day one.
- Shared `SignalEvent` schema is created early in `packages/signal-schema`.
- No ad-hoc per-service event shapes.

## 3. Required Scaffold Deliverables (Definition of Done)

Phase-0 is done only if all items exist:

1. Workspace & toolchain
- root `package.json` with workspace config
- `pnpm-workspace.yaml`
- `turbo.json`
- base `tsconfig` strategy

2. App skeletons
- `apps/web` (Next.js placeholder)
- `apps/gateway` (Fastify + WS bootstrap placeholder)
- `apps/runtime` (world loop bootstrap placeholder)
- `apps/ai-presence` (FastAPI app + health route)

3. Shared packages
- `packages/signal-schema` (SignalEvent + validation)
- `packages/world-model` (World/Moment/Fork model stubs)
- `packages/sdk` (client/server integration stubs)

4. Infra baseline
- `infra/docker/docker-compose.yml` includes PostgreSQL + Redis + one event bus option
- `infra/migrations/` has initial migration placeholder

5. Developer execution path
- root README includes one local bring-up path
- at least one command verifies workspace wiring (e.g., lint/typecheck placeholder)

## 4. Explicit Non-Goals (Phase-0)

- No full gameplay loop.
- No production-ready auth/permissions system.
- No complete AI role policy implementation.
- No optimized scaling guarantees.

Phase-0 validates architecture shape and team operating path, not product completeness.

## 5. Handoff Checks for Next Worker

Before closing S-004, verify:

1. Scaffold aligns with terminology and boundary constraints above.
2. WS and event-stream seams are present in code structure.
3. AI service is continuously placeable in topology (not bolted on by HTTP call only).
4. DB/Redis/bus are bootstrappable locally.
5. BLACKBOARD and signals are updated with actual run status.

## 6. Failure Handling

If any non-negotiable constraint is violated during implementation:

- keep S-004 open
- deposit an observation with concrete drift point
- create or boost a HOLE signal for architecture correction before feature build-out
