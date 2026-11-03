---
name: fix-issue
description: Fix a GitHub issue in the Techistan repo end to end. It writes a failing test that reproduces the bug, fixes it, runs the full test gate (lint, build, unit with coverage, integration, frontend tests and builds), self-reviews, then opens a PR with "Closes #N" so the issue closes on merge. Use when asked to fix, resolve or raise a PR for an issue number. Arg - the issue number.
argument-hint: "<issue-number>"
---

# fix-issue

Turn issue `#$ARGUMENTS` into a tested, reviewed PR. **Never open a PR unless the test gate is green.** Stop once the PR is open. The user merges it, and the `Closes #N` line closes the issue.

Read `../_shared/github.md` (repo slug, gh binary, branch/commit rules) and `references/pr-template.md`.

## 1. Understand the issue
```bash
gh issue view <n> -R Usman-Builds/techistan-ecommerce-platform --comments
gh pr list   -R Usman-Builds/techistan-ecommerce-platform --state open --search "<n> in:body"
```
- Stop if the issue is closed, or an open PR already references it. Report the PR instead.
- If `<n>` is missing or not a number, ask for it.
- Identify the module from the `module:*` label or `[module]` title prefix, then look it up in `../scan-modules/references/modules.md` for its paths, specs and risks.
- Re-verify the bug against current `main`. If it's already fixed or not reproducible, comment on the issue with your evidence and stop. Don't close it yourself.

## 2. Branch
```bash
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
git status --porcelain            # must be empty, otherwise stop and ask
git switch main && git pull --ff-only
git switch -c fix/<n>-<slug>
```

## 3. Reproduce with a failing test (test first)
Choose the narrowest layer that shows the bug:
- **Pure logic or service with mocked Prisma:** a `*.spec.ts` next to the file (`Code/backend/src/modules/<m>/`). Follow the existing specs' style (see `cart-merge.spec.ts`, `coupon-limits.spec.ts`).
- **HTTP, guards, DB constraints, transactions:** `Code/backend/test/<topic>.e2e-spec.ts` using the helpers in `test/utils/` (`e2e.ts`, `db.ts`), with the same bootstrap as `auth.e2e-spec.ts`.
- **Frontend util, schema or sync client component:** a vitest `*.test.ts(x)` next to the code.

Run only that test and **confirm it fails for the reason in the issue**:
```bash
cd Code/backend && npx jest <path>                                     # unit
cd Code/backend && npx jest --config ./test/jest-e2e.json --runInBand <path>   # integration (needs ecom_test; see test-gate.sh)
cd Code/frontend/<app> && npx vitest run <path>
```
If you truly can't write a test (pure config, docs), say why in the PR and add a manual verification step instead.

## 4. Fix
- Make the minimal change that addresses the root cause. Don't refactor nearby code or change formatting in files you didn't need to touch.
- If the fix needs a schema change, create a Prisma migration (`npx prisma migrate dev --name <slug> --create-only`), review its SQL, and mention it under **Risk** in the PR.
- Re-run the new test until it passes.

## 5. Test gate (mandatory)
Choose the packages the diff touches: `backend`, `user`, `admin`, or `all`. Changes to shared contracts (DTOs or API response shapes) also need the frontend that consumes them.
```bash
bash "$ROOT/.claude/skills/_shared/test-gate.sh" backend user    # example
```
- Every step must pass, including lint, build, the coverage threshold and integration tests.
- On failure, read the output, fix the code (not the test, unless the test itself is wrong), and rerun. Allow at most **3** gate attempts.
- If it still fails after 3 attempts, or fails in a way unrelated to your change (pre-existing breakage), **stop without pushing**. Report the failure output and leave the branch local.
- Keep the final `SUMMARY` block for the PR.

## 6. Self-review
Run `/code-review` on the branch diff, if that skill is available. Fix every confirmed correctness finding. If code changed, rerun the gate (step 5).

Check the diff yourself too, with `git diff main...HEAD`: no debug logs, no `.only`/`.skip`, no secrets, no unrelated files, no lockfile churn unless a dependency actually changed.

## 7. Commit and push
```bash
git add <specific files>          # never `git add -A` blindly
git commit -m "fix(<module>): <imperative summary> (#<n>)" -m "<why, 1-3 lines>" -m "Co-Authored-By: <trailer from session>"
git push -u origin fix/<n>-<slug>
```

## 8. Open the PR, then stop
- Fill in `references/pr-template.md`. Write the body to a scratchpad file. It **must** contain `Closes #<n>`.
```bash
gh pr create -R Usman-Builds/techistan-ecommerce-platform --base main --head fix/<n>-<slug> \
  --title "fix(<module>): <summary> (#<n>)" --body-file "<scratchpad>/pr-<n>.md" \
  --label "module:<m>"
gh issue comment <n> -R Usman-Builds/techistan-ecommerce-platform --body "Fix proposed in <PR url>. Test gate green locally; CI running."
```
- Optionally run `gh pr checks <pr> --watch` once to report the CI result. If CI fails, fix it on the same branch (back to step 5) and push again.
- **Do not merge.** Report the PR URL, what was fixed, the tests added and the gate summary. Remind the user that merging closes #<n> automatically.
