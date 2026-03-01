# S-020 External Invite Store Contract (Phase 14)

> Date: 2026-03-01  
> Status: Active contract for multi-region consistency design  
> Source signals: S-003 (worldview authority), S-019 (shared-path hardening), S-020 (external store contract)  
> Depends on: CHARTER.md, docs/plans/2026-02-28-s004-scaffold-contract.md

## 1. Purpose

Define the storage contract needed to preserve invite redeem correctness when gateways do not share the same `WORLD_METADATA_DIR` filesystem.

S-019 solved cross-instance races on a shared storage root via lock files + atomic writes.  
S-020 defines the next contract boundary so invite consistency survives:

- multi-region deployment
- isolated node-local volumes
- independently scaled gateway pools

## 2. Non-Negotiable Consistency Rules

1. Single-use invite cannot be redeemed twice.
- For `maxRedemptions=1`, concurrent redeem attempts must produce exactly one success and one deterministic failure.
- Failure code must remain stable (`invite_exhausted` after winning commit is visible).

2. Expiry and counter checks are atomic.
- `expiresAt` validation and `redemptionCount` increment must be performed in one transaction boundary.
- No read-modify-write sequence may be split across independent non-transactional calls.

3. Read-your-write visibility across gateway nodes.
- After successful redeem, all gateways must observe updated invite state (`remainingRedemptions=0`, `canRedeem=false`) within bounded propagation.

4. Fork lineage write and invite counter write are ordered.
- Successful redeem may create fork lineage.
- Invite counter commit must not be lost if lineage write succeeds, and vice versa (all-or-nothing semantics for redeem side effects).

5. Stable API behavior.
- Existing API surface and machine-readable error codes must remain backward compatible for clients.

## 3. Store Adapter Contract

Gateway invite persistence must be abstracted behind a store adapter with explicit transactional operation:

`redeemInviteAtomic(input) -> { outcome, invite, optionalForkPlan }`

Required input fields:

- `inviteId`
- `nowEpochMs`
- `requestedForkWorldId` (optional)
- `requestId` (for idempotency and traceability)

Required outcomes:

- `success` with updated invite state and deterministic fork plan
- `invite_not_found`
- `invite_expired`
- `invite_exhausted`
- `conflict_retryable` (optional internal class, never leaked directly)

Adapter guarantees:

- Optimistic CAS (`version`) or pessimistic row lock (`SELECT ... FOR UPDATE`) is mandatory.
- Operation is retry-safe under transient contention.
- Idempotency key support is strongly recommended for at-least-once delivery environments.

## 4. Candidate Backends

First production-ready backend should be one of:

1. SQLite (shared file + WAL) with transaction boundary around redeem
2. PostgreSQL with row-level locks
3. Redis + Lua script (single atomic script for check+increment+expiry)

Selection criteria:

- deterministic atomicity under concurrent writers
- operational simplicity for early deployment
- compatibility with existing gateway runtime constraints

## 5. Verification Matrix

Required verification scenarios:

1. Shared storage root (already covered by S-019):
- concurrent cross-gateway redeem returns `[201,409]`

2. Isolated storage roots boundary (added in S-020):
- separate `WORLD_METADATA_DIR` per gateway reveals partitioned invite state
- expected current behavior is `[201,404]` (`invite_not_found` on isolated peer)
- script: `node scripts/verify-s020-isolated-storage-boundary.mjs`

3. Future external store target:
- isolated gateways configured to same external datastore must return `[201,409]`
- this scenario gates closure of follow-up implementation signal

## 6. Deliverables for S-020 Closure

S-020 is complete when:

1. This contract is published.
2. Isolated storage boundary verification exists and passes.
3. Quality gate includes S-020 verification signal marker.
4. BLACKBOARD and active signal reflect the new boundary and next execution hint.

## 7. Explicit Non-Goals

- Implementing the full external datastore adapter in this phase.
- Introducing cross-region replication strategy details.
- Defining final production SLOs for consistency latency.

These are follow-up execution tasks after contract acceptance.

## 8. Handoff to Next Worker

Next implementation signal should:

1. Choose one concrete backend from section 4.
2. Implement adapter + migration path from file invites.
3. Upgrade cross-gateway isolated-root scenario from `[201,404]` to `[201,409]`.
4. Preserve existing S-018/S-019 markers and client-visible error contract.
