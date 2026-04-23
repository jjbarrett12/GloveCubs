# GloveCubs — Full Productionization Audit

**Audit date:** 2025-03-02  
**Scope:** Entire repository. Goal: identify what is missing or broken for production-grade e‑commerce (discover, compare, purchase disposable gloves; normalized catalog; filters and search must work).

---

## SECTION 1 — Architecture Summary

### High-level structure

- **Three runnable apps**
  - **Root Express (`server.js`):** Primary B2B API — auth (JWT), cart, orders, Stripe, products CRUD, admin (parse-url, bulk import, AI), internal cron, webhooks. Single `package.json` at repo root. Deployed via `vercel.json` (Node) or `Procfile`.
  - **CatalogOS (Next.js 14, port 3010):** Catalog admin and storefront — ingestion, staging, review, publish, product-matching, RFQ/quotes, catalog API (`/api/catalog/*`). Uses `catalogos` Supabase schema (products, product_attributes, supplier_offers, staging, etc.). Dashboard and sensitive APIs protected by `CATALOGOS_ADMIN_SECRET` (Bearer or cookie).
  - **Storefront (Next.js 14, port 3004):** Buyer dashboard, supplier portal, AI (glove-finder, invoice), jobs/cron/worker, product search API. Uses Supabase with `canonical_products`, `supplier_offers`, `offer_trust_scores`, and storefront-specific tables (job_queue, rate_limit_events, supplier_users, etc.).

- **Database**
  - **Root `supabase/migrations/`:** 49 SQL files. Defines `catalogos` schema (suppliers, categories, brands, products, product_attributes, product_images, supplier_offers, ingestion_jobs, import_batches, supplier_products_raw, supplier_products_normalized, staging, publish_events, etc.), RLS, `product_best_offer_price` view, `commit_feed_upload` RPC, quote lifecycle, orders/carts/inventory, Stripe webhook events.
  - **Storefront `storefront/supabase/migrations/`:** 17 SQL files. Adds catalogos tables (e.g. `supplier_feed_uploads`, `supplier_feed_upload_rows`, `supplier_users`), agent/job/review tables, hardening (rate_limit_events, rate_limit_blocks), product search (alter `canonical_products` with search_vector, trigram). **Critical:** Storefront migrations assume table `canonical_products` exists; it is **not** created in root Supabase migrations. So either a view/sync from catalogos.products is required elsewhere, or storefront search is broken in a clean deploy.

- **Data flow**
  - **Catalog source of truth (CatalogOS):** `catalogos.products` (UUID) + `catalogos.product_attributes` + `catalogos.supplier_offers`. Catalog listing and facets use `product_best_offer_price` and attribute filters. Publish flow writes to these and (optionally) `live_product_id` to legacy public.products.
  - **Storefront product search:** Reads `canonical_products`, `supplier_offers`, `offer_trust_scores`. No single shared “product table” with CatalogOS; catalog listing is CatalogOS API; search is storefront’s own table. **Dual product model risk.**

- **Ingestion**
  - **Supplier feed upload (storefront):** CSV/XLSX upload → parse → AI extraction → normalization → preview → commit via `catalogos.commit_feed_upload` RPC (atomic). Tables: `catalogos.supplier_feed_uploads`, `catalogos.supplier_feed_upload_rows`.
  - **CatalogOS pipeline:** `POST /api/ingest` → `run-pipeline.ts` (fetch feed, parse, normalize, match, create offers). Batch/staging in `supplier_products_normalized`, then review/publish.
  - **OpenClaw (CatalogOS):** `POST /api/openclaw/run` — URL discovery + fetch + extract + normalize (site-filter only) → CSV/JSON for import. No auto-publish. **Not protected by CatalogOS admin middleware** (route not in matcher).
  - **Express admin:** Parse URL, bulk import, internal cron run; separate from CatalogOS staging.

- **Checkout / orders**
  - **Quotes:** CatalogOS Next.js — quote request submission (rate-limited by email), `create_quote_with_lines` RPC, idempotency key, status/notifications.
  - **Cart/orders/payment:** Express — cart API, order create, Stripe payment intent, webhooks. Orders and inventory in Supabase (public).

- **Auth**
  - **Express:** JWT (login/register/me), company/member, requireAdmin.
  - **CatalogOS:** Dashboard and `/api/ingest`, `/api/publish`, `/api/staging` protected by `CATALOGOS_ADMIN_SECRET`. No Supabase Auth for dashboard.
  - **Supplier portal (storefront):** Custom session (cookie), `supplier_users`, rate limit and lockout; RLS on feed uploads.

---

## SECTION 2 — Production Blockers

1. **Missing `getStagingRows` import in review actions**  
   `catalogos/src/app/actions/review.ts` calls `getStagingRows` in `publishAllApprovedInBatch` but does not import it (only `getStagingById` is imported). **Runtime error when “Publish all approved in batch” is used.**

2. **`canonical_products` table undefined in root migrations**  
   Storefront product search and several storefront features query `canonical_products`. Root Supabase migrations do not create this table. If it is not created by another process or view, **storefront search and any flow depending on it fail in production.**

3. **OpenClaw API unauthenticated**  
   `POST /api/openclaw/run` is not in CatalogOS middleware matcher. When `CATALOGOS_ADMIN_SECRET` is set, ingest/publish/staging are protected; OpenClaw remains **publicly callable** (expensive, SSRF exposure).

4. **Two migration roots with ordering risk**  
   Root `supabase/migrations/` and `storefront/supabase/migrations/` both touch `catalogos` and related objects. Application of migrations (order, env, single DB vs multiple) is not documented. **Risk of failed or inconsistent schema** (e.g. storefront feed_upload references `catalogos.supplier_users` which may only exist in storefront migrations).

5. **No single production deploy definition**  
   `vercel.json` only builds root Express. CatalogOS and storefront each have their own build; no Dockerfile; no documented “production build” that includes all three. **Deployment and env for all apps are ambiguous.**

6. **Quote RPC response shape**  
   Documentation notes that PostgREST may return RPC results as array; client code assumes object. **If `create_quote_with_lines` returns an array, quote creation can break.** Same pattern risk for `commit_feed_upload` response.

7. **Feed commit RPC in root migrations only**  
   `commit_feed_upload` lives in root `supabase/migrations/`. Storefront feed upload calls it. If only storefront migrations are ever applied to a DB, **RPC is missing and feed commit fails.**

---

## SECTION 3 — Data Model Problems

1. **Dual product representations**  
   - CatalogOS: `catalogos.products` (UUID) + `product_attributes` + `supplier_offers`.  
   - Storefront: `canonical_products` (used by search, offers, forecasting, jobs).  
   No clear definition of `canonical_products` (table vs view), no documented sync from catalogos.products. **Catalog and search can diverge or one side be empty.**

2. **Legacy vs catalogos IDs**  
   `catalogos.products` has `live_product_id` (BIGINT) for “published to public.products”. Express and some flows may still use public.products. **Risk of broken links or duplicate product concepts** (same glove in two systems).

3. **Supplier feed upload tables in storefront migrations**  
   `catalogos.supplier_feed_uploads` and `catalogos.supplier_feed_upload_rows` are created in storefront migrations; `commit_feed_upload` is in root. **Applying only one migration set leaves either tables or RPC missing.**

4. **`supplier_users` reference**  
   Storefront feed_upload migration references `catalogos.supplier_users(id)`. Root migrations do not create `catalogos.supplier_users`; it appears in storefront supplier_portal migration. **Schema dependency between two migration trees.**

5. **product_attributes multi-value and sell_price**  
   Migration adds multi-value and sell_price support. Code paths (filtering, facets, publish) must be consistent with how multi-value and sell_price are written/read. **Inconsistency can cause wrong filters or missing prices.**

6. **No unique constraint on (supplier_id, product_id, supplier_sku) for supplier_offers**  
   Duplicate offers per supplier/product/sku can be inserted unless enforced elsewhere. **Risk of duplicate or conflicting offers.**

---

## SECTION 4 — Missing Systems

1. **Single source of truth for “live” product list**  
   No documented process that keeps “what the storefront shows” in sync with catalogos (e.g. one view or one sync job from catalogos.products → canonical_products or public.products). **Required for search and catalog to match.**

2. **CDN / image storage strategy**  
   `product_images.url` and product `image_url` are plain URLs. No Supabase Storage, signed URLs, or CDN policy. **Broken or slow images; no access control.**

3. **Structured observability**  
   No Sentry, OpenTelemetry, or APM. Custom telemetry writes to Supabase (error_events). **Hard to triage production errors and latency.**

4. **Request-level rate limiting on CatalogOS and storefront APIs**  
   CatalogOS: no rate limit on `/api/catalog/*`, `/api/openclaw/run`, `/api/ingest`. Storefront: rate limit exists for supplier auth and some hardening; not applied to all API routes. **Abuse and cost risk.**

5. **Caching layer**  
   No Redis or shared cache. Synonym provider and webhook idempotency use in-memory cache (lost on restart, not shared across instances). **Scalability and consistency limits.**

6. **Cron / worker contract**  
   Storefront has daily/weekly/nightly cron and worker endpoint; CatalogOS has no cron (ingestion is on-demand). No single doc for “which cron runs where” and what happens if they fail. **Operational ambiguity.**

7. **SEO and metadata**  
   Minimal: a few Next.js `metadata` exports and legacy `seo_slug`. No sitemap, robots.txt, or structured product metadata at scale. **Weak discoverability and rich results.**

8. **Inventory visibility in catalog**  
   Inventory (orders/carts, Fishbowl, reserved stock) exists in migrations and Express; catalog/quote APIs do not expose “in stock” or lead time consistently. **Buyers may not see availability.**

9. **Duplicate SKU / offer detection at write path**  
   Duplicate detection exists in product-matching and anomaly service; no guaranteed unique constraint or upsert policy on (supplier_id, product_id, supplier_sku). **Duplicate offers possible.**

10. **Admin audit trail UI**  
    Audit data exists (supplier_audit_log, quote_status_history, publish_events). No unified admin view for “who did what when.” **Compliance and debugging are harder.**

---

## SECTION 5 — Risk Ranking

### Critical (must fix before production)

- Missing `getStagingRows` import → **publish-all-approved-in-batch fails.**
- `canonical_products` not defined in applied migrations → **storefront search and dependent features fail.**
- OpenClaw endpoint unauthenticated → **abuse and SSRF.**
- No single definition of “live products” and sync path → **catalog and search can be wrong or empty.**

### High

- Two migration roots and undefined application order → **schema incomplete or inconsistent.**
- No rate limiting on catalog, ingest, OpenClaw → **cost and abuse.**
- RPC response shape (quote, feed commit) not defensive → **runtime errors under different PostgREST behavior.**
- No CDN/storage strategy for images → **reliability and performance.**
- Dual product model (catalogos.products vs canonical_products) without sync → **data drift and bugs.**

### Medium

- No Dockerfile / single production build → **deploy and env confusion.**
- Observability only custom Supabase → **slow incident response.**
- In-memory rate limit store in storefront → **lost on restart; not shared across instances.**
- SEO minimal → **weaker discovery.**
- No admin audit UI → **harder compliance and ops.**

### Low

- Synonym cache in-memory → **acceptable for single instance; document TTL.**
- No Redis → **acceptable for initial scale; document limits.**
- Cron documentation incomplete → **operational burden but not immediate break.**

---

## SECTION 6 — Recommended Fixes

1. **Code**  
   - In `catalogos/src/app/actions/review.ts`, add `import { getStagingRows } from "@/lib/review/data"` (or equivalent) so `publishAllApprovedInBatch` resolves `getStagingRows`.

2. **OpenClaw**  
   - Add `/api/openclaw` to CatalogOS admin middleware matcher and require same `CATALOGOS_ADMIN_SECRET` (or integrate with existing auth). Optionally add rate limit and request timeout.

3. **Data model**  
   - Define and implement single “live product” source: either (a) create `canonical_products` in migrations as a view over catalogos.products + attributes + best price, or (b) document and run a sync job from catalogos.products → `canonical_products` (table), and ensure migrations that need it run after it exists.  
   - Unify migration strategy: single ordered migration set (e.g. root + storefront merged with clear ordering), or document “apply root first, then storefront” and ensure no duplicate object definitions.

4. **RPC responses**  
   - For `create_quote_with_lines` and `commit_feed_upload`, handle both array and single-object PostgREST responses (e.g. `Array.isArray(data) ? data[0] : data`) before reading fields.

5. **Rate limiting**  
   - Add rate limits for CatalogOS: `/api/catalog/*` (per IP or key), `/api/ingest`, `/api/openclaw/run`. Use persistent store (DB or Redis) if multiple instances run.

6. **Images**  
   - Introduce Supabase Storage (or other bucket) for product images; store references in DB; optionally put a CDN in front. Document URL format and access.

7. **Observability**  
   - Add Sentry (or similar) for catalogos and storefront; optionally OpenTelemetry. Keep existing telemetry as supplement; ensure ingestion and publish failures are captured.

8. **Deployment**  
   - Document production topology (Express, CatalogOS, storefront — ports, env, which DB). Add Dockerfile(s) or a single “build all” script if needed. List required env vars per app in one place.

9. **Offers uniqueness**  
   - Add unique constraint or use upsert on (supplier_id, product_id, supplier_sku) for supplier_offers (or document why duplicates are allowed and how they are resolved).

10. **Testing and CI**  
    - Run unit/integration tests in CI (e.g. catalogos Vitest, storefront tests). Fix or isolate failing tests so deploy is gated on green.

---

## SECTION 7 — Implementation Roadmap

**Phase 1 — Unblock launch (Critical)**  
1. Fix `getStagingRows` import in `review.ts`.  
2. Resolve `canonical_products`: add view/migration or sync and ensure storefront search runs against it.  
3. Protect OpenClaw: add to admin middleware (and optionally rate limit).  
4. Harden RPC response handling for quote create and feed commit.

**Phase 2 — Data and schema (High)**  
5. Unify migration strategy: single ordered set or documented two-step apply; ensure supplier_users, supplier_feed_uploads, and commit_feed_upload RPC all exist in target DB.  
6. Document and implement “live product” sync (catalogos → storefront/search).  
7. Add rate limiting for catalog, ingest, OpenClaw (persistent store if multi-instance).

**Phase 3 — Reliability and ops (High/Medium)**  
8. Image storage and CDN strategy (bucket + optional CDN).  
9. Error tracking (e.g. Sentry) for catalogos and storefront.  
10. Deployment and env documentation; optional Dockerfile(s).

**Phase 4 — Polish (Medium/Low)**  
11. SEO: sitemap, robots, product metadata.  
12. Admin audit trail UI (read-only over existing audit tables).  
13. Offer uniqueness (constraint or upsert).  
14. Replace or document in-memory rate limit store for multi-instance.

---

*End of audit. No code was generated; this document is for engineering planning and prioritization only.*
