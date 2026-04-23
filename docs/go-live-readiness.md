# GloveCubs — Go-Live Readiness (Release Captain)

**Purpose:** Production readiness across catalog, commerce, operations, platform, and security.  
**Audience:** Release captain, engineering lead, SRE.  
**Date:** 2026-03-02  
**Related audits:** `docs/full-stack-sync-audit.md`, `docs/CATALOG_INGESTION_FILTER_LAUNCH_AUDIT.md`, `docs/ADMIN_INGESTION_CONSOLE_VERIFICATION_AUDIT.md`, `docs/INGESTION_PIPELINE_LARGE_BATCH_AUDIT.md`, `docs/P0_LAUNCH_HARDENING_VERIFICATION.md`

---

## 1. Launch blockers

These should be resolved or explicitly accepted with a signed risk decision before calling the release “production ready.”

| ID | Area | Issue | Required action |
|----|------|--------|----------------|
| **LB-1** | **Orders / inventory** | Legacy `order_items.product_id` / `inventory.product_id` are **BIGINT**; live catalog is **UUID**. | **Implemented:** additive `canonical_product_id`, backfill via `catalogos.products.live_product_id`, FKs, views — see **`docs/order-inventory-id-alignment.md`**. Checkout must **write UUID** on new lines; reconcile NULL backfill rows before launch. |
| **LB-2** | **Catalog bridge** | Canonical publish path **`runPublish`** does not update **`live_product_id`** / **`public.products`**; only alternate publish code paths did historically. Anything still reading **legacy `public.products`** may **miss** catalogos-only SKUs. | Either **upsert `public.products` + set `live_product_id`** from `runPublish`, or **deprecate** legacy reads and document the single source of truth. |
| **LB-3** | **Admin ingestion at scale** | Bulk approve / publish **server actions exist** but are **not wired in the UI**; operators cannot efficiently clear 100–250+ staged rows. | Wire bulk actions on review and batch detail, or cap launch scope to **≤50–100** SKUs until done. See `docs/ADMIN_INGESTION_CONSOLE_VERIFICATION_AUDIT.md`. |
| **LB-4** | **Migrations** | Go-live requires **all** repo migrations applied in order on the target Supabase project, including: **`product_best_offer_price`**, **`sync_canonical_products`**, **`commit_feed_upload`**, **`create_quote_with_lines`**, **rate limit tables** (if middleware uses them), **RLS** policies. | Run `supabase db push` / CI migration pipeline; verify with a **migration checklist** against production. |
| **LB-5** | **CatalogOS admin APIs** | If **`CATALOGOS_ADMIN_SECRET`** is **unset** in production, **`/api/ingest`**, **`/api/publish`**, **`/api/openclaw`**, dashboard, and **`/admin/*`** are **unauthenticated** (middleware passes through). | **Set `CATALOGOS_ADMIN_SECRET`** in production; verify **401** on ingest without Bearer/cookie. `catalogos/src/middleware.ts`. |
| **LB-6** | **Storefront jobs** | **`CRON_SECRET`** / **`WORKER_SECRET`** unset → cron and worker routes may **allow requests** in dev-like behavior; production must require secrets. | Set secrets; lock down **`/api/internal/cron/*`** and **`/api/internal/worker`**. |

---

## 2. High-risk issues

| ID | Area | Issue | Mitigation |
|----|------|--------|------------|
| **HR-1** | **Types** | `catalogos/src/lib/db/types.ts` describes **legacy BIGINT `catalogos_*`** tables; runtime uses **UUID `catalogos` schema** via `getSupabaseCatalogos()`. **Misleading for refactors.** | Regenerate types from Supabase or remove misleading `Database` export. |
| **HR-2** | **Ingestion performance** | **N+1** `loadMasterProducts` per row; **`maxDuration` 60s** on `/api/ingest`. Large batches **timeout** or **partially complete** (no transaction). | Load masters once per batch; extend duration or async jobs; document partial batches. `docs/INGESTION_PIPELINE_LARGE_BATCH_AUDIT.md`. |
| **HR-3** | **Publish / search sync** | **`sync_canonical_products`** failure is **logged** but publish can still **succeed** → storefront search **stale or missing** products. | Alert on `sync_canonical_products_failure`; optional retry or fail publish if sync fails. |
| **HR-4** | **Dual product surfaces** | **CatalogOS** storefront (`catalogos/`) uses **`catalogos.products` + product_attributes**; **Storefront** buyer/search uses **`canonical_products`** + views. **Facet / attribute drift** if JSON snapshot and `product_attributes` diverge. | Reconciliation test after publish; single contract doc for facet fields. |
| **HR-5** | **Quotes** | Client must pass **`idempotency_key`** for safe retries; **rate limiting** should be enforced at edge or action if not already globally. | Confirm migration **`create_quote_with_lines`** applied; wire idempotency key from UI; review rate limits. |
| **HR-6** | **`catalog_v2`** | **Additive schema** (`catalog_v2.*`) **not** the main app path; risk of **wrong joins** if new code targets v2 while data lives in `catalogos`. | Document “v2 = future / backfill only” until cutover. |

---

## 3. Medium issues

| ID | Area | Issue |
|----|------|--------|
| **M1** | **Variants** | `product_families` / `family_id` on `catalogos.products` and staging columns exist; **not all UIs** may expose family vs size variant clearly. |
| **M2** | **Pricing** | List price from **`product_best_offer_price`** / **`COALESCE(sell_price, cost)`**; legacy **`public.products.price`** may still appear in some admin paths — **inconsistent display.** |
| **M3** | **Inventory** | **`public.inventory`** ties to **BIGINT `products`**; not aligned with UUID catalog for catalogos-only SKUs. |
| **M4** | **Admin** | Dashboard home may query **`catalogos_import_batches`** (public) while ingestion uses **`import_batches`** (catalogos profile) — **count mismatch** possible. |
| **M5** | **OpenClaw** | Returns rows only; **no automatic** insert into staging — operators must **manually** feed catalogos. |
| **M6** | **Error UX** | APIs return **generic** messages (good for security); ensure **admin** sees enough detail (logs / observability). |
| **M7** | **Empty states** | Catalog grid shows “No products match…”; verify **homepage** and **category** empty states and **SEO** for thin catalog. |
| **M8** | **Mobile** | Responsive grids and **44px touch targets** exist on key PDP/quote paths; **full regression** on smallest breakpoints not guaranteed by audit alone. |

---

## 4. Nice-to-have improvements

- **Bulk publish cap** raised above 100 or chunked with single summary in UI.
- **E2E tests:** ingest → approve → publish → catalog API returns product + facets.
- **Dashboard:** single data source (catalogos client) for batch counts.
- **Feature flags** for risky areas (OpenClaw, distributor sync).
- **Status page** or synthetic check for `/api/catalog` and storefront search.
- **Sentry / OpenTelemetry** wired on both apps with release tags.
- **Image CDN** and **size limits** documented for supplier feeds.

---

## 5. Smoke test checklist

Run in **staging** that mirrors production schema and secrets.

### 5.1 Database & migrations

- [ ] All migrations applied; no pending drift (`supabase migration list` / dashboard).
- [ ] `catalogos.product_best_offer_price` returns rows for test products.
- [ ] `select catalogos.sync_canonical_products();` succeeds; `canonical_products` row count matches active `catalogos.products` (spot-check).
- [ ] `catalogos.commit_feed_upload` exists if supplier portal feed commit is used.

### 5.2 CatalogOS (catalog app)

- [ ] **`CATALOGOS_ADMIN_SECRET` set** → unauthenticated POST `/api/ingest` returns **401**.
- [ ] Authenticated ingest of small CSV URL → batch appears in **Ingestion Console**; staging rows created.
- [ ] Review: open staged row, **approve** (or merge), **publish** → product appears in **`/api/catalog`** or storefront catalog page.
- [ ] **Filters:** apply material/size; results and facet counts update.
- [ ] **Price sort** works without timeout (uses best-offer view).
- [ ] **Quote submit** with **`idempotency_key`** → duplicate submit returns same quote (if RPC wired).
- [ ] **Empty catalog** category shows empty state without 500.

### 5.3 Storefront (buyer / search)

- [ ] **Search** returns results from `canonical_products` path; filters sane.
- [ ] **Buyer product page** (`canonical_products` by id) loads; **offers** load from `public.supplier_offers` view.
- [ ] **Cart / quote basket** (if used on this app) persists and submits.

### 5.4 Orders (if checkout enabled on legacy path)

- [ ] Place test order; **`order_items.product_id`** joins to intended product row (validate type: UUID vs BIGINT).
- [ ] **Inventory** decrement path matches product id strategy in use.

### 5.5 Supplier portal

- [ ] Feed upload: **10 MB** reject before read (if implemented); commit uses **atomic RPC**.
- [ ] Session isolation: cannot read another supplier’s upload.

### 5.6 Background jobs

- [ ] **`CRON_SECRET`** set; POST `/api/internal/cron/daily` without secret → **401** in production.
- [ ] **`WORKER_SECRET`** (or `CRON_SECRET`) set; worker route **401** without secret.
- [ ] One **job** processes successfully (staging worker + DB `job_queue`).

### 5.7 Mobile / UX

- [ ] **iPhone SE width:** catalog sidebar, PDP, quote form usable (scroll / stack).
- [ ] **404** product slug; **500** boundary shows user-safe message.

### 5.8 Security basics

- [ ] No **service role** keys in client bundles (verify env only on server).
- [ ] **RLS** enabled on sensitive public tables per migrations; spot-check anon vs service behavior.
- [ ] **Rate limit** triggers on repeated ingest/OpenClaw (429).

---

## 6. Recommended release order

1. **Freeze & branch** — Tag release candidate; lock schema to migration set.
2. **Database** — Apply migrations to production; run **`sync_canonical_products`**; verify indexes and RLS.
3. **Secrets** — Set **`CATALOGOS_ADMIN_SECRET`**, **`CRON_SECRET`**, **`WORKER_SECRET`**, **`SUPABASE_*`**, AI keys if needed; confirm **no** secret in client env.
4. **Deploy CatalogOS** — Deploy `catalogos` app; smoke: auth gate, catalog API, quote RPC.
5. **Deploy Storefront** — Deploy `storefront` app; smoke: search, buyer PDP, internal routes 401 without secrets.
6. **Cron / worker** — Configure Vercel cron or external scheduler: **daily**, **weekly**, **nightly**, **worker** poll; verify locks (`acquire_cron_lock`).
7. **Data** — Run controlled **ingestion** batch; **review** → **publish**; confirm **canonical_products** and **search**.
8. **Traffic** — Enable monitoring; gradual traffic or feature flag if applicable.
9. **Post-release** — Watch ingestion errors, publish sync failures, quote volume, job_queue depth.

---

## 7. Environment variables (minimum matrix)

| Variable | App | Required for go-live | Notes |
|----------|-----|----------------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | catalogos, storefront | Yes | Same project or documented split. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | catalogos | Yes | Client-safe. |
| `SUPABASE_SERVICE_ROLE_KEY` | catalogos, storefront | Yes | **Server only.** |
| `CATALOGOS_ADMIN_SECRET` | catalogos | **Yes (prod)** | Unset = open admin/ingest. |
| `CRON_SECRET` | storefront | **Yes (prod)** | Protects cron routes. |
| `WORKER_SECRET` | storefront | Recommended | Worker route; falls back to `CRON_SECRET`. |
| `OPENAI_API_KEY` / `AI_PROVIDER` | storefront | If AI features on | Per `storefront/.env.example`. |
| `NEXT_PUBLIC_SUPABASE_URL` | storefront | If using anon client | Align with `SUPABASE_URL` naming in storefront code. |

**Note:** Storefront `.env.example` uses `SUPABASE_URL`; catalogos uses `NEXT_PUBLIC_SUPABASE_URL` + service role. **Document** the canonical names per app in runbooks to avoid misconfiguration.

---

## 8. Migrations (non-exhaustive “do not skip” list)

Apply from repo in timestamp order; verify on staging first.

- `catalogos` core: `20260311000001_catalogos_schema_full.sql`, RLS, seed categories/attributes, attribute dictionary.
- **Filters / facets:** `20260315000001_*`, `20260319000001_*` (sell_price, multi-value attributes).
- **Catalog views:** `20260403000001_*` (product_best_offer_price), `20260404000001_*` (canonical_products + sync), `20260404000002_*` (public views), `20260327100000_*` (product_line / sync updates).
- **Quotes:** `20260403000003_*` (idempotency + `create_quote_with_lines`), lifecycle/notifications as required.
- **Feed commit:** `20260403000002_*` (atomic RPC).
- **Rate limits:** `20260404000004_*` (if middleware uses `rate_limit_*` tables).
- **RLS:** `20260404000005_*`.
- **Optional additive:** `catalog_v2` migrations, `product_families`, `product_resolution` — only if features are enabled.

---

## 9. Background jobs (storefront)

| Route | Purpose | Auth |
|-------|---------|------|
| `POST /api/internal/cron/daily` | Stale job release, price guard, competitor checks, system events | `Bearer CRON_SECRET` |
| `POST /api/internal/cron/weekly` | Supplier discovery, long-tail jobs | Same |
| `POST /api/internal/cron/nightly` | Audit, cleanup, metrics | Same |
| `POST /api/internal/worker` | Dequeue and run `job_queue` jobs | `Bearer WORKER_SECRET` or `CRON_SECRET` |

**Requires:** DB RPCs `acquire_cron_lock` / `release_cron_lock`, tables `job_queue`, `job_runs` (from storefront migrations).

---

## 10. Readiness verdict

| Dimension | Status |
|-----------|--------|
| **Catalog (CatalogOS)** | **Conditional** — publish + facets + best-price view solid if migrations applied; sync and types need discipline. |
| **Customer catalog (storefront)** | **Conditional** — depends on `canonical_products` sync and search path. |
| **Cart / orders** | **At risk** until **LB-1** resolved or explicitly scoped out of launch. |
| **Ingestion / admin** | **Conditional** — pipeline works; **bulk UI** and **large batch** perf need work for scale. |
| **Security** | **Conditional** — **must set CatalogOS + cron/worker secrets** in production. |
| **Jobs** | **Ready** if secrets + scheduler + DB queue exist. |

**Overall:** **Not “fully ready”** for a broad B2C/B2B checkout launch **with legacy orders** until **order/product id alignment** is fixed or scoped. **Ready for a controlled launch** of **CatalogOS catalog + quotes + supplier feeds + staged review/publish**, with **secrets set**, **migrations applied**, and **smoke tests passed**.

---

*Update this document when blockers close; keep smoke checklist in CI or runbook for each release.*
