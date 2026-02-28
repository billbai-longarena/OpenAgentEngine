#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const required = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
  'apps/web/package.json',
  'apps/gateway/package.json',
  'apps/runtime/package.json',
  'apps/ai-presence/app/main.py',
  'packages/signal-schema/src/index.ts',
  'packages/world-model/src/index.ts',
  'packages/sdk/src/index.ts',
  'infra/docker/docker-compose.yml',
  'infra/migrations/0001_init.sql'
];

const missing = [];
for (const path of required) {
  try {
    await access(path, constants.F_OK);
  } catch {
    missing.push(path);
  }
}

if (missing.length > 0) {
  console.error('Workspace verification failed. Missing paths:');
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

console.log('Workspace verification passed.');
process.exit(0);
