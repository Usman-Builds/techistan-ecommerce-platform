# 08 — Search, Filtering & Sorting

**Goal:** Full-text product search with typo tolerance, faceted filtering (with counts), sorting, and autocomplete — implemented in the **NestJS backend** as a `search` module built on **PostgreSQL full-text search behind a swappable `SearchProvider` interface** (so Meilisearch/Typesense can replace it later without touching callers — CR-001, zero-infra). Then build the **user_client** search experience: search page, filter panel, sort control, autocomplete box, and recently-viewed. (SRD FR-220–FR-224, NFR-106.)

**Prerequisites:** Script `07` (catalog modules: `Product`, `ProductVariant`, `Category`, `Tag`). Backend on `:3000`; `user_client` on `:3001` with its typed `apiClient` + TanStack Query wired (script `01`).

> ⚠️ **Architecture:** one **NestJS 11 REST** backend, two Next.js clients. The `search` feature is a module = **controller + service + provider + DTOs** (`class-validator`). All search endpoints are **public `GET`** reads. Money is **integer cents**. No tRPC, no Auth.js. Package manager is **npm**.
>
> ⚠️ **Next.js 16 (user_client):** before writing any client code, read the relevant guides in `Code/frontend/user_client/node_modules/next/dist/docs/` (routing incl. `searchParams`, data-fetching, `use`/streaming, metadata). Debounce and recently-viewed are client concerns — heed Next 16 conventions (see `00-BUILD-ORDER.md §7`).

---

## Tasks

### 1. (backend) Swappable `SearchProvider` interface
- `src/modules/search/providers/search-provider.interface.ts` — a `SearchProvider` interface with:
  - `search(params: SearchParamsDto): Promise<SearchResult>` — takes `query?`, `filters`, `sort`, `page`, `pageSize`, and requested `facets`; returns `{ items, total, facets, page, pageSize }`.
  - `suggest(query: string): Promise<Suggestion[]>` — product + category suggestions.
  - `indexProduct(productId)` / `removeProduct(productId)` — hooks kept no-op-friendly for the PG provider (data lives in Postgres already) but real for future external engines.
- `PgSearchProvider implements SearchProvider` — the default, Postgres-backed implementation.
- Bind the interface via a **Nest provider token** (e.g. `{ provide: 'SEARCH_PROVIDER', useClass: ... }`) selected by env **`SEARCH_DRIVER`** (`pg` default). A future `MeiliSearchProvider` is a **drop-in** — only the token binding changes. Add `SEARCH_DRIVER` to `configuration.ts` + Joi `validation.ts` and to `.env.example`.

### 2. (backend) Postgres FTS + typo tolerance + synonyms + highlighting
- Add a **`tsvector`** column on `Product` (generated column or trigger-maintained) over **title + description + tag names**, with a **GIN index**. Use `websearch_to_tsquery` for query parsing.
- **Typo tolerance / fuzzy:** enable the **`pg_trgm`** extension; blend `ts_rank` with **trigram similarity** so near-misses (misspellings) still match. Add a trigram GIN index on title for the fuzzy path.
- **Synonyms:** a small in-code synonyms map applied at query-build time (e.g. `tee` → `t-shirt`), expanding the query before `to_tsquery`.
- **Highlighting:** use **`ts_headline`** to return snippet highlights on title/description (FR-220).
- A Prisma **migration** adds the extension(s), the `tsvector` column, and the indexes; document them in `schema.prisma` (raw SQL via `migration.sql` where Prisma can't express it). Use `$queryRaw`/`$queryRawUnsafe` (parameterized) in the provider.

### 3. (backend) Faceted filtering with counts (FR-221)
- Facets: **category, price range, brand (if modeled), rating, availability (in stock)**. Return **facet counts** alongside results (e.g. per-category counts, price buckets, in-stock count).
- Filters are **composable** with the text query **and** with plain category browsing (no query term). Compute counts against the filtered set per standard faceted-search semantics.
- Model filter/sort inputs as `class-validator` DTOs (`SearchParamsDto`, `FilterDto`) with `@Type` coercion; prices are **integer cents**.

### 4. (backend) Sorting (FR-222)
- Support: **relevance** (default when a query is present), **price asc/desc**, **newest**, **best-selling** (by `OrderItem` counts), **top-rated** (by aggregate review rating). Relevance uses the combined `ts_rank` + trigram score.

### 5. (backend) Autocomplete endpoint (FR-223)
- `GET /search/suggest?q=` → product + category suggestions (capped, e.g. ≤8). Fast prefix/trigram lookup; returns minimal payload (id, title/slug, type, thumbnail). Debounce is **client-side** (Task 8) — the endpoint stays stateless and cheap.

### 6. (backend) `search` controller — public REST endpoints
On `search.controller.ts` (no guard, all `GET`):
- `GET /search` — main search + facets + sort + pagination (query via `SearchParamsDto`). Returns items, `total`, `facets`, and highlight snippets.
- `GET /search/suggest` — autocomplete (Task 5).
- `GET /search/facets` — facet counts for a given filter set (optional standalone endpoint for filter panels that refresh counts independently).
- Wire **reindex hooks**: call `indexProduct`/`removeProduct` from the catalog admin write paths (script `07`) on product create/update/delete. For the PG provider these are no-ops (the generated `tsvector` stays current automatically), but the calls keep the interface honest for a future external engine.

### 7. (backend) Recently viewed (FR-224)
- Track the last **N** product ids per viewer: **cookie-based** for guests, **per-account** for logged-in customers.
- `GET /recently-viewed` (returns the list, hydrated to product cards) and `POST /recently-viewed` (`{ productId }` to record a view). For customers, persist server-side; for guests, read/write the cookie (httpOnly not required — it's non-sensitive). Cap the list length.

### 8. (user_client) Search UI — API bindings + hooks
- Read `node_modules/next/dist/docs/` first (App Router `searchParams`, data-fetching, streaming, metadata in Next 16).
- Extend the typed `apiClient` (`src/lib/api/`, `fetch` wrapper, `credentials: 'include'`) with `search`, `suggest`, `facets`, and `recentlyViewed` calls. Wrap in TanStack Query hooks under `src/lib/api/hooks/`.

### 9. (user_client) Search page, filters, sort
- A **search results page** (e.g. `app/search/`) driven by URL `searchParams` (query, filters, sort, page) so results are shareable/bookmarkable and SSR-friendly. Sync filter/sort state to the URL.
- **Filter panel**: category, price range, rating, availability, brand (if present) — showing **facet counts**; multi-select, composable, with a clear-all.
- **Sort control**: relevance / price asc-desc / newest / best-selling / top-rated.
- Render **highlighted** snippets from `ts_headline`. Empty-state + loading skeletons; accessible (WCAG 2.1 AA, keyboard-navigable). Product-card presentation shared with storefront (script `14`).

### 10. (user_client) Autocomplete box + recently-viewed
- **Autocomplete search box** in the header: input **debounced ≤200ms** (NFR-106) before calling `/search/suggest`; keyboard navigable (arrow keys, Enter, Esc), grouped product/category suggestions, cancels stale requests.
- **Recently-viewed** strip/section: reads `GET /recently-viewed`; record a view (`POST /recently-viewed`) from the PDP (the PDP itself is script `14` — expose a small hook/util here it can call). Works for guests (cookie) and customers (account).

---

## Acceptance criteria
- [ ] (backend) Searching a **misspelled** product term still returns the product (pg_trgm typo tolerance); a synonym (e.g. "tee") matches "t-shirt".
- [ ] (backend) `GET /search` returns correct results **and** facet counts, composable with sort + pagination; results carry `ts_headline` highlight snippets.
- [ ] (backend) Sorting supports relevance/price-asc/price-desc/newest/best-selling/top-rated (FR-222).
- [ ] (backend) Swapping **`SEARCH_DRIVER`** is the only change needed to point at a different provider — the `SearchProvider` interface and all callers stay unchanged.
- [ ] (backend) `GET /search/suggest` returns product + category suggestions quickly; all search endpoints are public `GET`.
- [ ] (backend) Recently-viewed persists per-account for customers and per-cookie for guests.
- [ ] (user_client) Search page reflects query/filters/sort in the URL; filter panel shows facet counts and composes with sort + pagination.
- [ ] (user_client) Autocomplete suggests as you type, **debounced ≤200ms**, keyboard-navigable; recently-viewed renders for guest and customer.
- [ ] `npm run build` (backend) and `npm run build`/typecheck (user_client) pass.
