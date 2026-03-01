#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function resolvePostgresUrl() {
  const candidates = [
    process.env.S022_POSTGRES_URL,
    process.env.WORLD_INVITE_STORE_POSTGRES_URL,
    process.env.DATABASE_URL
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function shouldRequireRuntime() {
  const raw = (process.env.S022_REQUIRE_RUNTIME ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function main() {
  const postgresUrl = resolvePostgresUrl();
  const requireRuntime = shouldRequireRuntime();
  if (postgresUrl.length === 0) {
    if (requireRuntime) {
      throw new Error(
        'S022_REQUIRE_RUNTIME is enabled, but no Postgres DSN was provided. Set S022_POSTGRES_URL (or WORLD_INVITE_STORE_POSTGRES_URL/DATABASE_URL).'
      );
    }
    console.log(
      'S-022 postgres runtime verification skipped: set S022_POSTGRES_URL (or WORLD_INVITE_STORE_POSTGRES_URL/DATABASE_URL) to run.'
    );
    return;
  }

  const runId = Date.now().toString(36);
  const env = {
    ...process.env,
    S021_INVITE_STORE_DRIVER: 'postgres',
    S021_POSTGRES_URL: postgresUrl,
    S021_GATEWAY_A_PORT: process.env.S022_GATEWAY_A_PORT ?? '3148',
    S021_GATEWAY_B_PORT: process.env.S022_GATEWAY_B_PORT ?? '3149',
    S021_PARENT_WORLD_ID: process.env.S022_PARENT_WORLD_ID ?? `world-postgres-root-${runId}`,
    S021_FORK_WORLD_PREFIX: process.env.S022_FORK_WORLD_PREFIX ?? `world-postgres-branch-${runId}`,
    S021_DELTA_LOG_DIR: process.env.S022_DELTA_LOG_DIR ?? '.runtime-data/s022-log',
    S021_METADATA_A_DIR: process.env.S022_METADATA_A_DIR ?? '.runtime-data/s022-meta-a',
    S021_METADATA_B_DIR: process.env.S022_METADATA_B_DIR ?? '.runtime-data/s022-meta-b'
  };

  const result = spawnSync('node', ['scripts/verify-s021-external-invite-store.mjs'], {
    env,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`S-022 postgres runtime scenario failed with status ${result.status ?? 'unknown'}`);
  }

  console.log('S-022 postgres runtime verified: shared Postgres invite-store backend enforces [201,409].');
}

try {
  main();
} catch (error) {
  console.error('S-022 postgres runtime verification failed:', error);
  process.exit(1);
}
