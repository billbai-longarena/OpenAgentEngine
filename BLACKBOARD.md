# BLACKBOARD.md — OpenAgentEngine

> Genesis: 2026-02-28. OpenAgentEngine - A world substrate for AI and human co-inhabitation.

## Project Summary

- **Type**: World Substrate (AI-Human Collaborative) — evolved from "Game Engine" concept
- **Core Concept**: OpenAgentEngine is a world substrate — it provides the foundation for continuously evolving, inhabitable worlds where humans and AI co-exist. The fundamental unit is "World" (a signal ecosystem), not "Game" (a discrete artifact). See C-005.
- **Target Users**: People who love interactive experiences. They inhabit worlds, shape them through their presence, crystallize resonant moments, and invite others in. They don't need to understand how the system works. See C-030, C-033.
- **AI Integration**: AI is a fluid Presence in every world — invisible as physics when users are immersed, visible as a conversational partner when they pause, a craftsman when they shape with intent. Role transitions are signal-driven. See C-305, C-306.
- **Core Loop**: Inhabit → Shape → Resonate → Invite (no mode switches). See C-033, C-034.
- **Design Philosophy**: Same signal-driven adaptive pattern operates at every scale (three-mound isomorphism). See C-400, C-401.
- **Worldview Design**: `docs/plans/2026-02-28-worldview-design.md` — comprehensive design rationale for the shift from "game engine" to "world substrate."
- **Tech Stack & Architecture Baseline**: `docs/plans/2026-02-28-tech-stack-architecture.md` — v0 stack decisions and phased execution path (signal S-001).

## Colony Health

| Dimension | Status | Trend | Last Verified |
|-----------|--------|-------|---------------|
| Build     | ?      | —     | unverified    |
| Tests     | ?      | —     | unverified    |
| Docs      | baseline established | ↑ | 2026-02-28 |

## Signals

| ID | Type | Title | Weight | TTL | Status | Owner |
|----|------|-------|--------|-----|--------|-------|
| S-001 | EXPLORE | Map project structure, establish tech stack | 20 | 14 | done | codex-scout-s001 |
| S-002 | PHEROMONE | Founding Vision — project identity and design principles | 84 | 90 | open | unassigned |
| S-003 | PHEROMONE | Worldview Design — from game engine to world substrate | 88 | 90 | open | unassigned |
| S-004 | HOLE | Scaffold phase-0 monorepo and baseline services | 30 | 14 | done | codex-worker-s004 |
| S-005 | HOLE | Implement phase-1 runtime loop + WS delta flow | 68 | 14 | done | codex-heartbeat |
| S-006 | HOLE | Implement phase-2 world delta persistence and replay baseline | 66 | 14 | done | codex-heartbeat |
| S-007 | HOLE | Implement phase-3 multi-world routing and world-scoped WS channels | 64 | 14 | done | codex-heartbeat |
| S-008 | HOLE | Establish phase-4 build/test quality gate for runtime-gateway-world contracts | 62 | 14 | done | codex-worker-s008 |
| S-009 | HOLE | Wire verify:gate into CI workflow | 60 | 14 | done | codex-worker-s009 |
| S-010 | HOLE | Implement AI Presence continuous world-signal subscription baseline | 58 | 14 | done | codex-heartbeat |
| S-011 | HOLE | Preserve narrative YAML fields during DB export | 56 | 14 | done | codex-worker-s011 |
| S-012 | HOLE | Extend quality gate with S-010 and S-011 verification | 54 | 14 | done | codex-worker-s012 |
| S-013 | HOLE | Implement moment creation and world-fork lineage baseline | 52 | 14 | done | codex-worker-s013 |
| S-014 | HOLE | Define branch protection required-check policy and setup runbook | 50 | 14 | done | codex-heartbeat |
| S-015 | HOLE | Automate branch-protection drift audit against GitHub API | 50 | 14 | done | codex-worker-s015 |
| S-016 | HOLE | Enforce authenticated branch-protection drift checks in CI | 48 | 14 | done | codex-worker-s016 |
| S-017 | HOLE | Apply repository secret for S-015 live drift audit and verify first main run | 44 | 14 | done | codex-worker-s017 |
| S-018 | HOLE | Implement invite creation/redeem baseline on top of moment/fork substrate | 42 | 14 | done | codex-worker-s018 |

## Hotspot Areas

- Governance drift-audit closure evidence captured on 2026-02-28: `verify-gate` push run `22528876571` on `main` logged `S-015 ... live_check=aligned mode=required`.
- Invite baseline closure captured on 2026-03-01: `verify:s018` and `verify:gate` include phase-11 marker `S-018 invite flow verified: ...` validating create/read/redeem/fork lineage path.

## Notes for AI

- This is a greenfield project. Everything needs to be built from scratch.
- **Read `CHARTER.md` for project identity and design principles (now 33 principles, C-xxx numbered).**
- **Read `docs/plans/2026-02-28-worldview-design.md` for the worldview design** — the conceptual shift from "game engine" to "world substrate."
- **Read `docs/plans/2026-02-28-tech-stack-architecture.md` for v0 stack and system boundary decisions** before scaffolding runtime code.
- **For S-004/S-005/S-006/S-007/S-008/S-009/S-010/S-011/S-012/S-013/S-014/S-015/S-016/S-017/S-018 implementation, enforce `docs/plans/2026-02-28-s004-scaffold-contract.md`** to keep phase handoff aligned with worldview constraints.
- **For S-013 moment/fork execution details, enforce `docs/plans/2026-03-01-s013-moment-fork-contract.md`** to keep crystallize/fork semantics aligned with worldview principles.
- **For S-014 governance setup details, enforce `docs/plans/2026-03-01-s014-branch-protection-runbook.md`** before touching repository branch-protection settings.
- **Signal precedence**: if wording in S-002 (founding vision) conflicts with S-003/CHARTER worldview extensions, use S-003 + CHARTER as current authority.
- Core terminology shift: "Game" → "World", "Player" → "Inhabitant", "Create" → "Inhabit/Shape", "Share" → "Invite", "engineAI" → "AI Presence"
- The founding vision prioritizes people who love interactive experiences — they inhabit worlds, not "play games."
- AI is a fluid presence (not a fixed assistant): physics → conversationalist → craftsman → curator, role driven by behavioral signals.
- Core loop: Inhabit → Shape → Resonate → Invite (NO mode switches).
- Three-mound isomorphism (C-400): the same signal-driven adaptive pattern runs at dev, product, and customer scales.
- O-001 recorded: Termite Protocol lacks a "project charter" concept — to be submitted for protocol audit later.

## Known Limitations

- Phase-0 through phase-13 baselines are implemented; `S-018` invite create/redeem flow is done and quality-gated.
- Branch protection and drift-audit credentials are configured; continue monitoring `verify:gate` for future context drift.
- DB export currently preserves key narrative blocks (`signals.vision/description`, `observations.detail`); additional custom fields still require allowlist extension if introduced.
- Local and CI quality gate are both wired via `pnpm run verify:gate`.
- Invite redemption persistence is file-based; concurrent redeem race hardening (atomic counter/CAS) remains a follow-up item.

## Immune Log

(none)
