## Summary
<One or two sentences: what is wrong and who it affects.>

## Evidence
- `Code/backend/src/modules/<m>/<file>.ts:<line>`: <what this line does wrong>
- <further locations if the root cause spans files>

```ts
// the offending snippet, max ~15 lines
```

## Reproduction
1. <concrete request/input/state, e.g. `POST /cart/items { productId, quantity: -3 }` as a logged-in user>
2. <...>

**Actual:** <observed behaviour>
**Expected:** <correct behaviour>

## Impact
Severity: **<critical|high|medium|low>**. <Why: money, data exposure, broken flow, edge case.>

## Suggested fix
<Approach, not a full patch. Mention the transaction, guard, DTO validator, etc.>

## Acceptance criteria
- [ ] A failing test reproduces the bug (unit `*.spec.ts` or `test/*.e2e-spec.ts` / vitest)
- [ ] Fix makes it pass without breaking the existing suite
- [ ] <any module-specific criterion>

---
<sub>Filed by `/scan-modules` · module: `<m>`</sub>
