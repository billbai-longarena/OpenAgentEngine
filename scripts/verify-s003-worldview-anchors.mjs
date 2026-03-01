#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const readmePath = 'README.md';
const charterPath = 'CHARTER.md';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [readme, charter] = await Promise.all([
    readFile(readmePath, 'utf8'),
    readFile(charterPath, 'utf8')
  ]);

  const requiredReadmeAnchors = [
    'world substrate for human-AI co-inhabitation',
    'Fundamental unit is **World**, not Game.',
    '**Inhabit -> Shape -> Resonate -> Invite**.',
    'AI acts as a fluid **Presence** in world context.',
    'Current Baseline (S-022 Closed)'
  ];
  for (const anchor of requiredReadmeAnchors) {
    assert(readme.includes(anchor), `expected ${readmePath} to contain anchor: ${anchor}`);
  }

  const deprecatedReadmePhrases = ['Current Baseline (S-022 In Progress)'];
  for (const phrase of deprecatedReadmePhrases) {
    assert(
      !readme.includes(phrase),
      `expected ${readmePath} to remove deprecated phrase: ${phrase}`
    );
  }

  const requiredCharterAnchors = [
    'C-005',
    'C-033',
    'C-305',
    '系统的基本单元是"世界"'
  ];
  for (const anchor of requiredCharterAnchors) {
    assert(charter.includes(anchor), `expected ${charterPath} to contain anchor: ${anchor}`);
  }

  console.log(
    `S-003 worldview anchors verified: readme_anchors=${requiredReadmeAnchors.length} charter_anchors=${requiredCharterAnchors.length} deprecated_removed=${deprecatedReadmePhrases.length}`
  );
}

main().catch((error) => {
  console.error('S-003 worldview anchors verification failed:', error);
  process.exit(1);
});
