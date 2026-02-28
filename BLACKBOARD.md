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

## Hotspot Areas

(none — `S-008` quality gate and `S-009` CI wiring are implemented)

## Notes for AI

- This is a greenfield project. Everything needs to be built from scratch.
- **Read `CHARTER.md` for project identity and design principles (now 33 principles, C-xxx numbered).**
- **Read `docs/plans/2026-02-28-worldview-design.md` for the worldview design** — the conceptual shift from "game engine" to "world substrate."
- **Read `docs/plans/2026-02-28-tech-stack-architecture.md` for v0 stack and system boundary decisions** before scaffolding runtime code.
- **For S-004/S-005/S-006/S-007/S-008/S-009 implementation, enforce `docs/plans/2026-02-28-s004-scaffold-contract.md`** to keep phase handoff aligned with worldview constraints.
- **Signal precedence**: if wording in S-002 (founding vision) conflicts with S-003/CHARTER worldview extensions, use S-003 + CHARTER as current authority.
- Core terminology shift: "Game" → "World", "Player" → "Inhabitant", "Create" → "Inhabit/Shape", "Share" → "Invite", "engineAI" → "AI Presence"
- The founding vision prioritizes people who love interactive experiences — they inhabit worlds, not "play games."
- AI is a fluid presence (not a fixed assistant): physics → conversationalist → craftsman → curator, role driven by behavioral signals.
- Core loop: Inhabit → Shape → Resonate → Invite (NO mode switches).
- Three-mound isomorphism (C-400): the same signal-driven adaptive pattern runs at dev, product, and customer scales.
- O-001 recorded: Termite Protocol lacks a "project charter" concept — to be submitted for protocol audit later.

## Known Limitations

- Phase-0 through phase-5 baselines are implemented; `S-009` is done and verified locally.
- Local and CI quality gate are both wired via `pnpm run verify:gate`; branch protection policy is not enforced in repository settings yet.
- `termite-db-export.sh` currently exports only schema-mapped fields; extra narrative YAML keys can be dropped if not preserved in DB/docs.

## Immune Log

(none)
