#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const gatewayPort = Number(process.env.S013_GATEWAY_PORT ?? 3106);
const runId = Date.now().toString(36);
const parentWorldId = process.env.S013_PARENT_WORLD_ID ?? `world-root-${runId}`;
const forkWorldId = process.env.S013_FORK_WORLD_ID ?? `world-branch-${runId}`;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const gatewayRuntimeWsUrl = `ws://127.0.0.1:${gatewayPort}/ws/runtime`;
const logDir = process.env.S013_DELTA_LOG_DIR ?? '.runtime-data/s013-log';
const metadataDir = process.env.S013_METADATA_DIR ?? '.runtime-data/s013-meta';

const baseEnv = {
  ...process.env,
  GATEWAY_PORT: String(gatewayPort),
  WORLD_DELTA_LOG_DIR: logDir,
  WORLD_METADATA_DIR: metadataDir
};

const children = [];

function startProcess(name, args, extraEnv = {}) {
  const child = spawn('pnpm', args, {
    env: { ...baseEnv, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  children.push(child);
}

function runStep(name, args) {
  const result = spawnSync('pnpm', args, { env: baseEnv, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${name} failed with status ${result.status ?? 'unknown'}`);
  }
}

async function waitForGatewayReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${gatewayBaseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('gateway health check timed out');
}

async function waitForReplayCount(worldId, minimum, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(
        `${gatewayBaseUrl}/world/${encodeURIComponent(worldId)}/replay?sinceTick=1&limit=100`
      );
      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      const payload = await response.json();
      const deltas = Array.isArray(payload?.deltas) ? payload.deltas : [];
      if (deltas.length >= minimum) return deltas;
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`timed out waiting for replay deltas in ${worldId}`);
}

async function createMoment(worldId) {
  const response = await fetch(`${gatewayBaseUrl}/world/${encodeURIComponent(worldId)}/moments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seedContext: 's013.crystallize' })
  });
  if (!response.ok) {
    throw new Error(`moment create failed with status ${response.status}`);
  }
  return await response.json();
}

async function createFork(parentWorld, momentId, forkWorld) {
  const response = await fetch(`${gatewayBaseUrl}/world/${encodeURIComponent(parentWorld)}/forks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ momentId, forkWorldId: forkWorld, seedContext: 's013.fork' })
  });
  if (!response.ok) {
    throw new Error(`fork create failed with status ${response.status}`);
  }
  return await response.json();
}

async function verifyLineage(worldId, expectedParent, expectedMomentId) {
  const response = await fetch(`${gatewayBaseUrl}/world/${encodeURIComponent(worldId)}/lineage`);
  if (!response.ok) throw new Error(`lineage request failed for ${worldId}`);
  const payload = await response.json();
  const lineage = payload?.lineage;
  if (!lineage) throw new Error(`lineage missing for ${worldId}`);
  if (lineage.parentWorldId !== expectedParent) {
    throw new Error(`lineage parent mismatch: expected ${expectedParent}, got ${lineage.parentWorldId}`);
  }
  if (lineage.fromMomentId !== expectedMomentId) {
    throw new Error(`lineage moment mismatch: expected ${expectedMomentId}, got ${lineage.fromMomentId}`);
  }
  return lineage;
}

async function verifyForkReplay(worldId) {
  const response = await fetch(
    `${gatewayBaseUrl}/world/${encodeURIComponent(worldId)}/replay?sinceTick=1&limit=100`
  );
  if (!response.ok) throw new Error(`fork replay request failed for ${worldId}`);
  const payload = await response.json();
  const deltas = Array.isArray(payload?.deltas) ? payload.deltas : [];
  if (deltas.length === 0) throw new Error(`fork replay is empty for ${worldId}`);
  for (const delta of deltas) {
    if (delta.worldId !== worldId) {
      throw new Error(`fork replay world mismatch: expected ${worldId}, got ${delta.worldId}`);
    }
  }
  if (deltas[0].tick !== 1) {
    throw new Error(`fork replay expected tick to start at 1, got ${deltas[0].tick}`);
  }
  return deltas.length;
}

async function cleanup() {
  for (const child of children) {
    if (!child.killed) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  }
}

async function main() {
  try {
    await rm(logDir, { recursive: true, force: true });
    await rm(metadataDir, { recursive: true, force: true });

    runStep('build signal-schema', ['--filter', '@openagentengine/signal-schema', 'build']);
    runStep('build world-model', ['--filter', '@openagentengine/world-model', 'build']);

    startProcess('gateway', ['--filter', '@openagentengine/gateway', 'dev']);
    await waitForGatewayReady(10000);

    startProcess('runtime-parent', ['--filter', '@openagentengine/runtime', 'dev'], {
      GATEWAY_RUNTIME_WS_URL: gatewayRuntimeWsUrl,
      WORLD_ID: parentWorldId,
      TICK_INTERVAL_MS: '500'
    });

    const parentReplay = await waitForReplayCount(parentWorldId, 2, 12000);
    const moment = await createMoment(parentWorldId);
    const fork = await createFork(parentWorldId, moment.momentId, forkWorldId);
    const lineage = await verifyLineage(forkWorldId, parentWorldId, moment.momentId);
    const forkReplayCount = await verifyForkReplay(forkWorldId);

    console.log(
      `S-013 moment/fork verified: parent_replay=${parentReplay.length} moment_tick=${moment.tick} fork=${fork.forkWorldId} inherited=${lineage.inheritedDeltas} fork_replay=${forkReplayCount}`
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('S-013 moment/fork verification failed:', error);
  process.exit(1);
});
