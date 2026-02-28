#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';

const gatewayPort = Number(process.env.S010_GATEWAY_PORT ?? 3104);
const aiPort = Number(process.env.S010_AI_PORT ?? 8101);
const worldId = process.env.S010_WORLD_ID ?? 'world-0100';

const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const aiBaseUrl = `http://127.0.0.1:${aiPort}`;
const gatewayRuntimeWsUrl = `ws://127.0.0.1:${gatewayPort}/ws/runtime`;
const gatewayWorldWsBase = `ws://127.0.0.1:${gatewayPort}/ws/world`;

const baseEnv = {
  ...process.env,
  GATEWAY_PORT: String(gatewayPort),
  GATEWAY_RUNTIME_WS_URL: gatewayRuntimeWsUrl,
  WORLD_ID: worldId,
  DEFAULT_WORLD_ID: worldId,
  PRESENCE_WORLD_IDS: worldId,
  GATEWAY_WORLD_WS_BASE: gatewayWorldWsBase,
  PRESENCE_RETRY_MS: '500',
  TICK_INTERVAL_MS: process.env.S010_TICK_INTERVAL_MS ?? '500'
};

const children = [];

function startPnpmProcess(name, args, extraEnv = {}) {
  const child = spawn('pnpm', args, {
    env: { ...baseEnv, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  children.push(child);
  return child;
}

function startProcess(name, cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    env: { ...baseEnv, ...(options.extraEnv ?? {}) },
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  children.push(child);
  return child;
}

function runStep(name, args) {
  const result = spawnSync('pnpm', args, {
    env: baseEnv,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed with status ${result.status ?? 'unknown'}`);
  }
}

async function waitForHttpOk(url, label, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} health check timed out`);
}

async function waitForPresenceDelta(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${aiBaseUrl}/presence/state/${encodeURIComponent(worldId)}`);
      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      const payload = await response.json();
      if (
        payload?.connection_status === 'connected' &&
        Number(payload?.last_tick ?? 0) >= 1 &&
        Number(payload?.total_deltas ?? 0) >= 1
      ) {
        return payload;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('timed out waiting for ai-presence world.delta consumption');
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
    runStep('build signal-schema', ['--filter', '@openagentengine/signal-schema', 'build']);
    runStep('build world-model', ['--filter', '@openagentengine/world-model', 'build']);

    startPnpmProcess('gateway', ['--filter', '@openagentengine/gateway', 'dev']);
    await waitForHttpOk(`${gatewayBaseUrl}/health`, 'gateway', 10000);

    startProcess(
      'ai-presence',
      'python3',
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(aiPort)],
      { cwd: 'apps/ai-presence' }
    );
    await waitForHttpOk(`${aiBaseUrl}/health`, 'ai-presence', 10000);

    startPnpmProcess('runtime', ['--filter', '@openagentengine/runtime', 'dev']);

    const state = await waitForPresenceDelta(15000);
    console.log(
      `S-010 ai-presence verified: world=${worldId} tick=${state.last_tick} deltas=${state.total_deltas} role=${state.role} status=${state.connection_status}`
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('S-010 ai-presence verification failed:', error);
  process.exit(1);
});
