# S-014 Branch Protection Runbook (Phase 9)

> Date: 2026-03-01  
> Signal: S-014  
> Goal: enforce repository governance so `verify:gate` is required before merge.

## 1. Policy Source of Truth

- Human-readable policy: `.github/branch-protection.policy.json`
- GitHub API payload template: `.github/branch-protection.api.json`

Any policy change must update both files in the same commit.

## 2. Required Governance Outcome

For `main` branch:

1. Required status check includes `verify-gate`.
2. At least 1 approving pull request review is required.
3. Stale approvals are dismissed on new commits.
4. Conversation resolution is required before merge.
5. Force push and branch deletion are disabled.
6. Admin bypass is disabled (`enforce_admins=true`).

## 3. Preconditions

Before applying protection:

1. `verify-gate` workflow exists at `.github/workflows/verify-gate.yml`.
2. `pnpm run verify:gate` passes locally.
3. At least one recent CI run has reported the `verify-gate` check context.

## 4. Apply via GitHub UI

Repository settings path:

1. `Settings` -> `Branches` -> `Branch protection rules` -> `Add rule`
2. Branch name pattern: `main`
3. Enable `Require a pull request before merging`
4. Set required approving reviews: `1`
5. Enable `Dismiss stale pull request approvals when new commits are pushed`
6. Enable `Require status checks to pass before merging`
7. Add required check: `verify-gate`
8. Enable `Require conversation resolution before merging`
9. Disable force push and delete branch options
10. Enable `Do not allow bypassing the above settings` (admins included)
11. Save rule

Note:
- If GitHub UI displays check context as `verify-gate / verify-gate`, use the exact displayed context.
- If context differs from `verify-gate`, update `.github/branch-protection.policy.json` and `.github/branch-protection.api.json` accordingly.

## 5. Apply via GitHub CLI (Optional)

Prerequisites:
- `gh auth status` is authenticated for the target repository
- caller has admin permission on repository settings

Example:

```bash
OWNER="<org-or-user>"
REPO="OpenAgentEngine"
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER}/${REPO}/branches/main/protection" \
  --input .github/branch-protection.api.json
```

## 6. Verification Checklist

After applying protection:

1. Open a test PR with intentionally failing `verify:gate`; confirm merge is blocked.
2. Push a fix so `verify:gate` passes; confirm merge is still blocked until review approval.
3. Add one approval; confirm merge becomes allowed.
4. Push a new commit; confirm stale approval is dismissed.

## 7. Maintenance

When quality gate contexts change:

1. Update `scripts/verify-quality-gate.mjs`
2. Run `pnpm run verify:gate`
3. Update `.github/branch-protection.policy.json`
4. Update `.github/branch-protection.api.json`
5. Re-apply branch protection rule per this runbook

## 8. CI Drift-Audit Credential (S-016)

`verify:gate` includes `verify:s015` branch-protection drift audit.

- `pull_request` runs allow CI-safe skip when credentials are unavailable.
- `push` to `main` requires live branch-protection audit (non-skip).

Required repository secret:

- Name: `BRANCH_PROTECTION_AUDIT_TOKEN`
- Scope: token must be able to read branch protection for this repository.

Behavior:

- If secret is missing on `push` to `main`, `verify:gate` fails by design.
- If secret is present but permissions are insufficient, `verify:gate` fails and prints API status/body summary.
- You can preflight this path via `workflow_dispatch` by setting input `require_live_branch_protection_audit=true`.
