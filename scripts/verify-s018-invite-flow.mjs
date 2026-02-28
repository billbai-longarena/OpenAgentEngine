#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const gatewayPort = Number(process.env.S018_GATEWAY_PORT ?? 3108);
const runId = Date.now().toString(36);
const parentWorldId = process.env.S018_PARENT_WORLD_ID ?? `world-invite-root-${runId}`;
const forkWorldId = process.env.S018_FORK_WORLD_ID ?? `world-invite-branch-${runId}`;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
const gatewayRuntimeWsUrl = `ws://127.0.0.1:${gatewayPort}/ws/runtime`;
const logDir = process.env.S018_DELTA_LOG_DIR ?? '.runtime-data/s018-log';
const metadataDir = process.env.S018_METADATA_DIR ?? '.runtime-data/s018-meta';

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
      // keep polling
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
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`timed out waiting for replay deltas in ${worldId}`);
}

async function createMoment(worldId) {
  const response = await fetch(`${gatewayBaseUrl}/world/${encodeURIComponent(worldId)}/moments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seedContext: 's018.crystallize' })
  });
  if (!response.ok) {
    throw new Error(`moment create failed with status ${response.status}`);
  }
  return await response.json();
}

async function createInvite(parentWorldIdInput, momentId) {
  const response = await fetch(`${gatewayBaseUrl}/world/${encodeURIComponent(parentWorldIdInput)}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      momentId,
      maxRedemptions: 1,
      ttlMinutes: 30,
      forkOnRedeem: true,
      seedContext: 's018.invite'
    })
  });
  if (!response.ok) {
    throw new Error(`invite create failed with status ${response.status}`);
  }
  return await response.json();
}

async function redeemInvite(inviteId, redeemForkWorldId) {
  const response = await fetch(`${gatewayBaseUrl}/invite/${encodeURIComponent(inviteId)}/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ forkWorldId: redeemForkWorldId })
  });
  if (!response.ok) {
    throw new Error(`invite redeem failed with status ${response.status}`);
  }
  return await response.json();
}

async function redeemInviteResult(inviteId, redeemForkWorldId) {
  const response = await fetch(`${gatewayBaseUrl}/invite/${encodeURIComponent(inviteId)}/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ forkWorldId: redeemForkWorldId })
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

async function verifyConcurrentRedeem(inviteId, forkWorldPrefix) {
  const [left, right] = await Promise.all([
    redeemInviteResult(inviteId, `${forkWorldPrefix}-left`),
    redeemInviteResult(inviteId, `${forkWorldPrefix}-right`)
  ]);

  const statuses = [left.status, right.status].sort((a, b) => a - b);
  if (statuses[0] !== 201 || statuses[1] !== 409) {
    throw new Error(
      `expected concurrent redeem statuses [201,409], got [${left.status},${right.status}]`
    );
  }

  const exhausted = left.status === 409 ? left : right;
  if (exhausted.payload?.error !== 'invite_exhausted') {
    throw new Error(
      `expected concurrent redeem 409 payload error invite_exhausted, got ${exhausted.payload?.error}`
    );
  }

  const success = left.status === 201 ? left : right;
  return success.payload;
}

async function expectInviteExhausted(inviteId) {
  const response = await fetch(`${gatewayBaseUrl}/invite/${encodeURIComponent(inviteId)}/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  if (response.status !== 409) {
    throw new Error(`expected invite exhaustion status 409, got ${response.status}`);
  }
  const payload = await response.json();
  if (payload?.error !== 'invite_exhausted') {
    throw new Error(`expected invite_exhausted error, got ${payload?.error}`);
  }
}

async function fetchInvite(inviteId) {
  const response = await fetch(`${gatewayBaseUrl}/invite/${encodeURIComponent(inviteId)}`);
  if (!response.ok) throw new Error(`invite read failed with status ${response.status}`);
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
    const invite = await createInvite(parentWorldId, moment.momentId);
    const redeemed = await redeemInvite(invite.inviteId, forkWorldId);
    const lineage = await verifyLineage(forkWorldId, parentWorldId, moment.momentId);
    const forkReplayCount = await verifyForkReplay(forkWorldId);
    const inviteState = await fetchInvite(invite.inviteId);
    const concurrentInvite = await createInvite(parentWorldId, moment.momentId);
    const concurrentRedeemed = await verifyConcurrentRedeem(
      concurrentInvite.inviteId,
      `${forkWorldId}-concurrent`
    );
    const concurrentLineage = await verifyLineage(
      concurrentRedeemed.worldId,
      parentWorldId,
      moment.momentId
    );
    const concurrentForkReplayCount = await verifyForkReplay(concurrentRedeemed.worldId);
    const concurrentInviteState = await fetchInvite(concurrentInvite.inviteId);

    if (!redeemed?.forked) {
      throw new Error(`expected redeem response to be forked=true, got ${JSON.stringify(redeemed)}`);
    }
    if (redeemed?.worldId !== forkWorldId) {
      throw new Error(`redeem world mismatch: expected ${forkWorldId}, got ${redeemed?.worldId}`);
    }
    if (inviteState?.remainingRedemptions !== 0) {
      throw new Error(`invite remaining redemptions mismatch: expected 0, got ${inviteState?.remainingRedemptions}`);
    }
    if (inviteState?.canRedeem !== false) {
      throw new Error(`invite canRedeem expected false, got ${inviteState?.canRedeem}`);
    }
    if (concurrentInviteState?.remainingRedemptions !== 0) {
      throw new Error(
        `concurrent invite remaining redemptions mismatch: expected 0, got ${concurrentInviteState?.remainingRedemptions}`
      );
    }
    if (concurrentInviteState?.canRedeem !== false) {
      throw new Error(
        `concurrent invite canRedeem expected false, got ${concurrentInviteState?.canRedeem}`
      );
    }

    await expectInviteExhausted(invite.inviteId);

    console.log(
      `S-018 invite flow verified: parent_replay=${parentReplay.length} moment_tick=${moment.tick} invite=${invite.inviteId} redeemed_world=${redeemed.worldId} remaining=${inviteState.remainingRedemptions} inherited=${lineage.inheritedDeltas} fork_replay=${forkReplayCount} concurrent_redeemed_world=${concurrentRedeemed.worldId} concurrent_inherited=${concurrentLineage.inheritedDeltas} concurrent_fork_replay=${concurrentForkReplayCount}`
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('S-018 invite flow verification failed:', error);
  process.exit(1);
});
