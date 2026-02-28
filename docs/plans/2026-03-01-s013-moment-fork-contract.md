# S-013 Moment/Fork Contract (Phase 8)

> Date: 2026-03-01
> Status: Active contract for implementation hardening
> Source signals: S-003 (worldview authority), S-013 (implementation HOLE)
> Depends on: CHARTER.md, docs/plans/2026-02-28-worldview-design.md, docs/plans/2026-02-28-tech-stack-architecture.md

## 1. Purpose

Translate worldview principles into executable constraints for `S-013`:
- moment crystallization
- world fork creation
- lineage persistence
- replay compatibility across parent/fork worlds

This contract prevents phase-8 from degrading into static save-file semantics.

## 2. Non-Negotiable Constraints

1. Moment is a re-entry point, not a dead snapshot.
- Moment must point to a valid world timeline tick and preserve seed context.
- Opening/forking from a moment must continue evolution as a living world.

2. Fork lineage is explicit and queryable.
- Fork world must persist `parentWorldId`, `fromMomentId`, `fromTick`, and `inheritedDeltas`.
- Fork lineage query must return deterministic metadata.

3. Replay semantics are world-consistent.
- `GET /world/:worldId/replay` for fork world must never leak parent `worldId`.
- Fork replay ticks must be normalized from 1 for inherited sequence.

4. Substrate/world boundary remains clear (C-205).
- Implementation may persist substrate metadata (moments/lineage), but must not encode product content presets into substrate core.

5. Runtime and AI continuity is preserved.
- Forked worlds must remain compatible with runtime delta ingestion and AI Presence subscription (`world.delta` flow remains intact).

## 3. Required Deliverables (Definition of Done)

`S-013` is done only if all items exist:

1. Moment APIs
- `POST /world/:worldId/moments` to crystallize a moment from replay data.
- `GET /world/:worldId/moments` to list/query moments.

2. Fork API
- `POST /world/:worldId/forks` to create a fork world from a specific `momentId`.
- Fork response includes fork world id and inheritance stats.

3. Lineage API
- `GET /world/:worldId/lineage` returns persisted fork lineage metadata.

4. Persistence baseline
- Moments persisted under world metadata store (append-only friendly format).
- Lineage persisted under world metadata store (single source per fork world).
- Existing world-delta replay path remains backward compatible.

5. Verification path
- `node scripts/verify-s013-moment-fork.mjs` passes locally.
- Root quality gate integration can include `verify:s013` when implementation is stable.

## 4. Validation and Error Contract

Minimum error handling requirements:
- Missing `momentId` on fork request: `400 invalid_request`
- Unknown moment for parent world: `404 moment_not_found`
- Fork world id collision: `409 fork_exists`
- No replay data for requested moment creation target: `404 moment_unavailable`

Responses should include stable machine-readable error codes and short human-readable messages.

## 5. Explicit Non-Goals

- Cross-world permission model and ACLs.
- Full branch merge/rebase semantics.
- Multi-parent lineage graphs.
- Production-grade storage engine migration.

Phase-8 baseline is for functional crystallize/fork/lineage correctness, not full world-graph operations.

## 6. Handoff Checks for Next Worker

Before closing `S-013`, verify:

1. Parent world replay has at least one delta before moment creation.
2. Moment creation returns reproducible tick/context linkage.
3. Fork replay contains fork world ids only and starts from tick 1.
4. Lineage endpoint for fork world returns correct parent/moment linkage.
5. Existing S-005/S-006/S-007/S-010 paths are not regressed.

## 7. Failure Handling

If any non-negotiable constraint fails:
- keep `S-013` open/claimed
- deposit an observation with concrete failing endpoint and payload
- add or boost a HOLE for deterministic fix before adding new branch features
