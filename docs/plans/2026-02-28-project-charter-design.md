# Design: Project Charter (CHARTER.md)

> Date: 2026-02-28
> Status: Approved
> Author: [termite:2026-02-28:scout] + human founder

## Problem

The Termite Protocol provides three information layers:
- Protocol (P0): how to collaborate (universal)
- Entry (P1): project quick reference
- State (P2): what's happening now (dynamic)

Missing: a layer for **project-specific permanent beliefs and design principles** — who we are, what we build, why we make certain choices. The founding vision (S-002) was stored as a signal that would decay, which is inappropriate for permanent identity.

## Decision

Create `CHARTER.md` at P1 protection level (append-only) as the project's permanent identity anchor. Structure: layered hierarchy with numbered principles for easy reference.

## Structure

1. **Identity (C-001 to C-004)** — who we are, who we're not
2. **Three Mounds (C-010 to C-032)** — instantiation of the protocol's three-mound model
   - Dev Mound: AI termites + human developers
   - Product Mound: engineAI (runtime AI agent)
   - Customer Mound: non-technical game lovers
3. **Design Principles (C-100 to C-304)**
   - 3a. Product Principles (C-100 to C-104): user experience standards
   - 3b. Technical Principles (C-200 to C-204): architecture constraints
   - 3c. engineAI Principles (C-300 to C-304): runtime AI behavior

## Reading Mechanism (Layered Transmission)

Charter principles reach termites through a three-tier mechanism that respects
the protocol's "termites are blind, context is limited" principle:

```
Tier 1: Charter Soul (~5 lines)    → embedded in CLAUDE.md / AGENTS.md project overview
        Every termite reads this      Already in the arrive flow, zero extra cost

Tier 2: Relevant principles (on demand) → triggered by soul's pointer: "making design decisions → read CHARTER.md"
        Only scouts/architects need      Same pattern as "caste question → read TERMITE_PROTOCOL.md Part III"

Tier 3: Full charter (reference)    → CHARTER.md full text
        For humans and audits          P1 protected, not consumed at runtime
```

Why NOT convert to rules: Charter principles are identity/values, not trigger-action pairs.
They should never be disputed or archived. Shoehorning them into rule format is a category error.

Why NOT modify field-arrive.sh: It's a protocol-level script. If the charter pattern proves
valuable, it should be proposed back via O-001 audit, not hacked in locally.

## Integration

- Charter soul embedded in CLAUDE.md and AGENTS.md project overview sections
- Charter referenced from lookup tables in both entry files
- O-001 observation recorded: protocol gap for "project charter" concept
- S-002 founding vision signal remains as historical record

## Principle Count

- 4 identity principles
- 9 three-mound principles
- 10 design principles (5 product + 5 technical + 5 engineAI)
- Total: 23 principles
