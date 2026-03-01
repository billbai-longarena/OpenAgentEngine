#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const readmePath = 'README.md';
const blackboardPath = 'BLACKBOARD.md';
const signalPath = 'signals/active/S-002.yaml';
const charterDesignPath = 'docs/plans/2026-02-28-project-charter-design.md';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [readme, blackboard, signal, charterDesign] = await Promise.all([
    readFile(readmePath, 'utf8'),
    readFile(blackboardPath, 'utf8'),
    readFile(signalPath, 'utf8'),
    readFile(charterDesignPath, 'utf8')
  ]);

  const requiredReadmeAnchors = [
    'Founding vision (S-002) remains historical context; when wording conflicts, S-003 + CHARTER are authoritative.'
  ];
  for (const anchor of requiredReadmeAnchors) {
    assert(readme.includes(anchor), `expected ${readmePath} to contain anchor: ${anchor}`);
  }

  const requiredBlackboardAnchors = [
    'Signal precedence',
    'if wording in S-002 (founding vision) conflicts with S-003/CHARTER worldview extensions, use S-003 + CHARTER as current authority.'
  ];
  for (const anchor of requiredBlackboardAnchors) {
    assert(blackboard.includes(anchor), `expected ${blackboardPath} to contain anchor: ${anchor}`);
  }

  const requiredSignalAnchors = [
    'title: "Founding Vision — OpenAgentEngine identity and design principles"',
    'next: "Reference with S-003 and CHARTER together; where terminology or architecture semantics differ, S-003/CHARTER take precedence"',
    'vision: |',
    'open-source game engine'
  ];
  for (const anchor of requiredSignalAnchors) {
    assert(signal.includes(anchor), `expected ${signalPath} to contain anchor: ${anchor}`);
  }

  const requiredCharterDesignAnchors = [
    'S-002 founding vision signal remains as historical record'
  ];
  for (const anchor of requiredCharterDesignAnchors) {
    assert(
      charterDesign.includes(anchor),
      `expected ${charterDesignPath} to contain anchor: ${anchor}`
    );
  }

  console.log(
    `S-002 founding vision precedence verified: readme=${requiredReadmeAnchors.length} blackboard=${requiredBlackboardAnchors.length} signal=${requiredSignalAnchors.length} charter_design=${requiredCharterDesignAnchors.length}`
  );
}

main().catch((error) => {
  console.error('S-002 founding vision precedence verification failed:', error);
  process.exit(1);
});
