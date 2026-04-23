# Productionization implementation report

**Source of truth:** [PRODUCTIONIZATION_AUDIT.md](../PRODUCTIONIZATION_AUDIT.md)  
**Date:** 2025-03-02

This report summarizes the changes made to address Critical, High, and Medium items from the audit. Code and migrations were applied directly; no stubs were left unless noted.

---

## Completed fixes

### Phase 1 — Critical

| Audit item | Fix | File(s) / change |
|------------|-----|-------------------|
| **A. Missing `getStagingRows` import** | Added `getStagingRows` to the import from `@/lib/review/data`. | `catalogos/src/app/actions/review.ts` |
| **B. `canonical_products` undefined** | Added root migration that creates `public.canonical_products`, sync function `catalogos.sync_canonical_products()`, and initial backfill. Publish flow calls sync after each successful publish. | `supabase/migrations/20260404000001_canonical_products_table_and_sync.sql`, `catalogos/src/lib/publish/publish-service.ts` |
| **C. OpenClaw unauthenticated** | Protected `/api/openclaw` with the same admin gate as ingest/publish/staging (middleware + matcher). | `catalogos/src/middleware.ts` |
| **D. Quote/feed RPC response shape** | Normalized PostgREST response: treat RPC result as array or single object before reading fields. | `catalogos/src/lib/quotes/service.ts`, `storefront/src/lib/supplier-portal/feedUpload.ts` |
| **E. Feed commit RPC in migration chain** | Documented that root migrations must be applied first so `commit_feed_upload` exists before storefront feed upload is used. | `docs/MIGRATION_ORDER.md` |

### Phase 2 — High

| Audit item | Fix | File(s) / change |
|------------|-----|-------------------|
| **F. Dual product model** | Established single live-product surface: `public.canonical_products` populated from `catalogos.products` via `sync_canonical_products()`. Sync runs after publish and can be run on a schedule. | Same migration + publish-service sync call; `docs/PRODUCTION_DEPLOYMENT.md` |
| **G. Migration-root ambiguity** | Defined deterministic order: apply root `supabase/migrations/` first, then `storefront/supabase/migrations/` on the same DB. | `docs/MIGRATION_ORDER.md` |
| **H. Rate limiting** | Added per-IP rate limits in CatalogOS middleware: 10 req/min for `/api/openclaw` and `/api/ingest`, 60 req/min for other admin APIs. | `catalogos/src/middleware.ts` |
| **I. Unique constraint supplier_offers** | No code change. Constraint `uq_supplier_offers_supplier_product_sku` already exists in `catalogos.supplier_offers`. | — |

### Phase 3 — High/Medium

| Audit item | Fix | File(s) / change |
|------------|-----|-------------------|
| **J. Image strategy** | No code change. Documented current state: `product_images.url` and product `image_url` are plain URLs; recommend Supabase Storage + CDN for production. | `docs/PRODUCTION_DEPLOYMENT.md` (observability / security section); image strategy called out in “Remaining risks” below. |
| **K. Observability** | Added structured logging for CatalogOS: `lib/observability.ts` with categories (ingestion_failure, publish_failure, sync_canonical_products_failure, rpc_failure, validation_failure). Publish-service logs sync failures via this module. | `catalogos/src/lib/observability.ts`, `catalogos/src/lib/publish/publish-service.ts` |
| **L. Production deployment definition** | Single doc: env vars per app, migration order, app startup, workers/cron, canonical_products sync, security, observability. | `docs/PRODUCTION_DEPLOYMENT.md` |
| **M. Cross-migration dependencies** | Documented in MIGRATION_ORDER: storefront migrations depend on root for RPCs and `canonical_products`; root does not create `supplier_users` or `supplier_feed_uploads` (those are in storefront). | `docs/MIGRATION_ORDER.md` |

### Phase 4 — Medium (safe)

| Audit item | Fix | File(s) / change |
|------------|-----|-------------------|
| **N. SEO** | Added `public/robots.txt` at repo root (Allow: /). Next.js apps can add `app/robots.ts` or route handlers for sitemap later. | `public/robots.txt` |
| **O. Admin audit UI** | Not implemented (larger feature). Audit data remains in DB (`supplier_audit_log`, `quote_status_history`, `publish_events`). | — |
| **P. Rate-limit persistence** | CatalogOS rate limit is in-memory (per instance). Documented in deployment doc; for multi-instance, a shared store (e.g. Redis or DB) is required. | `docs/PRODUCTION_DEPLOYMENT.md`, `catalogos/src/middleware.ts` (inline comment could be added) |

### Phase 5 — Storefront search schema & reliability (next pass)

**What was wrong:** Storefront uses `supabaseAdmin` (default schema = public). Product search and the `search_products_fts` RPC referenced `supplier_offers`, `offer_trust_scores`, and `suppliers`, which exist only in `catalogos`. So in a fresh production DB, search would either fail or return no offers/trust data. **Fix:** Public views over `catalogos.supplier_offers`, `catalogos.offer_trust_scores`, and `catalogos.suppliers` so the same client and RPC see a single stable surface in `public`.

| Item | Fix | File(s) / change |
|------|-----|-------------------|
| **Storefront search schema** | Storefront uses `supabaseAdmin` (default schema = public). `supplier_offers`, `offer_trust_scores`, and `suppliers` live in `catalogos`. Added public views so search and `search_products_fts` RPC resolve correctly. | `supabase/migrations/20260404000002_public_views_for_storefront_search.sql` |
| **Search reliability** | Defensive handling: RPC result normalized (array or single object); null/empty offers and trust scores; safe filter lengths; getOfferData handles missing price (cost fallback); mapProductToResult guards null fields; getSearchCount returns 0 on error. | `storefront/src/lib/search/productSearch.ts` |
| **Search observability** | `logSearchFailure` in storefront telemetry; FTS errors logged then fallback; API route logs on 500. | `storefront/src/lib/hardening/telemetry.ts`, `storefront/src/app/api/products/search/route.ts` |
| **Image strategy** | Shared helper `resolveProductImageUrl` / `resolveFirstProductImageUrl` and placeholder path; placeholder SVG asset. Components can use for safe product image display. | `storefront/src/lib/images.ts`, `storefront/public/images/placeholder-product.svg` |

### Phase 6 — Observability, image standardization, runtime resilience

| Item | Fix | File(s) / change |
|------|-----|-------------------|
| **error_telemetry in root** | Ensure table exists regardless of migration order. Root migration creates `public.error_telemetry` and `public.error_alerts` (IF NOT EXISTS). | `supabase/migrations/20260404000003_error_telemetry_public.sql` |
| **Telemetry contract** | Storefront: added `api_failure`, `publish_failure`; `logApiFailure`, `logPublishFailure`; sanitize context (strip secrets, cap lengths); `logErrorEvent` never throws. CatalogOS: observability writes to `public.error_telemetry` (best-effort); added `api_failure`, `auth_failure`, `logApiFailure`, `logAuthFailure`. | `storefront/src/lib/hardening/telemetry.ts`, `catalogos/src/lib/observability.ts` |
| **Image usage** | CatalogOS product page and ProductGrid use `resolveProductImageUrl` / `resolveFirstProductImageUrl`; placeholder asset in catalogos public; single img with placeholder when no image. | `catalogos/src/lib/images.ts`, `catalogos/src/app/(storefront)/product/[slug]/page.tsx`, `catalogos/src/app/(storefront)/catalog/[category]/ProductGrid.tsx`, `catalogos/public/images/placeholder-product.svg` |
| **API/route hardening** | CatalogOS ingest, publish, openclaw/run: catch → log via observability, return stable user-facing error (no raw messages). Storefront search: safe limit/offset parsing (NaN guard, cap 100). | `catalogos/src/app/api/ingest/route.ts`, `catalogos/src/app/api/publish/route.ts`, `catalogos/src/app/api/openclaw/run/route.ts`, `storefront/src/app/api/products/search/route.ts` |
| **Telemetry resilience** | `getErrorStats`, `getRecentErrors`, `getUnacknowledgedAlerts` wrapped in try/catch; return empty stats/arrays on failure so telemetry never crashes callers. | `storefront/src/lib/hardening/telemetry.ts` |

### Phase 7 — Final production hardening (launch-ready)

| Item | Fix | File(s) / change |
|------|-----|-------------------|
| **Shared rate limit tables** | Root migration creates `public.rate_limit_events` and `public.rate_limit_blocks` (IF NOT EXISTS) so both apps share the same tables. | `supabase/migrations/20260404000004_rate_limit_tables_public.sql` |
| **CatalogOS DB-backed rate limiting** | Replaced in-memory Map with DB-backed `checkAndRecordRateLimit()` using public.rate_limit_events/blocks. Middleware is async and returns stable 429 message. Multi-instance safe. | `catalogos/src/lib/rate-limit.ts`, `catalogos/src/middleware.ts` |
| **Sentry integration** | Added `@sentry/nextjs` to CatalogOS and Storefront. Server/edge init via `instrumentation.ts` when `SENTRY_DSN` set; client init via `SentryLoader` + `sentry-client-init.ts`. `captureException()` helper (no secret leakage). High/critical telemetry events also sent to Sentry. Validation noise filtered in beforeSend. | `catalogos/sentry.*.config.ts`, `storefront/sentry.*.config.ts`, `*/instrumentation.ts`, `*/src/lib/sentry.ts`, `*/src/components/SentryLoader.tsx`, `*/src/lib/sentry-client-init.ts`, observability + telemetry wiring |
| **Deployment validation** | `validateCriticalEnv()` / `assertCriticalEnv()` in both apps; run from `instrumentation.ts` (Node). In production, missing `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` fails startup. | `catalogos/src/lib/env.ts`, `storefront/src/lib/env.ts`, both `instrumentation.ts` |
| **PRODUCTION_DEPLOYMENT.md** | Updated: rate limiting (DB-backed), Sentry, startup validation. | `docs/PRODUCTION_DEPLOYMENT.md` |

---

## Files changed

- `catalogos/src/app/actions/review.ts` — import `getStagingRows`
- `catalogos/src/middleware.ts` — OpenClaw in admin paths, matcher, per-IP rate limiting
- `catalogos/src/lib/quotes/service.ts` — RPC response normalization (array or object)
- `catalogos/src/lib/publish/publish-service.ts` — post-publish `sync_canonical_products` + structured log on failure
- `catalogos/src/lib/observability.ts` — **new** structured logging
- `storefront/src/lib/supplier-portal/feedUpload.ts` — `commit_feed_upload` RPC response normalization
- `storefront/src/lib/search/productSearch.ts` — defensive search, FTS fallback logging, safe filters/offers
- `storefront/src/lib/hardening/telemetry.ts` — `logSearchFailure` + `search_failure` category
- `storefront/src/lib/hardening/index.ts` — export `logSearchFailure`
- `storefront/src/lib/images.ts` — **new** image URL resolution + placeholder policy
- `storefront/src/app/api/products/search/route.ts` — log search failures on 500, safe limit/offset
- `supabase/migrations/20260404000001_canonical_products_table_and_sync.sql` — **new** migration
- `supabase/migrations/20260404000002_public_views_for_storefront_search.sql` — **new** public views
- `supabase/migrations/20260404000003_error_telemetry_public.sql` — **new** (Phase 6)
- `storefront/public/images/placeholder-product.svg` — **new** placeholder asset
- `storefront/src/lib/hardening/telemetry.ts` — categories api_failure, publish_failure; sanitize context; defensive getErrorStats/getRecentErrors/getUnacknowledgedAlerts
- `storefront/src/lib/hardening/index.ts` — export logApiFailure, logPublishFailure
- `catalogos/src/lib/observability.ts` — write to public.error_telemetry; api_failure, auth_failure
- `catalogos/src/lib/images.ts` — **new** image resolution + placeholder
- `catalogos/src/app/(storefront)/product/[slug]/page.tsx` — use resolveFirstProductImageUrl, resolveProductImageUrl
- `catalogos/src/app/(storefront)/catalog/[category]/ProductGrid.tsx` — use resolveProductImageUrl
- `catalogos/public/images/placeholder-product.svg` — **new**
- `catalogos/src/app/api/ingest/route.ts` — log ingestion failure, stable error response
- `catalogos/src/app/api/publish/route.ts` — safe req.json(), log publish failure, stable error response
- `catalogos/src/app/api/openclaw/run/route.ts` — log api failure, stable error response
- `docs/MIGRATION_ORDER.md` — **new**
- `docs/PRODUCTION_DEPLOYMENT.md` — **new**
- `docs/PRODUCTIONIZATION_IMPLEMENTATION_REPORT.md` — **new** (this file)
- `public/robots.txt` — **new**

---

## Migrations added

- `20260404000001_canonical_products_table_and_sync.sql`: creates `public.canonical_products`, `catalogos.sync_canonical_products()`, and initial backfill.
- `20260404000002_public_views_for_storefront_search.sql`: creates `public.supplier_offers`, `public.offer_trust_scores`, and `public.suppliers` as views over `catalogos.*` so storefront search (and `search_products_fts` RPC) work with default public schema.
- `20260404000003_error_telemetry_public.sql`: creates `public.error_telemetry` and `public.error_alerts` (IF NOT EXISTS) so both storefront and catalogos can write telemetry regardless of which app’s migrations run first.
- `20260404000004_rate_limit_tables_public.sql`: creates `public.rate_limit_events` and `public.rate_limit_blocks` (IF NOT EXISTS) for shared multi-instance rate limiting.

No migrations were removed or reordered. Apply root migrations first, then storefront, as in MIGRATION_ORDER.md.

---

## Remaining risks

1. **Storefront search schema** — **Resolved.** Public views (`public.supplier_offers`, `public.offer_trust_scores`, `public.suppliers`) provide a stable query surface. Ensure root migration `20260404000002` is applied before or with other root migrations so the views exist when storefront runs.

2. **Images**  
   Foundation in place: `storefront/src/lib/images.ts` and placeholder asset. Product images are still plain URLs; for production, add Supabase Storage or CDN and use the same helper for resolution.

3. **Rate limit store** — **Resolved.** CatalogOS uses DB-backed rate limiting (public.rate_limit_events/blocks). Same tables as Storefront; limits are shared across instances.

4. **Sentry / APM** — **Resolved.** Sentry integrated in both apps; set `SENTRY_DSN` (and optionally `NEXT_PUBLIC_SENTRY_DSN`) to enable. No-op when unset.

5. **Admin audit UI**  
   Not built; audit tables are populated and queryable in DB only.

6. **error_telemetry table** — **Resolved.** Root migration `20260404000003` creates `public.error_telemetry` and `public.error_alerts` so the table exists whether root or storefront migrations run first. CatalogOS observability writes to it (best-effort); storefront telemetry already did. Logging is defensive: telemetry failure never crashes the app.

---

## Manual steps

1. **Run new migration**  
   Apply `supabase/migrations/20260404000001_canonical_products_table_and_sync.sql` (or run `supabase db push` from root so all root migrations are applied). Then apply storefront migrations if not already done.

2. **Set `CATALOGOS_ADMIN_SECRET`**  
   In production, set this so dashboard and `/api/ingest`, `/api/publish`, `/api/staging`, `/api/openclaw` are protected.

3. **Optional: periodic sync**  
   To refresh `public.canonical_products` on a schedule (e.g. nightly), call `SELECT catalogos.sync_canonical_products();` from a cron job or worker.

4. **Verify storefront search**  
   After applying **both** root migrations (`20260404000001` and `20260404000002`), confirm storefront product search and `search_products_fts` RPC work. The public views make `canonical_products`, `supplier_offers`, and `offer_trust_scores` all visible in the default schema.

5. **Product images**  
   CatalogOS product page and catalog grid use the shared image helpers; storefront has `@/lib/images`. Use `resolveProductImageUrl()` / `resolveFirstProductImageUrl()` everywhere product images are rendered. Add Supabase Storage (or CDN) later and keep the same helper contract.

6. **Apply root migration 20260404000003**  
   Run `supabase db push` (or apply the new error_telemetry migration) so `public.error_telemetry` exists for both apps.

7. **Apply root migration 20260404000004**  
   So `public.rate_limit_events` and `public.rate_limit_blocks` exist for shared rate limiting.

---

## Launch checklist (exact order)

1. **Database**  
   Apply migrations in order: **root** `supabase/migrations/` (all, by filename) → **storefront** `storefront/supabase/migrations/` (all, by filename). Same DB for all apps.

2. **Environment variables (required in production)**  
   - **CatalogOS:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `CATALOGOS_ADMIN_SECRET` (recommended in prod), `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.  
   - **Storefront:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `NEXT_PUBLIC_GLOVECUBS_API`, `CRON_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.  
   - **Express (root):** `PORT`, `NODE_ENV`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

3. **Startup**  
   In production, CatalogOS and Storefront will fail fast on missing required env (see instrumentation.ts). Start Express, then CatalogOS, then Storefront (or per your host).

4. **Post-deploy**  
   Verify product search (storefront), admin auth (CatalogOS dashboard), and optional: run `SELECT catalogos.sync_canonical_products();` if you need a full refresh of the live product table.

---

## Rollback considerations

- **Migrations:** Root migrations are additive (CREATE IF NOT EXISTS, new tables/views). Rollback = manually drop new objects or restore from backup; no down migrations in repo.
- **Rate limiting:** If DB rate limit tables are unavailable, CatalogOS rate limiter fails open (allows request). Storefront rate limiter falls back to in-memory.
- **Sentry:** Unset `SENTRY_DSN` to disable; no code change needed.

---

## Recommended next steps

- Introduce image storage (e.g. Supabase Storage) and keep using `storefront/src/lib/images.ts` / `catalogos/src/lib/images.ts` for resolution.
- Add a read-only admin audit view over `supplier_audit_log`, `quote_status_history`, and `publish_events` if compliance or ops need it.
- Optionally wrap next.config with `withSentryConfig` (and set `SENTRY_ORG`, `SENTRY_PROJECT`) for source maps and full Sentry Next.js features.
- **Phase 7:** `catalogos/src/lib/rate-limit.ts`, `catalogos/src/middleware.ts` (DB-backed rate limit), `supabase/migrations/20260404000004_rate_limit_tables_public.sql`, Sentry configs and loaders in both apps, `*/src/lib/sentry.ts`, `*/src/lib/env.ts`, `*/instrumentation.ts`, `docs/PRODUCTION_DEPLOYMENT.md`.
