#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const signalId = process.env.S011_SIGNAL_ID ?? 'S-002';
const observationId = process.env.S011_OBSERVATION_ID ?? 'O-001';
const visionSentinel = process.env.S011_VISION_SENTINEL ?? 'S011_SENTINEL_VISION_KEEP';
const descriptionSentinel = process.env.S011_DESCRIPTION_SENTINEL ?? 'S011_SENTINEL_DESCRIPTION_KEEP';
const detailSentinel = process.env.S011_DETAIL_SENTINEL ?? 'S011_SENTINEL_DETAIL_KEEP';

function runExport(outDir) {
  const result = spawnSync('bash', ['scripts/termite-db-export.sh', '--out', outDir], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(
      `termite-db-export failed (status ${result.status ?? 'unknown'}):\n${result.stdout}${result.stderr}`
    );
  }
}

function assertContains(content, marker, target) {
  if (!content.includes(marker)) {
    throw new Error(`preservation check failed for ${target}: missing marker "${marker}"`);
  }
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'verify-s011-'));
  try {
    const activeDir = join(tempRoot, 'signals', 'active');
    const observationsDir = join(tempRoot, 'signals', 'observations');
    await mkdir(activeDir, { recursive: true });
    await mkdir(observationsDir, { recursive: true });

    await writeFile(
      join(activeDir, `${signalId}.yaml`),
      `id: ${signalId}\nvision: |\n  ${visionSentinel}\ndescription: |\n  ${descriptionSentinel}\n`,
      'utf8'
    );
    await writeFile(
      join(observationsDir, `${observationId}.yaml`),
      `id: ${observationId}\ndetail: |\n  ${detailSentinel}\n`,
      'utf8'
    );

    runExport(tempRoot);

    const exportedSignal = await readFile(join(activeDir, `${signalId}.yaml`), 'utf8');
    const exportedObservation = await readFile(join(observationsDir, `${observationId}.yaml`), 'utf8');

    assertContains(exportedSignal, visionSentinel, `${signalId}.vision`);
    assertContains(exportedSignal, descriptionSentinel, `${signalId}.description`);
    assertContains(exportedObservation, detailSentinel, `${observationId}.detail`);

    console.log(
      `S-011 export-preserve verified: signal=${signalId} observation=${observationId} markers retained`
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('S-011 export-preserve verification failed:', error);
  process.exit(1);
});
