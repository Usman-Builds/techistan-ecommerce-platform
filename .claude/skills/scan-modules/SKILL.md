---
name: scan-modules
description: Audit Techistan modules for real bugs, security issues and missing tests on critical logic, then file each verified finding as a labelled GitHub issue. Use when asked to scan, audit or review a module (or the whole codebase) and raise issues. Args - optional module names (e.g. "cart order", "storefront-ui"), "all" or nothing for every module, and "--dry-run" to report without filing.
argument-hint: "[module ...|all] [--dry-run]"
---

# scan-modules

Scan one module, several, or all of them. Every finding that survives verification becomes a GitHub issue that `/fix-issue <n>` can pick up.

Read these first:
- `../_shared/github.md`: repo slug, gh binary, labels
- `references/modules.md`: the module map (paths, specs, risks)
- `references/checklist.md`: what to look for
- `references/issue-template.md`: the issue body format

## 1. Resolve scope
- Parse `$ARGUMENTS`. Strip `--dry-run` and remember it.
- No names, or `all`, means every module in `modules.md`, in the order listed (highest risk first).
- Otherwise match each name against the module keys in `modules.md`. Accept the folder name (`recently-viewed`) and obvious aliases (`payments` → `payment`, `admin` → `admin-ui`, `frontend` → `storefront-ui` + `admin-ui`). If a name matches nothing, list the valid keys and stop.
- If more than 6 modules are in scope, tell the user how many and scan them one at a time, reporting progress after each.

## 2. Preflight (once)
```bash
ROOT=$(git rev-parse --show-toplevel)
gh auth status                       # use the fallback path from github.md if gh isn't found
cd "$ROOT/Code/backend" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -50
cd "$ROOT/Code/backend" && npx eslint "src/**/*.ts" 2>&1 | tail -80     # never --fix during a scan
```
For UI modules, run `npx tsc --noEmit` and `npx eslint src` inside that app instead. Save this output: any compiler or lint error inside a scanned module is a candidate finding.

**A scan never modifies the repo.** No `--fix`, no edits, no commits. Scratch tests go in the session scratchpad, not the repo.

## 3. Scan each module
For each module:
1. **Read the whole module.** That means every controller, service, DTO, guard and helper in its paths, the Prisma models it touches (`Code/backend/prisma/schema.prisma`), and its specs. Follow calls into `common/` and other modules where the behaviour depends on them.
2. **Run its existing tests:** `cd Code/backend && npx jest src/modules/<m>` for backend, or `npx vitest run <path>` for UI. A failing test is an automatic finding.
3. **Hunt** using `references/checklist.md` plus the module's own **Risks** list in `modules.md`. Think through concrete inputs: negative quantities, a coupon at its exact limit, two concurrent requests, an expired token, another user's id in the URL, a non-admin hitting `/admin/*`.
4. **Verify every candidate before keeping it.** Re-read the exact lines. Check whether a guard, a DTO validator, a DB constraint or a caller already prevents the problem. Where you can, prove it with a test you run in a scratch copy, or by tracing the code path end to end. Drop anything you can't back with file:line evidence and a concrete scenario.
5. **Classify** each kept finding:
   - type: `bug` | `security` | `test-coverage` | `enhancement`
   - severity: `critical` | `high` | `medium` | `low` (definitions in github.md)

What is out of scope: style nits, naming, refactors that don't change behaviour, "consider using X" with no defect behind it, and anything already tracked by an open issue.

## 4. Deduplicate
For each finding, search open issues by module label and by key terms:
```bash
gh issue list -R Usman-Builds/techistan-ecommerce-platform --state open --label "module:<m>" --search "<2-4 key terms>" --json number,title
```
If an open issue already describes the same defect, skip the finding and record it as a duplicate of #N.

## 5. File (skip this step on --dry-run)
1. Create the labels once per run (see `github.md`): `scan`, the `severity:*` set, `security`, `test-coverage`, and `module:<m>` for each module in scope.
2. One issue per defect. Related symptoms with a single root cause go into one issue.
3. Title: `[<module>] <concise defect statement>`, e.g. `[coupon] Usage limit can be exceeded by concurrent checkouts`.
4. Body: fill in `references/issue-template.md`. Write the body to a scratchpad file and pass it with `--body-file`, so markdown and backticks survive the shell.
```bash
gh issue create -R Usman-Builds/techistan-ecommerce-platform \
  --title "[coupon] ..." --body-file "<scratchpad>/issue-coupon-1.md" \
  --label scan --label "module:coupon" --label "severity:high" --label bug
```

## 6. Report
End with one table per run:

| Module | Finding | Severity | Result |
|---|---|---|---|
| coupon | Usage limit race | high | #57 created |
| cart | Qty clamp missing | medium | duplicate of #41 |

List modules that came back clean as well, so it's clear they were scanned. On `--dry-run`, show the full drafted issue bodies instead of issue numbers. Then suggest `/fix-issue <n>` for the highest-severity issue that was filed.
