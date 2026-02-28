#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const policyPath = '.github/branch-protection.policy.json';
const apiPath = '.github/branch-protection.api.json';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'required'].includes(normalized);
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && typeof value.enabled === 'boolean') {
    return value.enabled;
  }
  return Boolean(value);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeContexts(contexts) {
  if (!Array.isArray(contexts)) return [];
  return [...new Set(contexts.filter((item) => typeof item === 'string' && item.trim().length > 0))].sort();
}

function addDiff(diffs, path, expected, actual) {
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(actual);
  if (expectedJson !== actualJson) {
    diffs.push({ path, expected, actual });
  }
}

function formatDiffs(header, diffs) {
  const lines = [header];
  for (const diff of diffs) {
    lines.push(
      `- ${diff.path}: expected=${JSON.stringify(diff.expected)} actual=${JSON.stringify(diff.actual)}`
    );
  }
  return lines.join('\n');
}

function normalizePolicy(policy) {
  return {
    branch: typeof policy?.branch === 'string' && policy.branch.length > 0 ? policy.branch : 'main',
    required_status_checks: {
      contexts: normalizeContexts(policy?.required_status_checks)
    },
    required_pull_request_reviews: {
      required_approving_review_count: toNumber(
        policy?.required_pull_request_reviews?.required_approving_review_count,
        0
      ),
      dismiss_stale_reviews: toBool(policy?.required_pull_request_reviews?.dismiss_stale_reviews),
      require_code_owner_reviews: toBool(
        policy?.required_pull_request_reviews?.require_code_owner_reviews
      )
    },
    enforce_admins: toBool(policy?.enforce_admins),
    required_conversation_resolution: toBool(policy?.required_conversation_resolution),
    required_linear_history: toBool(policy?.required_linear_history),
    allow_force_pushes: toBool(policy?.allow_force_pushes),
    allow_deletions: toBool(policy?.allow_deletions)
  };
}

function normalizeApiTemplate(apiPayload) {
  return {
    required_status_checks: {
      strict: toBool(apiPayload?.required_status_checks?.strict),
      contexts: normalizeContexts(apiPayload?.required_status_checks?.contexts)
    },
    required_pull_request_reviews: {
      required_approving_review_count: toNumber(
        apiPayload?.required_pull_request_reviews?.required_approving_review_count,
        0
      ),
      dismiss_stale_reviews: toBool(apiPayload?.required_pull_request_reviews?.dismiss_stale_reviews),
      require_code_owner_reviews: toBool(
        apiPayload?.required_pull_request_reviews?.require_code_owner_reviews
      )
    },
    enforce_admins: toBool(apiPayload?.enforce_admins),
    required_conversation_resolution: toBool(apiPayload?.required_conversation_resolution),
    required_linear_history: toBool(apiPayload?.required_linear_history),
    allow_force_pushes: toBool(apiPayload?.allow_force_pushes),
    allow_deletions: toBool(apiPayload?.allow_deletions)
  };
}

function normalizeLiveProtection(livePayload, branch) {
  return {
    branch,
    required_status_checks: {
      strict: toBool(livePayload?.required_status_checks?.strict),
      contexts: normalizeContexts(livePayload?.required_status_checks?.contexts)
    },
    required_pull_request_reviews: {
      required_approving_review_count: toNumber(
        livePayload?.required_pull_request_reviews?.required_approving_review_count,
        0
      ),
      dismiss_stale_reviews: toBool(livePayload?.required_pull_request_reviews?.dismiss_stale_reviews),
      require_code_owner_reviews: toBool(
        livePayload?.required_pull_request_reviews?.require_code_owner_reviews
      )
    },
    enforce_admins: toBool(livePayload?.enforce_admins),
    required_conversation_resolution: toBool(livePayload?.required_conversation_resolution),
    required_linear_history: toBool(livePayload?.required_linear_history),
    allow_force_pushes: toBool(livePayload?.allow_force_pushes),
    allow_deletions: toBool(livePayload?.allow_deletions)
  };
}

function comparePolicyAndApi(policySnapshot, apiSnapshot) {
  const diffs = [];
  addDiff(
    diffs,
    'required_status_checks.contexts',
    policySnapshot.required_status_checks.contexts,
    apiSnapshot.required_status_checks.contexts
  );
  addDiff(
    diffs,
    'required_pull_request_reviews.required_approving_review_count',
    policySnapshot.required_pull_request_reviews.required_approving_review_count,
    apiSnapshot.required_pull_request_reviews.required_approving_review_count
  );
  addDiff(
    diffs,
    'required_pull_request_reviews.dismiss_stale_reviews',
    policySnapshot.required_pull_request_reviews.dismiss_stale_reviews,
    apiSnapshot.required_pull_request_reviews.dismiss_stale_reviews
  );
  addDiff(
    diffs,
    'required_pull_request_reviews.require_code_owner_reviews',
    policySnapshot.required_pull_request_reviews.require_code_owner_reviews,
    apiSnapshot.required_pull_request_reviews.require_code_owner_reviews
  );
  addDiff(diffs, 'enforce_admins', policySnapshot.enforce_admins, apiSnapshot.enforce_admins);
  addDiff(
    diffs,
    'required_conversation_resolution',
    policySnapshot.required_conversation_resolution,
    apiSnapshot.required_conversation_resolution
  );
  addDiff(
    diffs,
    'required_linear_history',
    policySnapshot.required_linear_history,
    apiSnapshot.required_linear_history
  );
  addDiff(
    diffs,
    'allow_force_pushes',
    policySnapshot.allow_force_pushes,
    apiSnapshot.allow_force_pushes
  );
  addDiff(diffs, 'allow_deletions', policySnapshot.allow_deletions, apiSnapshot.allow_deletions);
  return diffs;
}

function compareExpectedAndLive(expectedSnapshot, liveSnapshot) {
  const diffs = [];
  addDiff(diffs, 'branch', expectedSnapshot.branch, liveSnapshot.branch);
  addDiff(
    diffs,
    'required_status_checks.strict',
    expectedSnapshot.required_status_checks.strict,
    liveSnapshot.required_status_checks.strict
  );
  addDiff(
    diffs,
    'required_status_checks.contexts',
    expectedSnapshot.required_status_checks.contexts,
    liveSnapshot.required_status_checks.contexts
  );
  addDiff(
    diffs,
    'required_pull_request_reviews.required_approving_review_count',
    expectedSnapshot.required_pull_request_reviews.required_approving_review_count,
    liveSnapshot.required_pull_request_reviews.required_approving_review_count
  );
  addDiff(
    diffs,
    'required_pull_request_reviews.dismiss_stale_reviews',
    expectedSnapshot.required_pull_request_reviews.dismiss_stale_reviews,
    liveSnapshot.required_pull_request_reviews.dismiss_stale_reviews
  );
  addDiff(
    diffs,
    'required_pull_request_reviews.require_code_owner_reviews',
    expectedSnapshot.required_pull_request_reviews.require_code_owner_reviews,
    liveSnapshot.required_pull_request_reviews.require_code_owner_reviews
  );
  addDiff(
    diffs,
    'enforce_admins',
    expectedSnapshot.enforce_admins,
    liveSnapshot.enforce_admins
  );
  addDiff(
    diffs,
    'required_conversation_resolution',
    expectedSnapshot.required_conversation_resolution,
    liveSnapshot.required_conversation_resolution
  );
  addDiff(
    diffs,
    'required_linear_history',
    expectedSnapshot.required_linear_history,
    liveSnapshot.required_linear_history
  );
  addDiff(
    diffs,
    'allow_force_pushes',
    expectedSnapshot.allow_force_pushes,
    liveSnapshot.allow_force_pushes
  );
  addDiff(
    diffs,
    'allow_deletions',
    expectedSnapshot.allow_deletions,
    liveSnapshot.allow_deletions
  );
  return diffs;
}

function parseRepoFromGitRemote() {
  const result = spawnSync('git', ['config', '--get', 'remote.origin.url'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) return '';
  const remote = result.stdout.trim();
  if (!remote) return '';

  const sshMatch = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }
  return '';
}

function resolveRepoSlug() {
  const fromEnv = process.env.S015_REPO || process.env.GITHUB_REPOSITORY || process.env.GH_REPO;
  if (fromEnv && fromEnv.includes('/')) {
    return fromEnv.trim();
  }
  return parseRepoFromGitRemote();
}

async function fetchLiveProtection(repoSlug, branch, token) {
  const endpoint = `https://api.github.com/repos/${repoSlug}/branches/${encodeURIComponent(branch)}/protection`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const trimmed = body.replace(/\s+/g, ' ').trim();
    throw new Error(`GitHub API request failed (${response.status}): ${trimmed.slice(0, 400)}`);
  }

  return response.json();
}

async function main() {
  const [policy, apiTemplate] = await Promise.all([readJson(policyPath), readJson(apiPath)]);

  assert(policy.version === 1, `expected ${policyPath} version to be 1`);
  assert(typeof policy.branch === 'string' && policy.branch.length > 0, `expected ${policyPath} branch`);

  const policySnapshot = normalizePolicy(policy);
  const apiSnapshot = normalizeApiTemplate(apiTemplate);

  const localDiffs = comparePolicyAndApi(policySnapshot, apiSnapshot);
  if (localDiffs.length > 0) {
    throw new Error(formatDiffs('Local policy/api drift detected:', localDiffs));
  }

  const expectedLive = {
    branch: policySnapshot.branch,
    required_status_checks: {
      strict: apiSnapshot.required_status_checks.strict,
      contexts: apiSnapshot.required_status_checks.contexts
    },
    required_pull_request_reviews: policySnapshot.required_pull_request_reviews,
    enforce_admins: policySnapshot.enforce_admins,
    required_conversation_resolution: policySnapshot.required_conversation_resolution,
    required_linear_history: policySnapshot.required_linear_history,
    allow_force_pushes: policySnapshot.allow_force_pushes,
    allow_deletions: policySnapshot.allow_deletions
  };

  const requireLive = envFlag('S015_REQUIRE_LIVE_BRANCH_PROTECTION') || envFlag('S015_REQUIRE_LIVE');
  const token =
    process.env.BRANCH_PROTECTION_AUDIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const repoSlug = resolveRepoSlug();

  if (!token || !repoSlug) {
    const reason =
      !token && !repoSlug ? 'missing_token_and_repository' : !token ? 'missing_token' : 'missing_repository';
    if (requireLive) {
      throw new Error(
        `Live branch-protection audit is required but unavailable (${reason}). Set BRANCH_PROTECTION_AUDIT_TOKEN and S015_REPO/GITHUB_REPOSITORY in this execution context.`
      );
    }
    console.log(
      `S-015 branch-protection drift verified: branch=${expectedLive.branch} contexts=${expectedLive.required_status_checks.contexts.join(',')} live_check=skipped mode=optional reason=${reason}`
    );
    return;
  }

  const livePayload = await fetchLiveProtection(repoSlug, expectedLive.branch, token);
  const liveSnapshot = normalizeLiveProtection(livePayload, expectedLive.branch);
  const liveDiffs = compareExpectedAndLive(expectedLive, liveSnapshot);
  if (liveDiffs.length > 0) {
    throw new Error(formatDiffs(`Live branch-protection drift detected for ${repoSlug}/${expectedLive.branch}:`, liveDiffs));
  }

  console.log(
    `S-015 branch-protection drift verified: repo=${repoSlug} branch=${expectedLive.branch} contexts=${expectedLive.required_status_checks.contexts.join(',')} live_check=aligned mode=${requireLive ? 'required' : 'optional'}`
  );
}

main().catch((error) => {
  console.error('S-015 branch-protection drift verification failed:', error);
  process.exit(1);
});
