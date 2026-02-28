#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const gatewayPort = Number(process.env.S007_GATEWAY_PORT ?? 3103);
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const gatewayRuntimeWsUrl = `ws://127.0.0.1:${gatewayPort}/ws/runtime`;
const logDir = process.env.S007_DELTA_LOG_DIR ?? '.runtime-data/s007-log';
const worldA = process.env.S007_WORLD_A ?? 'world-alpha';
const worldB = process.env.S007_WORLD_B ?? 'world-beta';

const baseEnv = {
  ...process.env,
  GATEWAY_PORT: String(gatewayPort),
  WORLD_DELTA_LOG_DIR: logDir
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

async function waitForScopedWorldDeltas(timeoutMs) {
  return await new Promise((resolve, reject) => {
    const seen = {
      [worldA]: [],
      [worldB]: []
    };
    let settled = false;
    const sockets = [];

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      for (const socket of sockets) socket.close();
      reject(new Error('timed out waiting for scoped world deltas'));
    }, timeoutMs);

    function maybeResolve() {
      if (seen[worldA].length > 0 && seen[worldB].length > 0 && !settled) {
        settled = true;
        clearTimeout(timer);
        for (const socket of sockets) socket.close();
        resolve({
          [worldA]: seen[worldA].length,
          [worldB]: seen[worldB].length
        });
      }
    }

    function attach(worldId) {
      const socket = new WebSocket(
        `ws://127.0.0.1:${gatewayPort}/ws/world?worldId=${encodeURIComponent(worldId)}`
      );
      sockets.push(socket);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          if (payload?.type !== 'world.delta') return;
          if (payload.worldId !== worldId) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            for (const candidate of sockets) candidate.close();
            reject(
              new Error(`cross-world leak: subscription ${worldId} received ${payload.worldId}`)
            );
            return;
          }
          seen[worldId].push(payload.tick);
          maybeResolve();
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onerror = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        for (const candidate of sockets) candidate.close();
        reject(error);
      };
    }

    attach(worldA);
    attach(worldB);
  });
}

async function verifyReplay(worldId) {
  const response = await fetch(
    `${gatewayBaseUrl}/world/${encodeURIComponent(worldId)}/replay?sinceTick=1&limit=20`
  );
  if (!response.ok) throw new Error(`replay request failed for ${worldId}`);
  const payload = await response.json();
  const deltas = Array.isArray(payload?.deltas) ? payload.deltas : [];
  if (deltas.length === 0) {
    throw new Error(`replay is empty for ${worldId}`);
  }
  for (const delta of deltas) {
    if (delta.worldId !== worldId) {
      throw new Error(`replay cross-world leak: expected ${worldId}, got ${delta.worldId}`);
    }
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

    runStep('build signal-schema', ['--filter', '@openagentengine/signal-schema', 'build']);
    runStep('build world-model', ['--filter', '@openagentengine/world-model', 'build']);

    startProcess('gateway', ['--filter', '@openagentengine/gateway', 'dev']);
    await waitForGatewayReady(10000);

    startProcess('runtime-a', ['--filter', '@openagentengine/runtime', 'dev'], {
      GATEWAY_RUNTIME_WS_URL: gatewayRuntimeWsUrl,
      WORLD_ID: worldA,
      TICK_INTERVAL_MS: '600'
    });
    startProcess('runtime-b', ['--filter', '@openagentengine/runtime', 'dev'], {
      GATEWAY_RUNTIME_WS_URL: gatewayRuntimeWsUrl,
      WORLD_ID: worldB,
      TICK_INTERVAL_MS: '800'
    });

    const scopedCounts = await waitForScopedWorldDeltas(15000);
    const replayA = await verifyReplay(worldA);
    const replayB = await verifyReplay(worldB);

    console.log(
      `S-007 routing verified: scoped ws deltas (${worldA}:${scopedCounts[worldA]}, ${worldB}:${scopedCounts[worldB]}), replay (${worldA}:${replayA}, ${worldB}:${replayB})`
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('S-007 routing verification failed:', error);
  process.exit(1);
});
