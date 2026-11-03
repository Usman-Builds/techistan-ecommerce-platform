# GitHub conventions (shared by scan-modules and fix-issue)

- **Repo:** `Usman-Builds/techistan-ecommerce-platform`. Pass `-R Usman-Builds/techistan-ecommerce-platform` to every `gh` call so it works from any directory.
- **Repo root:** the git root, found with `git rev-parse --show-toplevel`. Application code lives under `Code/`.
- **gh binary:** use `gh` if `command -v gh` finds it. Otherwise use `"/c/Program Files/GitHub CLI/gh.exe"`, because winget installs don't reach PATH until the shell restarts. Check auth with `gh auth status` and stop if it isn't signed in.
- **Default branch:** `main`.

## Labels
Create labels idempotently before filing. `--force` updates a label that already exists:

| Label | Colour | Meaning |
|---|---|---|
| `scan` | `5319e7` | Filed by /scan-modules |
| `module:<name>` | `c5def5` | One per module in `scan-modules/references/modules.md` |
| `severity:critical` | `b60205` | Data loss, money wrong, auth bypass, exploitable |
| `severity:high` | `d93f0b` | Broken core flow or a security weakness |
| `severity:medium` | `fbca04` | Wrong behaviour in an edge case, missing guard |
| `severity:low` | `0e8a16` | Minor, cosmetic, small coverage gap |
| `security` | `000000` | Security-relevant finding |
| `test-coverage` | `bfd4f2` | Missing or weak tests on critical logic |
| `bug`, `enhancement` | (exist already) | Type |

```bash
gh label create "module:cart" -R Usman-Builds/techistan-ecommerce-platform --color c5def5 --description "Cart module" --force
```

## Branches, commits and PRs
- Branch: `fix/<issue#>-<short-kebab-slug>`, e.g. `fix/42-coupon-limit-race`.
- Commit: `fix(<module>): <imperative summary> (#<issue#>)`, ending with the Co-Authored-By trailer the session specifies.
- The PR body **must** contain `Closes #<issue#>` on its own line so GitHub closes the issue when the PR merges into `main`.
- Never force-push to `main`, never merge, and never pass `--no-verify`.
