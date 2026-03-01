#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function runGatewayWithDriver(driver) {
  return spawnSync('pnpm', ['--filter', '@openagentengine/gateway', 'exec', 'tsx', 'src/index.ts'], {
    env: {
      ...process.env,
      GATEWAY_PORT: process.env.S022_VERIFY_GATEWAY_PORT ?? '0',
      WORLD_INVITE_STORE_DRIVER: driver
    },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
}

function assertDriverFailsFast(driver, expectedText) {
  const result = runGatewayWithDriver(driver);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0) {
    throw new Error(
      `expected driver "${driver}" to fail fast, but process exited 0\noutput:\n${output}`
    );
  }
  if (!output.includes(expectedText)) {
    throw new Error(
      `expected output for driver "${driver}" to include "${expectedText}"\noutput:\n${output}`
    );
  }
}

function main() {
  assertDriverFailsFast(
    'postgres',
    'WORLD_INVITE_STORE_DRIVER=postgres requires WORLD_INVITE_STORE_POSTGRES_URL or DATABASE_URL.'
  );
  assertDriverFailsFast('invalid-driver', 'Unsupported WORLD_INVITE_STORE_DRIVER=invalid-driver');
  console.log(
    'S-022 invite store driver selection verified: postgres-missing-url and invalid-driver fail fast with explicit messages'
  );
}

try {
  main();
} catch (error) {
  console.error('S-022 driver selection verification failed:', error);
  process.exit(1);
}
