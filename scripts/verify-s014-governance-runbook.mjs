#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const policyPath = '.github/branch-protection.policy.json';
const apiPath = '.github/branch-protection.api.json';
const runbookPath = 'docs/plans/2026-03-01-s014-branch-protection-runbook.md';
const requiredCheckToken = 'verify-gate';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const [policy, apiPayload, runbook] = await Promise.all([
    readJson(policyPath),
    readJson(apiPath),
    readFile(runbookPath, 'utf8')
  ]);

  assert(policy.version === 1, `expected ${policyPath} version to be 1`);
  assert(policy.branch === 'main', `expected ${policyPath} branch to be main`);
  assert(
    Array.isArray(policy.required_status_checks) &&
      policy.required_status_checks.includes(requiredCheckToken),
    `expected ${policyPath} required_status_checks to include ${requiredCheckToken}`
  );
  assert(
    typeof policy.required_pull_request_reviews?.required_approving_review_count === 'number' &&
      policy.required_pull_request_reviews.required_approving_review_count >= 1,
    `expected ${policyPath} to require at least one approving review`
  );
  assert(policy.enforce_admins === true, `expected ${policyPath} enforce_admins=true`);
  assert(
    policy.required_conversation_resolution === true,
    `expected ${policyPath} required_conversation_resolution=true`
  );

  const contexts = apiPayload?.required_status_checks?.contexts;
  assert(Array.isArray(contexts), `expected ${apiPath} required_status_checks.contexts array`);
  assert(
    contexts.some((ctx) => typeof ctx === 'string' && ctx.includes(requiredCheckToken)),
    `expected ${apiPath} contexts to include ${requiredCheckToken}`
  );
  assert(
    apiPayload?.required_pull_request_reviews?.required_approving_review_count >= 1,
    `expected ${apiPath} to require at least one approving review`
  );

  const requiredRunbookPhrases = [
    'Branch protection',
    'Require status checks to pass before merging',
    requiredCheckToken,
    'GitHub UI',
    'GitHub CLI',
    'Verification Checklist'
  ];
  for (const phrase of requiredRunbookPhrases) {
    assert(
      runbook.includes(phrase),
      `expected ${runbookPath} to contain phrase: ${phrase}`
    );
  }

  console.log(
    `S-014 governance runbook verified: branch=${policy.branch} checks=${policy.required_status_checks.join(',')} approvals=${policy.required_pull_request_reviews.required_approving_review_count}`
  );
}

main().catch((error) => {
  console.error('S-014 governance runbook verification failed:', error);
  process.exit(1);
});
