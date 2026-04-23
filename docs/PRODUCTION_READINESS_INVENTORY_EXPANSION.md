# Production Readiness + Inventory Expansion — GloveCubs

**Date:** 2026-03-25  
**Scope:** Full-repo architecture review with emphasis on catalog/inventory durability and multi–product-line expansion.

---

## 1. Current architecture assessment

### What is solid

- **Dual schema intent:** `catalogos.*` for supplier/staging/canonical catalog vs `public.products` for legacy B2B storefront is a recognizable split; views (`public.supplier_offers`, etc.) reduce client coupling to internal schema.
- **Attribute dictionary (catalogos):** Migrations seed category-scoped attribute definitions (`attribute_definitions`) — the right direction for typed facets vs free-form-only JSON.
- **Staging tables:** `supplier_products_normalized`, expansion/sync lifecycle migrations exist for pipeline thinking.
- **Storefront search:** `productSearch.ts` uses FTS RPC with telemetry + ILIKE fallback; defensive mapping of RPC rows.
- **TypeScript in storefront:** Jobs, search, and admin import paths are separated; Vitest covers search normalization.

### What is brittle

- **`public.canonical_products.glove_type`:** Column name and sync logic encode hand-protection semantics into the global search surface. New lines (glasses, masks) either misuse the column or bypass it inconsistently.
- **Hardcoded facet vocabulary in search:** Materials/sizes/types were inline in `parseSearchTokens` — every new line would have required editing core search code.
- **Schema drift:** Hand-maintained `Database` types in `storefront/src/lib/supabase/types.ts` do not list `canonical_products`; RPC return shapes are untyped at compile time.
- **Two product worlds:** Express `public.products` (SKU, price, glove-oriented columns) vs `catalogos.products` + sync to `canonical_products` — reconciliation and single source of truth for “what customer sees” are not fully unified in code.
- **Normalization duplication:** `lib/productNormalization.js` (legacy), `storefront/src/lib/legacy/productNormalization.ts`, `catalogos` services — same concerns in multiple stacks.

### What breaks when adding product lines

- Category slugs without a **line assignment** default to `ppe_gloves` in sync — misclassified merchandising/search.
- UI/admin filters that assume **Disposable Gloves / Work Gloves** only (`public/js/app.js`, admin filters).
- **FTS trigger** weights `glove_type` into `search_vector` for all rows — semantically wrong for non-glove lines unless attributes replace meaning.
- **Find-my-glove / scoring** (`storefront/src/lib/gloves/scoring.ts`) is inherently line-specific — must not become the default for non-PPE categories.

### Duplicated logic (representative)

- Search token lists ↔ product normalization synonyms ↔ CSV import defaults (`Disposable Gloves`).
- Material/color/size extraction in catalogos extractors vs canonical sync denormalized columns.

### Schema too glove-specific

- `canonical_products.glove_type`, comments on `product_families` (“glove line”), `find_my_glove` tables, seeded `disposable_gloves` attribute scope — acceptable as **bounded contexts** if clearly namespaced; problematic when treated as **the** catalog model.

---

## 2. Target architecture (inventory / catalog)

| Layer | Responsibility |
|--------|----------------|
| **Raw supplier** | Immutable or append-only raw feed rows + file hash / batch id (idempotent ingestion). |
| **Staging normalized** | `supplier_products_normalized` (+ family inference columns): validated shape, anomaly flags, no customer visibility. |
| **Master / draft catalog** | `catalogos.products` + JSONB `attributes` aligned to `attribute_definitions` per category. |
| **Published read model** | `public.canonical_products` (+ optional materialized views): denormalized hot facets for search, **product_line_code**, legacy columns only as compat projections. |
| **Customer storefront** | Read-only from published surface + APIs; no direct writes to published tables from browser. |
| **Pricing / offers** | `supplier_offers` + trust scores; list/cost rules in service layer, not in React props. |
| **Domain config** | `catalogos.product_line_definitions` + `catalogos.category_product_line` (DB) + **TypeScript facet registry** for token parsing (this PR). |

**Principles:** declarative line + category maps; machine-usable attributes; audit trail of batch → staging → publish; zod (or equivalent) at API boundaries for publish payloads.

---

## 3. Implemented changes (this pass)

| Path | Change |
|------|--------|
| `supabase/migrations/20260327100000_product_line_registry.sql` | `catalogos.product_line_definitions`, `catalogos.category_product_line`, `canonical_products.product_line_code`, updated `catalogos.sync_canonical_products()`, backfill from category slug / FK. |
| `storefront/src/lib/catalog/product-line-registry.ts` | Typed product line codes + **per-line search facet vocabulary** (no glove terms scattered in search service). |
| `storefront/src/lib/catalog/search-query.ts` | `normalizeSearchQuery` / `parseSearchTokens` with optional `productLineCode`. |
| `storefront/src/lib/catalog/canonical-read-model.ts` | `mapCanonicalRowToSearchFacets` + `primaryVariantStyle` vs legacy `glove_type` mapping. |
| `storefront/src/lib/catalog/published-product-schema.ts` | Zod core schema + margin guard helper for admin/API use. |
| `storefront/src/lib/catalog/index.ts` | Barrel exports. |
| `storefront/src/lib/search/productSearch.ts` | Uses catalog module; `SearchOptions.filters.product_line_code`; selects `product_line_code`; similar products prefer same line. |
| `storefront/src/lib/catalog/search-query.test.ts` | Line-aware behavior tests. |

**Why this scales:** new categories add a **DB map row** + a **registry entry** (facet tokens); search and sync do not require renaming `glove_type` immediately (deprecated semantically via comments + read-model naming).

---

## 4. Explicitly not changed (yet) — why

- **RPC `search_products_fts`:** Still returns `glove_type`; clients get enriched attributes via `mapProductToResult`. Extending the RPC signature is a coordinated DB + deploy change — follow-up.
- **`update_product_search_vector` trigger:** Still indexes `glove_type`; for non-glove lines, rely on `name`/`category`/`material` until a migration generalizes weights (e.g. `coalesce(attributes->>'product_type', glove_type)`).
- **Legacy Express `public.products` / `public/js/app.js`:** Large surface; should consume APIs that return `product_line_code` rather than duplicating category strings — separate migration project.
- **catalogos Next app:** Normalization services remain; recommend importing shared types from a future `packages/catalog-domain` — not introduced here to avoid monorepo tooling scope creep.

---

## 5. Migrations / backfill before launch

1. **Apply** `20260327100000_product_line_registry.sql` on the environment that owns `catalogos` + `public.canonical_products`.
2. **Run** `SELECT catalogos.sync_canonical_products();` after deploy so `product_line_code` is populated for all active rows.
3. **Verify** `canonical_products.category` values match `catalogos.categories.slug` where possible; if legacy rows store display names (`Disposable Gloves`), backfill slug or add map aliases (not in this migration).
4. **Optional:** Add partial unique constraints on staging tables for `(supplier_id, supplier_sku, batch_id)` if not already present — idempotency audit recommended.

---

## 6. Gaps (honest)

- No end-to-end **publish workflow** test from staging → `catalogos.products` → sync in CI.
- **Tenant isolation** (if multi-tenant later) not modeled in `canonical_products`.
- **Image/document** pipeline not unified (URLs in JSON vs columns) — document in media service spec.
- **Quote/order** line items still likely reference legacy SKU + price snapshots — confirm FK to stable `product_id` UUID where catalogos is source.

---

## 7. Recommended next steps (priority)

1. Extend `search_products_fts` + trigger to include `product_line_code` and generic `attributes` keys in `tsvector` where safe.
2. Introduce **`packages/catalog-domain`** (or `src/domain/catalog`) shared by `storefront` and `catalogos` for types + zod only.
3. Replace hardcoded admin category `<select>` options with **API-driven** categories from `catalogos.categories`.
4. Add **idempotency keys** to bulk import and feed commit RPCs (verify `20260403000001_feed_commit_atomic_rpc.sql` coverage).

---

## 8. File change summary

- `supabase/migrations/20260327100000_product_line_registry.sql` (new)  
- `storefront/src/lib/catalog/*` (new)  
- `storefront/src/lib/search/productSearch.ts` (refactor)  
- `docs/PRODUCTION_READINESS_INVENTORY_EXPANSION.md` (this file)
