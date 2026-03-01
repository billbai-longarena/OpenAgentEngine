#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const gatewayAPort = Number(process.env.S019_GATEWAY_A_PORT ?? 3118);
const gatewayBPort = Number(process.env.S019_GATEWAY_B_PORT ?? 3119);
const runId = Date.now().toString(36);
const parentWorldId = process.env.S019_PARENT_WORLD_ID ?? `world-invite-store-root-${runId}`;
const forkWorldPrefix = process.env.S019_FORK_WORLD_PREFIX ?? `world-invite-store-branch-${runId}`;
const metadataDir = process.env.S019_METADATA_DIR ?? '.runtime-data/s019-meta';
const logDir = process.env.S019_DELTA_LOG_DIR ?? '.runtime-data/s019-log';
const redeemRaceDelayMs = process.env.S019_REDEEM_RACE_DELAY_MS ?? '150';

const gatewayABaseUrl = `http://127.0.0.1:${gatewayAPort}`;
const gatewayBBaseUrl = `http://127.0.0.1:${gatewayBPort}`;
const gatewayARuntimeWsUrl = `ws://127.0.0.1:${gatewayAPort}/ws/runtime`;

const baseEnv = {
  ...process.env,
  WORLD_DELTA_LOG_DIR: logDir,
  WORLD_METADATA_DIR: metadataDir,
  WORLD_INVITE_REDEEM_RACE_DELAY_MS: redeemRaceDelayMs
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

async function waitForGatewayReady(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`gateway health check timed out: ${baseUrl}`);
}

async function waitForReplayCount(baseUrl, worldId, minimum, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(
        `${baseUrl}/world/${encodeURIComponent(worldId)}/replay?sinceTick=1&limit=200`
      );
      if (!response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      const payload = await response.json();
      const deltas = Array.isArray(payload?.deltas) ? payload.deltas : [];
      if (deltas.length >= minimum) return deltas;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for replay deltas in ${worldId}`);
}

async function createMoment(baseUrl, worldId) {
  const response = await fetch(`${baseUrl}/world/${encodeURIComponent(worldId)}/moments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seedContext: 's019.crystallize' })
  });
  if (!response.ok) {
    throw new Error(`moment create failed with status ${response.status}`);
  }
  return await response.json();
}

async function createInvite(baseUrl, worldId, momentId) {
  const response = await fetch(`${baseUrl}/world/${encodeURIComponent(worldId)}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      momentId,
      maxRedemptions: 1,
      ttlMinutes: 30,
      forkOnRedeem: true,
      seedContext: 's019.invite'
    })
  });
  if (!response.ok) {
    throw new Error(`invite create failed with status ${response.status}`);
  }
  return await response.json();
}

async function redeemInviteResult(baseUrl, inviteId, forkWorldId) {
  const response = await fetch(`${baseUrl}/invite/${encodeURIComponent(inviteId)}/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ forkWorldId })
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

async function fetchInvite(baseUrl, inviteId) {
  const response = await fetch(`${baseUrl}/invite/${encodeURIComponent(inviteId)}`);
  if (!response.ok) {
    throw new Error(`invite read failed with status ${response.status}`);
  }
  return await response.json();
}

async function verifyLineage(baseUrl, worldId, expectedParent, expectedMomentId) {
  const response = await fetch(`${baseUrl}/world/${encodeURIComponent(worldId)}/lineage`);
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

async function verifyForkReplay(baseUrl, worldId) {
  const response = await fetch(
    `${baseUrl}/world/${encodeURIComponent(worldId)}/replay?sinceTick=1&limit=100`
  );
  if (!response.ok) throw new Error(`fork replay request failed for ${worldId}`);
  const payload = await response.json();
  const deltas = Array.isArray(payload?.deltas) ? payload.deltas : [];
  if (deltas.length === 0) throw new Error(`fork replay is empty for ${worldId}`);
  return deltas.length;
}

async function expectInviteExhausted(baseUrl, inviteId) {
  const response = await fetch(`${baseUrl}/invite/${encodeURIComponent(inviteId)}/redeem`, {
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

    startProcess('gateway-a', ['--filter', '@openagentengine/gateway', 'dev'], {
      GATEWAY_PORT: String(gatewayAPort)
    });
    startProcess('gateway-b', ['--filter', '@openagentengine/gateway', 'dev'], {
      GATEWAY_PORT: String(gatewayBPort)
    });
    await waitForGatewayReady(gatewayABaseUrl, 12000);
    await waitForGatewayReady(gatewayBBaseUrl, 12000);

    startProcess('runtime-parent', ['--filter', '@openagentengine/runtime', 'dev'], {
      GATEWAY_RUNTIME_WS_URL: gatewayARuntimeWsUrl,
      WORLD_ID: parentWorldId,
      TICK_INTERVAL_MS: '500'
    });

    const parentReplay = await waitForReplayCount(gatewayABaseUrl, parentWorldId, 2, 12000);
    const moment = await createMoment(gatewayABaseUrl, parentWorldId);
    const invite = await createInvite(gatewayABaseUrl, parentWorldId, moment.momentId);

    const [left, right] = await Promise.all([
      redeemInviteResult(gatewayABaseUrl, invite.inviteId, `${forkWorldPrefix}-a`),
      redeemInviteResult(gatewayBBaseUrl, invite.inviteId, `${forkWorldPrefix}-b`)
    ]);
    const statuses = [left.status, right.status].sort((a, b) => a - b);
    if (statuses[0] !== 201 || statuses[1] !== 409) {
      throw new Error(`expected concurrent redeem statuses [201,409], got [${left.status},${right.status}]`);
    }
    const winner = left.status === 201 ? left : right;
    const loser = left.status === 409 ? left : right;
    if (loser.payload?.error !== 'invite_exhausted') {
      throw new Error(`expected concurrent loser to be invite_exhausted, got ${loser.payload?.error}`);
    }
    const winnerWorldId = winner.payload?.worldId;
    if (typeof winnerWorldId !== 'string' || winnerWorldId.length === 0) {
      throw new Error(`winner payload missing worldId: ${JSON.stringify(winner.payload)}`);
    }

    const lineageA = await verifyLineage(gatewayABaseUrl, winnerWorldId, parentWorldId, moment.momentId);
    const lineageB = await verifyLineage(gatewayBBaseUrl, winnerWorldId, parentWorldId, moment.momentId);
    const replayA = await verifyForkReplay(gatewayABaseUrl, winnerWorldId);
    const replayB = await verifyForkReplay(gatewayBBaseUrl, winnerWorldId);
    const inviteStateA = await fetchInvite(gatewayABaseUrl, invite.inviteId);
    const inviteStateB = await fetchInvite(gatewayBBaseUrl, invite.inviteId);

    if (inviteStateA?.remainingRedemptions !== 0 || inviteStateB?.remainingRedemptions !== 0) {
      throw new Error(
        `remaining redemptions mismatch: gateway-a=${inviteStateA?.remainingRedemptions} gateway-b=${inviteStateB?.remainingRedemptions}`
      );
    }
    if (inviteStateA?.canRedeem !== false || inviteStateB?.canRedeem !== false) {
      throw new Error(`invite canRedeem expected false on both gateways`);
    }
    if (lineageA.inheritedDeltas !== lineageB.inheritedDeltas) {
      throw new Error(
        `lineage inherited mismatch between gateways: a=${lineageA.inheritedDeltas} b=${lineageB.inheritedDeltas}`
      );
    }

    await expectInviteExhausted(gatewayABaseUrl, invite.inviteId);

    console.log(
      `S-019 invite store verified: parent_replay=${parentReplay.length} invite=${invite.inviteId} winner_world=${winnerWorldId} statuses=${left.status}/${right.status} inherited=${lineageA.inheritedDeltas} replay_a=${replayA} replay_b=${replayB}`
    );
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error('S-019 invite store verification failed:', error);
  process.exit(1);
});
