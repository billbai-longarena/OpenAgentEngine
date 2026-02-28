#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const gatewayPort = Number(process.env.S006_GATEWAY_PORT ?? 3102);
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const gatewayRuntimeWsUrl = `ws://127.0.0.1:${gatewayPort}/ws/runtime`;
const worldId = process.env.S006_WORLD_ID ?? 'world-0001';
const worldDeltaLogDir = process.env.S006_DELTA_LOG_DIR ?? '.runtime-data/s006-log';

const childEnv = {
  ...process.env,
  GATEWAY_PORT: String(gatewayPort),
  GATEWAY_RUNTIME_WS_URL: gatewayRuntimeWsUrl,
  WORLD_DELTA_LOG_DIR: worldDeltaLogDir
};

const children = [];

function startProcess(name, args) {
  const child = spawn('pnpm', args, {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  children.push(child);
}

function runStep(name, args) {
  const result = spawnSync('pnpm', args, { env: childEnv, stdio: 'inherit' });
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

async function waitForReplayDeltas(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(
        `${gatewayBaseUrl}/world/${worldId}/replay?sinceTick=1&limit=20`
      );
      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      const payload = await response.json();
      if (Array.isArray(payload?.deltas) && payload.deltas.length > 0) {
        return payload;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('timed out waiting for replay deltas');
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
    // Ensure replay validation reads fresh deltas from this run.
    await rm(worldDeltaLogDir, { recursive: true, force: true });

    runStep('build signal-schema', ['--filter', '@openagentengine/signal-schema', 'build']);
    runStep('build world-model', ['--filter', '@openagentengine/world-model', 'build']);
    startProcess('gateway', ['--filter', '@openagentengine/gateway', 'dev']);
    await waitForGatewayReady(10000);
    startProcess('runtime', ['--filter', '@openagentengine/runtime', 'dev']);
    const replay = await waitForReplayDeltas(12000);
    const firstTick = replay.deltas[0]?.tick;
    const lastTick = replay.deltas[replay.deltas.length - 1]?.tick;
    console.log(
      `S-006 replay verified: ${replay.deltas.length} delta(s) for ${replay.worldId} ticks ${firstTick}-${lastTick}`
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('S-006 replay verification failed:', error);
  process.exit(1);
});
