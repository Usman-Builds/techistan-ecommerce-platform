---
name: fix-ci
description: Make a red CI run green for a Techistan PR or branch. It reads the failing GitHub Actions jobs and their logs, reproduces each failure locally, fixes the root cause (never by skipping, weakening or deleting checks), re-runs the test gate, pushes to the same branch and watches CI until it's green. Use when asked to fix CI, make checks green, or when a PR has failing checks. Arg - PR number or branch name (defaults to the current branch).
argument-hint: "[pr-number|branch]"
---

# fix-ci

Make the CI for `$ARGUMENTS`, or the current branch, green by fixing the **cause**. Push only to that PR's branch. Never push to `main`, and never merge.

Read `../_shared/github.md` for the repo slug, gh binary and commit rules.

## Hard rules
- Never make CI pass by weakening it. That means no `|| true`, no `continue-on-error`, no `.skip`/`.only`, no deleting or loosening assertions, no lowering coverage thresholds, no raising `--audit-level`, no `eslint-disable` lines without a written justification, and no removing jobs or steps from `.github/workflows/ci.yml`.
- If the only real fix is one of those, for example an advisory with no upstream fix, stop and explain the options to the user. Let them decide.
- Fix the code when it's wrong. Fix a test only when the test itself is wrong, and explain why in the commit.
- Don't touch failures outside GitHub Actions (Vercel, Netlify) unless asked. Report them instead.

## 1. Find the failing run
```bash
gh pr view <pr> -R Usman-Builds/techistan-ecommerce-platform --json number,headRefName,state,statusCheckRollup
gh pr checks <pr> -R Usman-Builds/techistan-ecommerce-platform          # or, for a branch:
gh run list -R Usman-Builds/techistan-ecommerce-platform --branch <branch> --limit 5
```
- If the argument is a branch with no PR, use the latest run on that branch.
- If every GitHub Actions check passes, say so and stop.
- If some checks are still running, wait with `gh pr checks <pr> --watch --interval 30`.
- The PR must be open, and its branch must not be `main`.

## 2. Read the failure logs
```bash
gh run view <run-id> -R Usman-Builds/techistan-ecommerce-platform --log-failed | tail -200
```
For each failing job, record:
- the job name
- the step
- the first real error, not the cascade of errors that follows it

Map each job to its local equivalent:

| CI job | Local reproduction |
|---|---|
| `backend` | `bash .claude/skills/_shared/test-gate.sh backend` |
| `backend-security` | `cd Code/backend && npm audit --omit=dev --audit-level=critical` |
| `frontend (user_client)` | `test-gate.sh user` |
| `frontend (admin_client)` | `test-gate.sh admin` |

## 3. Check out and reproduce
```bash
git status --porcelain              # must be clean, otherwise stop and ask
git fetch origin && git switch <branch> && git pull --ff-only
```
Run the matching local command and confirm it fails the same way.

If it **passes locally but fails in CI**, the difference is environmental. Compare these between the two:
- Node version (CI uses 22)
- `npm ci` vs. an already-installed `node_modules`
- environment variables in `ci.yml`
- file-path case sensitivity (CI is Linux)
- line endings
- time zone or locale
- a missing `prisma generate` or migration

Fix the cause in code or in the workflow config. Never patch the symptom.

## 4. Fix by failure type
- **Lint:** run `npx eslint <files> --fix` for formatting. Fix the remaining rule violations by hand.
- **Type or build errors:** fix the types. Don't add `any` or `@ts-ignore`.
- **Unit or integration tests:** find out why the assertion fails. A real regression means fixing the code; a stale test means updating it and explaining why. For a flaky test, find the source of nondeterminism (ordering, time, shared DB state) and fix that rather than retrying.
- **Coverage gate:** add meaningful tests for the uncovered lines.
- **npm audit:**
  1. Run `npm audit fix`, which only makes semver-compatible updates.
  2. Use `npm audit fix --force` or major upgrades only if there's no other way, and only after listing the breaking changes to the user and getting their OK.
  3. If no fix exists upstream, stop and report the options: an override in `package.json` `overrides`, replacing the package, or accepting the risk. Let the user choose.
- **Workflow config** (`.github/workflows/ci.yml`): fix only genuine misconfigurations, such as a wrong `working-directory`, cache path or missing env var.

## 5. Verify locally
Run the full gate for every package the fix touched. Run all three packages if a lockfile or the workflow changed.
```bash
bash "$(git rev-parse --show-toplevel)/.claude/skills/_shared/test-gate.sh" <packages>
```
It must come back `ALL GREEN`. Allow at most 3 fix-and-rerun attempts. If it still isn't green, stop, report what's left, and don't push.

## 6. Push and watch
```bash
git add <specific files>
git commit -m "ci: <what was failing and why it is fixed>" -m "Co-Authored-By: <trailer from session>"
git push
gh pr checks <pr> -R Usman-Builds/techistan-ecommerce-platform --watch --interval 30
```
- If CI comes back green, report which checks were red, the root cause, the fix and the final check list.
- If a different job fails, go back to step 2. Stop after 3 CI rounds and report the remaining failures.
- Optionally leave a short PR comment that summarises the fix (`gh pr comment`).
