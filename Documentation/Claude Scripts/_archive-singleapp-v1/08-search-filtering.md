# 08 — Search, Filtering & Sorting

**Goal:** Full-text product search with typo tolerance, faceted filtering, sorting, and autocomplete. Implemented on **PostgreSQL full-text search** behind a swappable interface (so Meilisearch/Typesense can replace it later without touching callers). SRD FR-220–FR-224.

**Prerequisites:** Script `07` (catalog).

---

## Tasks

### 1. Search abstraction
- `src/server/services/search/SearchProvider.ts` — interface: `search(query, { filters, sort, page, facets })`, `suggest(query)`, `indexProduct/removeProduct`.
- `PgSearchProvider` — the default implementation using Postgres.
- Export a single `searchProvider` chosen by env (`SEARCH_DRIVER=pg`), so a future `MeiliSearchProvider` is a drop-in.

### 2. Postgres FTS
- Add a `tsvector` column (generated or maintained) over product title + description + tags; GIN index. Use `websearch_to_tsquery`.
- **Typo tolerance / fuzzy**: enable `pg_trgm` extension; combine `ts_rank` with trigram similarity for near-matches. **Synonyms**: a small synonyms map applied at query build time (e.g. "tee"→"t-shirt").
- **Highlighting**: use `ts_headline` for result snippets (FR-220).
- Migration adds the extension + index; document in schema.

### 3. Faceted filtering (FR-221)
- Facets: category, price range, brand, rating, availability (in stock). Return facet counts alongside results.
- Filters composable with search and with plain category browsing.

### 4. Sorting (FR-222)
- relevance (default when query present), price asc/desc, newest, best-selling (by order item counts), top-rated (by aggregate rating).

### 5. Autocomplete / suggestions (FR-223)
- `search.suggest` returns product/category suggestions; storefront input **debounced ≤200ms** (NFR-106 target ≤200ms).

### 6. Recently viewed (FR-224)
- Track per session (cookie) for guests, per account for customers; expose `recentlyViewed` query. Store last N product ids.

### 7. tRPC + UI hooks
- `search` router: `query`, `suggest`, `facets`. Reindex hook on product create/update/delete.
- Storefront search bar + results wiring happens in script `14`; here provide the API + a minimal test page.

---

## Acceptance criteria
- [ ] Searching a misspelled product term still returns the product (typo tolerance).
- [ ] Faceted filters return correct results **and** facet counts; combine with sort + pagination.
- [ ] Autocomplete suggests as you type, debounced ≤200ms.
- [ ] Swapping `SEARCH_DRIVER` is the only change needed to point at a different provider (interface stable).
- [ ] Recently viewed works for guest (cookie) and customer (account).
