# Audit checklist

Apply every section to each module, then the module's own **Risks** from `modules.md`. A finding needs evidence (file:line) and a concrete scenario. "Might be an issue" is not enough.

## Correctness
- Logic matches the intent stated in names, comments, DTOs, the README and `Documentation/Claude Scripts/<nn>-*.md` (each script defines the module's FRs).
- Boundaries: zero, negative, max, empty arrays, null/undefined optional fields, exact-limit values.
- Async: a missing `await`, unhandled promise rejections, `forEach` with async callbacks.
- Multi-step writes that must be atomic use `prisma.$transaction`. Look for read-modify-write races (stock, coupon usage, counters). Prefer atomic `update ... { increment }` or a conditional `updateMany`.
- Errors: correct Nest exceptions (404 vs 403 vs 400). No swallowed errors that turn into a silent 200.
- Pagination: `take` is capped, `skip` is non-negative, ordering is deterministic.
- Dates: comparisons in UTC, start/end inclusivity.

## Money
- Integer cents everywhere, through `common/utils/money.util.ts`. No float arithmetic or `toFixed` on totals.
- Prices and discounts are always recomputed server-side from the DB. Client-sent prices are never trusted.

## Security
- **AuthZ:** every `admin-*.controller.ts` / `*.admin.controller.ts` route has the JWT and admin-role guards. Every user-scoped query filters by `userId` from the token, never from the body or params (IDOR).
- **Mass assignment:** DTOs whitelist fields. Updates never spread raw bodies into Prisma, and `role`, `isVerified` and price fields can't be set by users.
- **Data exposure:** responses omit `passwordHash`, tokens and internal notes. Use `select` or serializers.
- **Injection:** `$queryRaw` uses tagged templates only, never `$queryRawUnsafe` with input. No user data in HTML email templates without escaping. CSV exports are safe against formula injection.
- **Secrets:** nothing secret in `NEXT_PUBLIC_*`, logs or error messages. Webhook and cron secrets are verified and fail closed.
- **Abuse:** throttling on auth and expensive endpoints. Upload size and type limits.

## Frontend
- Server vs. client components are correct (`"use client"` where hooks are used). No secrets in client bundles.
- Every fetch handles loading, error and empty states. Mutations invalidate or roll back the query cache.
- No `dangerouslySetInnerHTML` with unsanitised data.
- Forms: zod schemas match backend DTO constraints. Inputs have accessible labels.

## Tests
- Money, auth, RBAC, order status and coupon logic without a unit or integration test exercising the failure path counts as a `test-coverage` finding (severity medium, or high for payment or auth).
- Existing tests that assert nothing meaningful (only `toBeDefined`) on critical logic count too.

## Not findings
Formatting, naming, "could be refactored", unused-import lint warnings on their own, and dependency bumps with no advisory.
