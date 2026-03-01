#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const steps = [
  {
    name: 'workspace-baseline',
    command: ['node', 'scripts/verify-workspace.mjs'],
    successMarker: 'Workspace verification passed.'
  },
  {
    name: 'phase-1-ws-flow',
    command: ['node', 'scripts/verify-s005-flow.mjs'],
    successMarker: 'S-005 flow verified'
  },
  {
    name: 'phase-2-replay',
    command: ['node', 'scripts/verify-s006-replay.mjs'],
    successMarker: 'S-006 replay verified'
  },
  {
    name: 'phase-3-routing',
    command: ['node', 'scripts/verify-s007-routing.mjs'],
    successMarker: 'S-007 routing verified'
  },
  {
    name: 'phase-4-ai-presence',
    command: ['node', 'scripts/verify-s010-ai-presence.mjs'],
    successMarker: 'S-010 ai-presence verified'
  },
  {
    name: 'phase-6-export-preserve',
    command: ['node', 'scripts/verify-s011-export-preserve.mjs'],
    successMarker: 'S-011 export-preserve verified'
  },
  {
    name: 'phase-8-moment-fork',
    command: ['node', 'scripts/verify-s013-moment-fork.mjs'],
    successMarker: 'S-013 moment/fork verified'
  },
  {
    name: 'phase-9-governance-runbook',
    command: ['node', 'scripts/verify-s014-governance-runbook.mjs'],
    successMarker: 'S-014 governance runbook verified'
  },
  {
    name: 'phase-10-governance-drift-audit',
    command: ['node', 'scripts/verify-s015-branch-protection-drift.mjs'],
    successMarker: 'S-015 branch-protection drift verified'
  },
  {
    name: 'phase-11-invite-flow',
    command: ['node', 'scripts/verify-s018-invite-flow.mjs'],
    successMarker: 'S-018 invite flow verified'
  },
  {
    name: 'phase-12-invite-store',
    command: ['node', 'scripts/verify-s019-invite-store.mjs'],
    successMarker: 'S-019 invite store verified'
  },
  {
    name: 'phase-14-isolated-storage-boundary',
    command: ['node', 'scripts/verify-s020-isolated-storage-boundary.mjs'],
    successMarker: 'S-020 isolated-storage boundary verified'
  },
  {
    name: 'phase-15-external-invite-store',
    command: ['node', 'scripts/verify-s021-external-invite-store.mjs'],
    successMarker: 'S-021 external invite store verified'
  },
  {
    name: 'phase-16-invite-store-driver-selection',
    command: ['node', 'scripts/verify-s022-driver-selection.mjs'],
    successMarker: 'S-022 invite store driver selection verified'
  }
];

function runStep(step) {
  const [cmd, ...args] = step.command;
  const startedAt = Date.now();
  const result = spawnSync(cmd, args, {
    env: process.env,
    stdio: 'inherit'
  });
  const durationMs = Date.now() - startedAt;
  if (result.status !== 0) {
    throw new Error(
      `${step.name} failed with status ${result.status ?? 'unknown'} after ${durationMs}ms`
    );
  }
  return durationMs;
}

function main() {
  const durations = [];
  const startedAt = Date.now();
  for (const step of steps) {
    console.log(`\n[quality-gate] running ${step.name} ...`);
    const durationMs = runStep(step);
    durations.push({ name: step.name, durationMs });
    console.log(
      `[quality-gate] PASS ${step.name} (${durationMs}ms) — expected marker: "${step.successMarker}"`
    );
  }
  const totalMs = Date.now() - startedAt;
  console.log('\nQuality gate passed.');
  for (const item of durations) {
    console.log(`- ${item.name}: ${item.durationMs}ms`);
  }
  console.log(`- total: ${totalMs}ms`);
}

try {
  main();
} catch (error) {
  console.error('Quality gate failed:', error);
  process.exit(1);
}
