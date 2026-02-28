# S-022 Non-filesystem Invite Store Plan (Phase 15+)

> Date: 2026-03-01
> Status: Seeded follow-up after S-021
> Depends on: S-020 contract, S-021 filesystem-backed external store, CHARTER.md

## Goal

Replace the current shared-filesystem invite store path with a true non-filesystem transactional backend while preserving the existing API and verification semantics.

## Why This Exists

S-021 decoupled invite persistence from world metadata via `WORLD_INVITE_STORE_DIR`, but it is still file-backed.
Distributed production topologies need a backend that does not depend on shared volumes.

## Scope

1. Add invite store adapter interface selection in gateway startup.
2. Implement first backend using PostgreSQL transactions (preferred).
3. Keep file-backed adapter as fallback for local/dev compatibility.
4. Preserve API contract and error codes (`invite_not_found`, `invite_expired`, `invite_exhausted`).

## Consistency Requirements

1. Concurrent cross-gateway redeem remains deterministic: statuses `[201,409]`.
2. Loser error remains `invite_exhausted` after winner commit.
3. Invite read on all gateways converges to `remainingRedemptions=0` and `canRedeem=false`.
4. Fork lineage side effects remain ordered with invite redemption commit.

## Verification Strategy

1. Add `verify:s022` that launches dual gateways against one shared external datastore.
2. Reuse S-021 scenario skeleton; switch from shared invite directory to backend DSN.
3. Extend `verify:gate` with phase-16 marker for non-filesystem backend.

## Deliverables

1. Adapter interface and backend selection wiring.
2. PostgreSQL transactional implementation (first-class path).
3. New verification script + gate phase.
4. BLACKBOARD and signal state updates for closure.

## Non-goals

1. Multi-region replication design.
2. Cross-service event choreography changes outside invite store boundary.
3. Replacing all world/moment storage in this phase.
