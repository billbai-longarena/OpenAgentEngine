# Technical Stack & Initial Architecture (S-001)

> Date: 2026-02-28
> Status: Proposed (genesis baseline)
> Signal: S-001 (EXPLORE)
> Inputs: CHARTER.md (C-101/C-105/C-200/C-205/C-305/C-400), docs/plans/2026-02-28-worldview-design.md

## 1. Objective

Define a practical v0 stack and repository architecture for OpenAgentEngine as a **world substrate** (not a traditional request-response app).

This design must support:
- continuously running world state
- continuous signal flow (deposit/decay/emerge)
- real-time multi-user co-presence
- AI Presence that can stay active and role-shift over time
- world branching (fractality) and moment crystallization

## 2. Decision Summary (v0)

1. Monorepo with TypeScript-first development, plus a dedicated Python AI service.
2. Real-time architecture over WebSocket + event bus (not HTTP-only request-response).
3. Durable state in PostgreSQL; hot ephemeral state in Redis.
4. Event-sourced signal stream for world evolution and replay.
5. AI Presence runs as a continuously subscribed service, not only per request.

## 3. Proposed Stack

### 3.1 Workspace and Language

- Monorepo: `pnpm` + `turbo`
- Primary language: TypeScript (Node.js 22 LTS)
- AI service language: Python 3.12 (model/tool ecosystem)

Reasoning:
- Matches C-200 (AI termites are first-class developers): one dominant language lowers contribution friction.
- Keeps AI-specific workflows in Python without forcing Python across the whole substrate.

### 3.2 Frontend (Inhabitant Client + Creator UX)

- `Next.js` (App Router) + TypeScript
- Real-time channel: WebSocket client
- UI split follows C-101:
  - high-frequency controls: explicit buttons
  - creative shaping: natural language conversation panel

### 3.3 Backend Services

- API/Gateway: Fastify (Node.js)
- World Runtime: Node.js worker processes, room/world loops, tick-based updates
- AI Presence Service: FastAPI (Python), long-lived subscribers to signal streams
- Job scheduler: Temporal (or BullMQ in early phase)

### 3.4 Data and Messaging

- PostgreSQL: canonical world metadata, moments, world forks, permissions
- Redis: presence sessions, low-latency caches, distributed locks
- NATS (or Redis Streams in phase 0): signal/event bus between runtime and AI Presence
- Object storage (S3-compatible): large world snapshots and media assets

### 3.5 Observability

- OpenTelemetry across gateway/runtime/AI services
- Prometheus + Grafana dashboards
- Structured logs with request/world/session correlation IDs

## 4. Repository Structure (Target)

```text
apps/
  web/                    # Next.js client (inhabit + shape UX)
  gateway/                # Fastify API + WS session gateway
  runtime/                # world loops, signal processing, branching
  ai-presence/            # Python FastAPI + continuous AI roles

packages/
  signal-schema/          # shared signal types + validation
  world-model/            # world/moment/fork domain models
  protocol-kernel/        # protocol-facing helpers for field scripts/tools
  sdk/                    # client/server SDK utilities

infra/
  docker/                 # local infra definitions
  migrations/             # PostgreSQL schema migrations

docs/
  plans/                  # design and architecture decisions
```

## 5. Runtime Architecture (Logical)

```text
Client (Web)
  <-> Gateway (HTTP + WS)
       <-> Runtime (world loops)
       <-> Signal Bus (NATS/Streams)
       <-> AI Presence Service
       <-> PostgreSQL / Redis / Object Storage
```

Flow:
1. Inhabitant action enters gateway via WS.
2. Runtime mutates world state and emits signals.
3. AI Presence consumes signal stream continuously, decides role/intensity changes.
4. AI or runtime emits new world deltas.
5. Gateway pushes deltas back to clients in near real time.

## 6. Core Data Concepts (v0)

- `World`: persistent evolving substrate instance.
- `SignalEvent`: append-only event with source, weight, context, timestamp.
- `Moment`: crystallized re-entry point (seed + context), not a dead snapshot.
- `Fork`: new world lineage node derived from parent world at a moment.
- `PresenceState`: AI role intensity and visibility state for a world/session.

## 7. Implementation Phases

### Phase 0 (Scaffold, 1-2 days)

- bootstrap monorepo and service directories
- define shared schemas (`World`, `SignalEvent`, `Moment`, `Fork`)
- stand up local Postgres + Redis + one message bus option

### Phase 1 (Single world loop, 3-5 days)

- runtime loop for one world
- gateway WS session and delta broadcast
- signal event append and replay

### Phase 2 (AI Presence, 3-5 days)

- AI service subscribes to signal stream continuously
- implement first role-shift policy (physics-like -> conversational)
- safe fallback when AI service is unavailable

### Phase 3 (Crystallize + Fork, 3-5 days)

- moment creation API
- world fork from moment
- lineage tracking and restore

## 8. Acceptance Criteria for S-001

S-001 is considered materially advanced when:
- stack choices are explicit and justified against CHARTER/worldview constraints
- repository target structure is defined
- service boundaries and data concepts are documented
- phased execution path is concrete enough for immediate scaffolding

## 9. Deferred Risks

- Runtime performance under high concurrency may require Rust/Go for hot paths later.
- AI latency and cost can degrade presence continuity without strict budgets/caching.
- Event schema drift risk requires versioned signal contracts from day one.

## 10. Next Signal Action

Create implementation signal: **"Scaffold monorepo and bootstrap phase-0 services"** derived from this plan.
