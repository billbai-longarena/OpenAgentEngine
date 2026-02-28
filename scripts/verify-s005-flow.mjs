#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';

const gatewayPort = Number(process.env.S005_GATEWAY_PORT ?? 3101);
const gatewayWsWorldUrl = `ws://127.0.0.1:${gatewayPort}/ws/world`;
const gatewayRuntimeWsUrl = `ws://127.0.0.1:${gatewayPort}/ws/runtime`;

const childEnv = {
  ...process.env,
  GATEWAY_PORT: String(gatewayPort),
  GATEWAY_RUNTIME_WS_URL: gatewayRuntimeWsUrl
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
  return child;
}

function runStep(name, args) {
  const result = spawnSync('pnpm', args, {
    env: childEnv,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed with status ${result.status ?? 'unknown'}`);
  }
}

async function waitForGatewayReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('gateway health check timed out');
}

async function waitForWorldDelta(timeoutMs) {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(gatewayWsWorldUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('timed out waiting for world.delta'));
    }, timeoutMs);

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload?.type === 'world.delta') {
          clearTimeout(timer);
          socket.close();
          resolve(payload);
        }
      } catch {
        // Ignore non-JSON frames.
      }
    };

    socket.onerror = (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    };
  });
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
    startProcess('gateway', ['--filter', '@openagentengine/gateway', 'dev']);
    await waitForGatewayReady(10000);
    startProcess('runtime', ['--filter', '@openagentengine/runtime', 'dev']);

    const delta = await waitForWorldDelta(12000);
    console.log(
      `S-005 flow verified: world.delta received for world=${delta.worldId} tick=${delta.tick}`
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('S-005 flow verification failed:', error);
  process.exit(1);
});
