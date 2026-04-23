# CatalogOS — Production-Readiness Audit

**Auditor:** Senior staff engineer (no-mercy)  
**Scope:** Schema integrity, data traceability, duplicates, pricing, feed failure handling, malformed data, idempotency, race conditions, auth, validation, match confidence, publish safety, audit trail, images, observability, rollback, scale, SourceIt reuse.

---

## 1. Executive Summary

CatalogOS is **not production-ready**. Critical issues include:

- **Schema split:** Two incompatible schemas exist (public `catalogos_*` BIGINT vs `catalogos.*` UUID). Ingestion and review use `catalogos.*`; publish uses `public.catalogos_*`. **Publish is broken** when only the full schema is deployed.
- **No auth on APIs:** `POST /api/ingest` and `POST /api/publish` are unauthenticated. Anyone can trigger ingestion or publish approved staging.
- **Unreviewed publish risk:** Publish service only checks `status === 'approved'` in the table it reads; that table is the wrong one for the current schema, and there is no server-side check that staging rows were ever in the review queue (no audit binding).
- **AI match safety:** AI can return a `suggested_master_product_id` that is not in the candidate list; it is not validated against DB, so phantom or wrong master IDs can be written.
- **Duplicate master risk:** `createNewMasterProduct` does not check existing SKU in a transaction; race can create duplicate SKU attempts and orphan masters.
- **No idempotency** across batches for the same feed/supplier (same external_id in a new batch creates new raw + normalized rows).
- **No batch rollback:** No way to "undo" a batch or mark it cancelled and hide its staging from review.
- **Malformed CSV/JSON:** JSONL silently skips bad lines; CSV has no row limit — large or malformed feeds can OOM or produce partial data with no error report.
- **Observability:** Batch logs exist but no structured job log for "who triggered ingest," and publish does not write to `catalogos.publish_events` in the full schema (writes to `catalogos_publish_log` in public).

**Recommendation:** Fix schema unification and auth first (release blockers); then address duplicate risk, AI validation, idempotency, and rollback. Defer scale and SourceIt reuse until core path is correct.

---

## 2. Category-by-Category Audit

### 1) Schema integrity

| Grade | **FAIL** |
|-------|----------|
| **Problem** | Two schemas coexist: (1) `supabase/migrations/20260310000001_catalogos_schema.sql` creates **public** tables `catalogos_suppliers`, `catalogos_staging_products` (BIGINT id), `catalogos_master_products`, `catalogos_supplier_offers`, etc. (2) `20260311000001_catalogos_schema_full.sql` creates **catalogos** schema with `catalogos.products` (UUID), `catalogos.supplier_products_normalized` (UUID), `catalogos.import_batches`, etc. Run-pipeline and review use **catalogos** (Accept-Profile). Publish-staging uses **getSupabase()** (no profile) and tables `catalogos_staging_products`, `catalogos_master_products` — so it reads **public** tables. If only the full schema is applied, publish reads missing tables and fails. |
| **Real-world risk** | Deploying the “full” schema breaks publish. Mixed migrations leave some environments with BIGINT staging and others with UUID; support and debugging are impossible. |
| **Patch plan** | Unify on **catalogos** schema only. Deprecate public `catalogos_*` tables. Rewrite publish to use `getSupabaseCatalogos()` and `catalogos.supplier_products_normalized`, `catalogos.products`, `catalogos.supplier_offers`, `catalogos.publish_events`. Use UUID staging_ids everywhere. |

---

### 2) Data traceability

| Grade | **WARN** |
|-------|----------|
| **Problem** | Raw → normalized → offer is traceable via `raw_id`, `normalized_id`, `batch_id`. Publish path (current) writes `catalogos_publish_log` with `staging_id`, `master_product_id` but does not write to `catalogos.publish_events` (normalized_id, product_id, live_product_id, published_by). So when using full schema, publish does not create the intended audit rows. |
| **Real-world risk** | Cannot answer “which staging row produced this live product?” or “what was published in this run?” after the fact. |
| **Patch plan** | In publish, after each successful publish, insert into `catalogos.publish_events` (normalized_id, product_id, live_product_id, published_by). Ensure all IDs are from catalogos schema. |

---

### 3) Duplicate risk

| Grade | **FAIL** |
|-------|----------|
| **Problem** | (1) **Master products:** `createNewMasterProduct` inserts into `catalogos.products` without checking for existing SKU in a transaction. Two concurrent “create new master” actions for the same SKU can both pass pre-check (if any) and one will hit unique violation; the other may have already updated staging, leaving an orphan or inconsistent state. (2) **Supplier offers:** `createSuggestedOffer` upserts on `(supplier_id, product_id, supplier_sku)` — good. But if two normalized rows match the same master with the same supplier_sku, the second overwrites the first; no duplicate row but **source (normalized_id) is lost** for the first. (3) **Raw rows:** Same (batch_id, supplier_id, external_id) is unique per batch; **different batches** can have the same external_id, so the same logical supplier product can appear multiple times across batches and create duplicate normalized rows. |
| **Real-world risk** | Duplicate or overwritten master products; offer history overwritten; duplicate staging rows for same supplier SKU across batches, confusing review and publish. |
| **Patch plan** | (1) In `createNewMasterProduct`, `SELECT id FROM catalogos.products WHERE sku = $1` inside a transaction; if exists, use it and update staging; else insert. (2) Document or constrain that (supplier_id, product_id, supplier_sku) is one-to-one; consider adding `normalized_id` to a unique constraint or storing the “winning” normalized_id. (3) Add optional idempotency: e.g. (supplier_id, external_id) + checksum in raw; before insert raw, check if a recent batch already has this (supplier_id, external_id) and skip or replace. |

---

### 4) Pricing correctness

| Grade | **WARN** |
|-------|----------|
| **Problem** | Run-pipeline uses `pricing-service.ts` (catalogos schema `pricing_rules` with UUID scope columns). Publish uses `compute-price.ts` (expects `catalogos_pricing_rules` with numeric scope_master_product_id, scope_supplier_id). So pricing in publish uses a different table and type (number vs UUID). Negative or zero cost is not validated before computing margin; cost could be negative from bad feed data. |
| **Real-world risk** | Wrong sell prices or margin applied; negative cost could produce negative or zero sell price. |
| **Patch plan** | Unify pricing on catalogos schema. Use one `computeSellPrice` that reads `catalogos.pricing_rules` (UUID scopes). Validate `cost >= 0` in pipeline and publish; reject or flag otherwise. |

---

### 5) Supplier feed failure handling

| Grade | **WARN** |
|-------|----------|
| **Problem** | Fetch failure (timeout, 4xx/5xx) throws and batch is marked failed; good. But partial failure (e.g. 200 with truncated body, or parse succeeds for first 100 rows then throws) leaves batch in “running” and some raw rows inserted; no “partial” status or cleanup. |
| **Real-world risk** | Operators see “running” forever; raw rows exist for partial run with no normalized rows; confusion and need for manual cleanup. |
| **Patch plan** | On any exception after raw insert, call `updateBatchCompletion(batchId, 'failed', stats)` and log the error in `import_batch_logs`. Ensure batch never stays “running” on throw. Consider a “partial” status and partial stats (raw_count, normalized_count, error_count). |

---

### 6) Malformed CSV/JSON handling

| Grade | **WARN** |
|-------|----------|
| **Problem** | **CSV:** No maximum row count; a 1M-row CSV is parsed entirely into memory (parseCsv returns all rows). **JSON:** JSON.parse(trimmed) can throw on invalid JSON; array path throws and fails the whole parse. **JSONL:** Malformed lines are skipped silently (catch block with empty body); no count of skipped lines or error sample. |
| **Real-world risk** | OOM on huge CSV; one bad line in JSONL loses data silently; no way to know how many rows were dropped. |
| **Patch plan** | (1) Add `MAX_ROWS` (e.g. 50_000) in parseFeed/parseCsv/parseJson; truncate with a warning in result. (2) JSONL: collect parse errors and include in result (e.g. `skippedRows: number`, `parseErrors: { line, error }[]`). (3) Validate parsed rows with a minimal Zod schema (e.g. require sku or id) and count invalid rows. |

---

### 7) Idempotency of imports

| Grade | **FAIL** |
|-------|----------|
| **Problem** | Raw insert uses `(batch_id, supplier_id, external_id)` unique — idempotent only **within** a batch. Re-running the same feed creates a **new batch** and new raw rows for the same external_ids. No “replace” or “skip if same content” across batches. |
| **Real-world risk** | Same feed run twice = duplicate raw and normalized rows; review queue fills with duplicates; no way to “re-ingest and replace” without deleting batches. |
| **Patch plan** | Option A: Allow idempotency key (e.g. supplier_id + feed_id + external_id). Before inserting raw, check if a row with same (supplier_id, external_id) exists in a recent batch (e.g. same feed_id, last 7 days); if so, skip or update that batch’s normalized row. Option B: Document that each run is a new batch and provide “dedupe by (supplier_id, external_id)” in review UI and publish. |

---

### 8) Race conditions

| Grade | **FAIL** |
|-------|----------|
| **Problem** | (1) **createNewMasterProduct:** Non-atomic: insert product then update staging. Another request could insert same SKU between our insert and update; one fails on unique, staging may point to wrong product. (2) **Publish loop:** Reads staging by id, then creates master (if needed), then upserts offer, then upserts product. No row-level lock; two concurrent publish runs could create two masters for same “logical” product or double-update. (3) **Offer upsert:** Concurrent offers for same (supplier_id, product_id, supplier_sku) can overwrite each other. |
| **Real-world risk** | Duplicate masters; corrupted offers; staging updated with wrong master_product_id. |
| **Patch plan** | (1) Use a transaction: `BEGIN; SELECT id FROM catalogos.products WHERE sku = $1 FOR UPDATE; INSERT if not exists; UPDATE staging; COMMIT`. (2) Publish: use a single transaction per staging_id or advisory lock per (staging_id) when processing. (3) Offer upsert is already “last write wins”; ensure only one writer (publish or pipeline) writes offers for a given (supplier_id, product_id, supplier_sku) per run. |

---

### 9) Admin authorization

| Grade | **FAIL** |
|-------|----------|
| **Problem** | No auth checks on `POST /api/ingest` or `POST /api/publish`. Server actions (approve, reject, createNewMasterProduct, etc.) run in Next.js server context but are not gated by session or role; any client that can reach the app can call them. RLS policies require `auth.role() = 'service_role' OR (auth.jwt() ->> 'role') = 'admin'` but API routes use service role and do not pass a user; dashboard is assumed internal. |
| **Real-world risk** | Anyone who discovers the API can trigger full ingest or publish all approved items; no audit of who did what. |
| **Patch plan** | Add middleware or route guards: require valid session + admin role for `/api/ingest`, `/api/publish`, and for server actions that mutate staging/review. Pass `published_by` (user id) and `decided_by` from session into publish and review_decisions. |

---

### 10) Route protection

| Grade | **FAIL** |
|-------|----------|
| **Problem** | No middleware in catalogos app that checks auth for `/api/*` or `/dashboard/*`. Routes are open. |
| **Real-world risk** | Same as #9; entire catalog and publish flow is open if the app is reachable. |
| **Patch plan** | Implement Next.js middleware: for `/api/ingest`, `/api/publish`, `/api/staging/*`, require Authorization header or cookie with valid JWT and admin claim; return 401 otherwise. Protect `/dashboard/*` the same way. |

---

### 11) Validation coverage

| Grade | **WARN** |
|-------|----------|
| **Problem** | Ingest: `triggerImportSchema` validates feed_id or (supplier_id + feed_url). Publish: `publishStagingSchema` validates staging_ids (number[] 1–100). Staging IDs in the full schema are UUIDs; schema is wrong. No validation that staging_ids exist or are in status approved before publish. Normalized_data and attributes are not validated against a strict schema before insert; bad extraction can write invalid JSONB. |
| **Real-world risk** | Publish with invalid IDs (e.g. UUIDs passed as numbers); no server-side guarantee that only approved rows are published. |
| **Patch plan** | Change publish to UUID: `staging_ids: z.array(z.string().uuid()).min(1).max(100)`. In publishStaging, re-fetch each row and enforce status === 'approved'. Add optional Zod schema for normalized_data (e.g. require sku, name, cost) and validate in pipeline before insert. |

---

### 12) Match confidence safety

| Grade | **WARN** |
|-------|----------|
| **Problem** | AI matching returns `suggested_master_product_id` (UUID). It is validated as UUID by Zod but **not** validated against the list of candidate master IDs. AI could return a UUID that does not exist in `catalogos.products` or from a different category. Pipeline then writes that ID to `master_product_id` and may create an offer for a non-existent product. |
| **Real-world risk** | Staging rows linked to phantom masters; FK violation if products table has strict FK; broken offer links. |
| **Patch plan** | In ai-orchestration after AI match: if `aiResult.suggested_master_product_id` is set, check that it is in `options.masterCandidates` (or in DB for category). If not, ignore AI suggestion and keep rules result. Never write AI-suggested ID that is not in the candidate set. |

---

### 13) Publish workflow safety

| Grade | **FAIL** |
|-------|----------|
| **Problem** | (1) Publish reads from wrong table (public.catalogos_staging_products) when app uses catalogos schema. (2) Only check is `staging.status !== 'approved'`; no verification that the row was ever in review or that current user is allowed to publish. (3) Creating master on the fly when `!masterId`: uses `COS-${stagingId}` as SKU when no norm.sku/raw.sku — can create many “COS-123” style SKUs if staging IDs are numeric. (4) No transaction: master create, offer upsert, product upsert, log insert are separate; partial failure leaves inconsistent state. |
| **Real-world risk** | Unreviewed or wrong rows published; duplicate or meaningless SKUs; partial publish with no rollback. |
| **Patch plan** | (1) Unify publish on catalogos schema (see #1). (2) Enforce status = 'approved' and optionally add “published_at” or “publish_events” check to avoid double publish. (3) Require normalized_data to have sku/name for new master; reject with clear error if missing. (4) Wrap each staging item in a transaction: select staging for update, create master if needed, upsert offer, upsert product, insert publish_event. |

---

### 14) Edit audit trail

| Grade | **WARN** |
|-------|----------|
| **Problem** | `review_decisions` table exists and is written on approve/reject/merge. But `updateNormalizedAttributes`, `overridePricing`, `assignCategory`, `markForReprocessing` do **not** write to an audit table. No history of who changed what on a normalized row. |
| **Real-world risk** | Cannot trace who changed attributes or pricing before publish; compliance or dispute issues. |
| **Patch plan** | Add `staging_audit_log` (or reuse a generic audit table): (normalized_id, action, field, old_value, new_value, changed_by, changed_at). Call it from updateNormalizedAttributes, overridePricing, assignCategory. |

---

### 15) Review decision logging

| Grade | **PASS** |
|-------|----------|
| **Problem** | approveMatch, rejectStaged, createNewMasterProduct, mergeWithStaged all insert into `review_decisions` with decision, master_product_id, decided_by. |
| **Real-world risk** | Low; only gap is decided_by is hardcoded "admin" — should be from session. |
| **Patch plan** | Pass actual user id/email from session into server actions and set decided_by. |

---

### 16) Image handling gaps

| Grade | **WARN** |
|-------|----------|
| **Problem** | Normalized data can contain image_url or image_urls; no validation of URL format or reachability. Publish pushes image_url to public.products; broken or malicious URLs can be written. No deduplication of images across products; no image audit. |
| **Real-world risk** | Broken images on storefront; XSS or abuse if URL is not sanitized (e.g. in storefront). |
| **Patch plan** | Validate image_url is a URL (e.g. new URL(...)) and optionally allowlist domains. In publish, sanitize or reject invalid image_url. Document that image verification is optional (e.g. HEAD request) in a later phase. |

---

### 17) Observability / job logs

| Grade | **WARN** |
|-------|----------|
| **Problem** | import_batch_logs and ingestion_job_logs exist and are written in run-pipeline (fetch, parse, raw_insert, normalize_match). But trigger source (who called /api/ingest, or cron job id) is not logged. Publish does not write to catalogos.import_batch_logs or a dedicated publish log in catalogos schema; it writes to catalogos_publish_log (public). No structured correlation id for “this publish run.” |
| **Real-world risk** | Hard to correlate “this batch was triggered by this user/cron”; publish runs are not visible in the same observability layer. |
| **Patch plan** | Add to batch or job: triggered_by (user id or 'cron'), trigger_source ('api' | 'cron'). In publish, write to catalogos.publish_events (or a publish_run table) with run_id, published_by, staging_ids, counts, started_at, completed_at. |

---

### 18) Batch rollback strategy

| Grade | **FAIL** |
|-------|----------|
| **Problem** | No way to “roll back” a batch. Status can be set to 'cancelled' in schema but there is no API or UI to cancel. Deleting a batch would cascade raw and normalized rows and break any review_decisions that reference normalized_id. No “hide from review” without delete. |
| **Real-world risk** | Bad ingest must be manually cleaned (delete batch and accept cascade) or left in place; no safe “undo” for operators. |
| **Patch plan** | (1) Add PATCH /api/batches/:id or server action to set status = 'cancelled'. (2) In review and publish-ready queries, filter out rows from cancelled batches. (3) Do not cascade delete; keep raw for audit. Optionally add “archive” flag to hide from default lists. |

---

### 19) Scalability to 50k+ SKUs

| Grade | **WARN** |
|-------|----------|
| **Problem** | match-service loads all master products for category into memory (`loadMasterProducts`). At 50k SKUs this is large and slow. Pipeline processes rows sequentially in a for-loop; no batching of DB writes. Parsers load full body into memory. |
| **Real-world risk** | High memory and latency; timeouts on large feeds. |
| **Patch plan** | (1) Match: paginate or use DB-side matching (e.g. attribute GIN index, query by attributes). (2) Pipeline: batch insert normalized rows (e.g. 100 at a time). (3) Enforce MAX_ROWS on parse (e.g. 50k) and document chunked ingest for larger feeds. |

---

### 20) Reuse potential for SourceIt

| Grade | **WARN** |
|-------|----------|
| **Problem** | CatalogOS is tightly coupled to “disposable_gloves” (category slug and hints). Types and normalization are glove-specific. Schema and flow (supplier → raw → normalized → match → offer → publish) are reusable, but extraction, matching, and categories are not abstracted. |
| **Real-world risk** | Copy-paste and drift if SourceIt is a fork; no shared package. |
| **Patch plan** | Extract generic types and interfaces (Feed, RawRow, NormalizedRow, MatchResult, PublishResult). Move category-specific extraction and matching behind adapters (e.g. getExtractor(categoryId), getMatcher(categoryId)). Document “CatalogOS core” vs “GloveCubs catalog” so SourceIt can replace the catalog layer. |

---

## 3. Patch List by Severity

### Critical (release blockers)

1. **Unify schema and fix publish** — Publish must use catalogos schema and UUID staging_ids; single source of truth for staging and products.
2. **Protect ingest and publish APIs** — Auth middleware or route guard; only admin (or service) can call.
3. **Publish: enforce approved status and use correct tables** — Read from catalogos.supplier_products_normalized; validate status; write to catalogos.publish_events.
4. **AI match: validate suggested_master_product_id** — Only accept if in candidate set (or exists in DB for category).

### High

5. **createNewMasterProduct: SKU check + transaction** — Avoid duplicate masters and orphan staging.
6. **Publish: transaction per item** — Atomic master + offer + product + event.
7. **Idempotency or dedupe** — Document or implement (supplier_id, external_id) idempotency for raw/normalized.
8. **Batch failure handling** — On any error after batch create, mark batch failed and log.

### Medium

9. **Validation: staging_ids as UUID; approved-only** — Schema and server-side check.
10. **Pricing unification** — One pricing module for catalogos schema (UUID).
11. **Malformed data: MAX_ROWS, JSONL error reporting** — Limit rows; report skipped lines.
12. **Batch cancel / rollback** — Status cancelled; exclude from review and publish.

### Low

13. **Audit trail for attribute/pricing edits** — staging_audit_log or equivalent.
14. **decided_by / published_by from session** — Pass real user id.
15. **Image URL validation** — Allowlist or URL parse before publish.
16. **Observability** — triggered_by, publish run log in catalogos.

---

## 4. Exact Code Changes

### 4.1 Publish: use catalogos schema and UUID (critical)

**File:** `catalogos/src/lib/services/publish/publish-staging.ts`

- Replace `getSupabase(true)` with `getSupabaseCatalogos(true)`.
- Use tables: `supplier_products_normalized`, `products`, `supplier_offers`, `publish_events` (all in catalogos schema via client profile).
- Change `staging_ids: number[]` to `staging_ids: string[]` (UUID).
- Query: `.from('supplier_products_normalized').select('*, supplier_products_raw(raw_payload)').eq('id', stagingId).single()`.
- Enforce `status === 'approved'`; if not, push error and continue.
- Create master in `catalogos.products` if needed (category_id, brand_id from catalogos); then upsert `catalogos.supplier_offers`; then upsert `public.products` (or the live table you use) with live_product_id; then insert `catalogos.publish_events` (normalized_id, product_id, live_product_id, published_by).
- Use `product_id` (UUID) for catalogos.products and supplier_offers; map to live_product_id (BIGINT) when writing to public.products.

### 4.2 Publish schema and API (critical)

**File:** `catalogos/src/lib/validations/schemas.ts`

```ts
export const publishStagingSchema = z.object({
  staging_ids: z.array(z.string().uuid()).min(1).max(100),
});
```

**File:** `catalogos/src/app/api/publish/route.ts`

- Pass `published_by` from session if available (e.g. from header or getServerSession).

### 4.3 Auth middleware (critical)

**File:** `catalogos/src/middleware.ts` (create if missing)

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_API_PATHS = ["/api/ingest", "/api/publish", "/api/staging"];
const DASHBOARD_PREFIX = "/dashboard";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdminApi = ADMIN_API_PATHS.some((p) => path.startsWith(p));
  const isDashboard = path.startsWith(DASHBOARD_PREFIX);

  if (!isAdminApi && !isDashboard) return NextResponse.next();

  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? req.cookies.get("catalogos_admin")?.value;
  const secret = process.env.CATALOGOS_ADMIN_SECRET;
  if (secret && token === secret) return NextResponse.next();

  // Optional: NextAuth or your auth
  // const session = await getToken({ req });
  // if (session?.role === "admin") return NextResponse.next();

  if (isAdminApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}
```

### 4.4 AI match: validate suggested_master_product_id (critical)

**File:** `catalogos/src/lib/ingestion/ai-orchestration.ts`

After `if (aiResult)` block, before assigning to masterProductId:

```ts
const validCandidateIds = new Set((options.masterCandidates ?? await loadMasterCandidates(options.categoryId)).map((c) => c.id));
if (
  aiResult.suggested_master_product_id &&
  validCandidateIds.has(aiResult.suggested_master_product_id) &&
  aiResult.match_confidence > confidence
) {
  masterProductId = aiResult.suggested_master_product_id;
  confidence = aiResult.match_confidence;
  reason = "ai_suggested";
}
// else keep rules result; do not use AI id if not in candidates
```

Remove the current unconditional assignment to masterProductId/confidence when aiResult is present.

### 4.5 createNewMasterProduct: SKU check + transaction (high)

**File:** `catalogos/src/app/actions/review.ts`

- In a single Supabase transaction (or use RPC): `SELECT id FROM catalogos.products WHERE sku = $1 FOR UPDATE`. If row exists, use that id and update staging with it; insert into review_decisions. If not, insert product, then update staging, then review_decisions.
- If your Supabase client does not expose transaction, use a Postgres function (e.g. `catalogos.create_master_and_approve_staging(payload)`).

### 4.6 Run-pipeline: mark batch failed on throw (high)

**File:** `catalogos/src/lib/ingestion/run-pipeline.ts`

- Wrap the entire pipeline body (after createImportBatch) in try/finally. In finally, if batch status is still 'running', call updateBatchCompletion(batchId, 'failed', currentStats) and logBatchStep(batchId, 'pipeline', 'failed', errorMessage).
- Ensure every throw path (fetch, parse, or inside the for-loop) either sets batch to failed or is caught and sets batch to failed.

### 4.7 Parser: MAX_ROWS and JSONL errors (medium)

**File:** `catalogos/src/lib/ingestion/parsers/csv-parser.ts` and `parsers/index.ts`

- In parseFeed, after parseCsv/parseJson, if rows.length > MAX_ROWS (e.g. 50_000), set rows = rows.slice(0, MAX_ROWS) and add a warning to result (e.g. truncated: true, maxRows: MAX_ROWS).
- In parseJson (JSONL branch), push to parseErrors for each line that throws; return { rows, format: 'jsonl', rowCount, parseErrors }.

---

## 5. Exact SQL Changes

### 5.1 Publish_events and consistency (if not already present)

Ensure `catalogos.publish_events` exists (from full schema). If publish currently writes to `public.catalogos_publish_log`, add a migration that creates a view or moves publish to write to `catalogos.publish_events` with columns: normalized_id (UUID), product_id (UUID), live_product_id (BIGINT), published_at, published_by.

### 5.2 Batch cancel support

```sql
-- Already have status 'cancelled' in catalogos.batch_status enum.
-- Ensure import_batches.status can be set to 'cancelled'.
-- No schema change if enum already has it.

-- Optional: add updated_at to import_batches if missing
-- ALTER TABLE catalogos.import_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
```

### 5.3 RPC for create master and approve (high — optional)

```sql
CREATE OR REPLACE FUNCTION catalogos.create_master_and_approve_staging(
  p_normalized_id UUID,
  p_sku TEXT,
  p_name TEXT,
  p_category_id UUID,
  p_brand_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_decided_by TEXT DEFAULT 'admin'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  SELECT id INTO v_product_id FROM catalogos.products WHERE sku = p_sku FOR UPDATE;
  IF v_product_id IS NULL THEN
    INSERT INTO catalogos.products (sku, name, category_id, brand_id, description, attributes, is_active)
    VALUES (p_sku, p_name, p_category_id, p_brand_id, p_description, '{}'::jsonb, true)
    RETURNING id INTO v_product_id;
  END IF;
  UPDATE catalogos.supplier_products_normalized
  SET status = 'approved', master_product_id = v_product_id, reviewed_at = NOW(), updated_at = NOW()
  WHERE id = p_normalized_id;
  INSERT INTO catalogos.review_decisions (normalized_id, decision, master_product_id, decided_by, notes)
  VALUES (p_normalized_id, 'approved', v_product_id, p_decided_by, 'New master product created');
  RETURN v_product_id;
END;
$$;
```

---

## 6. Release Blocker List

Before production:

1. **Schema:** Publish must read/write catalogos schema only; staging_ids are UUIDs; no dependency on public.catalogos_* for the main flow.
2. **Auth:** POST /api/ingest and POST /api/publish (and any staging mutation APIs) must require admin or service auth.
3. **Publish safety:** Only rows with status = 'approved' can be published; publish must run in a consistent way (correct tables and transactions).
4. **AI match:** Do not persist AI-suggested master_product_id unless it is in the allowed candidate set.
5. **Duplicate master:** createNewMasterProduct must check SKU and use existing master when present (transaction or RPC).

After these, address: batch failure handling, idempotency, rollback, validation, and observability for a solid production baseline.

---

## 7. Applied Patches (This Audit)

The following changes were implemented as part of this audit:

| File | Change |
|------|--------|
| `docs/catalogos/PRODUCTION_READINESS_AUDIT.md` | New: full audit document (this file). |
| `catalogos/src/lib/services/publish/publish-staging-catalogos.ts` | New: publish using catalogos schema (UUID staging_ids, supplier_products_normalized, products, supplier_offers, publish_events). |
| `catalogos/src/lib/validations/schemas.ts` | `publishStagingSchema.staging_ids` changed from `z.array(z.number())` to `z.array(z.string().uuid())`. |
| `catalogos/src/app/api/publish/route.ts` | Switched to `publishStagingCatalogos`; request body now expects UUID staging_ids. |
| `catalogos/src/lib/ingestion/ai-orchestration.ts` | AI match: only accept `suggested_master_product_id` if it is in the candidate set (`validCandidateIds.has(...)`). |
| `catalogos/src/middleware.ts` | New: require `CATALOGOS_ADMIN_SECRET` (Bearer or cookie) for `/api/ingest`, `/api/publish`, `/api/staging` and `/dashboard` when env is set. |

**Not changed (intentional):** `publish-staging.ts` (legacy public-schema implementation) left in repo for reference; remove once migration is verified.
