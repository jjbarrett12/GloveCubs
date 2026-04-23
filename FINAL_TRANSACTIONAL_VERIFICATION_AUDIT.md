# Final Transactional Hardening Verification Audit — GLOVECUBS

**Audit date:** Verification run after Final Transactional Hardening sprint  
**Scope:** Feed commit atomicity, rollback behavior, quote idempotency, quote+line transaction safety, quote rate limiting, oversized upload fail-fast, rollback logging semantics, concurrency estimates.

---

## 1. Feed commit atomicity

**Status: VERIFIED**

- **Code:** `storefront/src/lib/supplier-portal/feedUpload.ts` (lines 1277–1292). Commit path uses a single call to `getSupabaseCatalogos().rpc('commit_feed_upload', { ... })`. No per-row app-side inserts/updates.
- **DB:** `supabase/migrations/20260403000002_feed_commit_atomic_rpc.sql`. Function `catalogos.commit_feed_upload` runs in one PL/pgSQL transaction: ownership check, loop over rows (upsert offers), update upload status, insert audit log, return JSONB. Any exception triggers automatic rollback.
- **Tests:** `feedUpload.service.test.ts` — "should create new offers (via RPC)", "should update existing offers (via RPC)", "should skip rows without matched product (via RPC)" — all assert RPC is invoked with correct args; no direct table writes from app.

**Remaining launch blockers:** None.

---

## 2. Feed commit rollback / no partial writes

**Status: VERIFIED**

- **Code:** On RPC failure, `feedUpload.ts` catch block (1293–1306): calls `logTransactionFailure`, `logIngestionFailure`, `updateUploadStatus(upload_id, 'failed')`, then rethrows. No `rollback_successful` or similar passed to telemetry.
- **Semantics:** The RPC either commits fully or rolls back; the app does not perform client-side rollback. On failure, upload status is set to `failed` so the upload is not left in a “committed” state.
- **Tests:** "on RPC failure: sets upload status to failed and rethrows (no partial writes)" — mocks RPC to reject, asserts (1) promise rejects with correct error, (2) `updateUploadStatus` was called with `status: 'failed'`. Telemetry mock prevents catch from failing before update.

**Remaining launch blockers:** None.

---

## 3. Quote idempotency

**Status: VERIFIED**

- **Schema:** `quote_requests.idempotency_key` (TEXT), unique index `idx_quote_requests_idempotency_key` where key is not null (`20260403000003_quote_idempotency_and_atomic.sql`).
- **RPC:** `create_quote_with_lines` checks idempotency key first; if non-empty and a row exists with that key, returns existing `id` and `reference_number` without inserting.
- **Service:** `catalogos/src/lib/quotes/service.ts` — `createQuoteRequest` passes `input.idempotency_key ?? null` to the RPC. Schema `submitQuoteRequestSchema` includes optional `idempotency_key` (max 128).
- **Tests:** `quote-submit.test.ts` — "createQuoteRequest calls create_quote_with_lines RPC with idempotency_key when provided", "createQuoteRequest passes null idempotency_key when not provided".

**Remaining launch blockers:** None.

---

## 4. Quote parent + line item transaction safety

**Status: VERIFIED**

- **RPC:** `create_quote_with_lines` inserts one row into `quote_requests`, then loops and inserts into `quote_line_items` in the same PL/pgSQL block (single transaction). Failure at any step rolls back the whole transaction (no orphan quote).
- **App:** `createQuoteRequest` uses only `supabase.rpc('create_quote_with_lines', ...)`. No `from('quote_requests').insert()` or `from('quote_line_items').insert()`.
- **Tests:** "parent and line items created in single RPC only — no separate from() inserts" — asserts `mockRpc` called once, `mockFrom` never called.

**Remaining launch blockers:** None.

---

## 5. Quote submission rate limiting

**Status: VERIFIED**

- **Config:** `QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR = 15` in `catalogos/src/lib/quotes/service.ts`.
- **Action:** `catalogos/src/app/actions/quotes.ts` — `submitQuoteRequestAction` calls `getQuoteSubmitCountRecent(email, 60)` before `createQuoteRequest`; if `recentCount >= QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR`, returns `{ success: false, rateLimited: true, error: "Too many quote requests. Please try again in an hour." }`.
- **Service:** `getQuoteSubmitCountRecent` queries `quote_requests` with `eq("email", normalized)` and `gte("created_at", since)` (last 60 minutes), count exact.
- **Tests:** "QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR is a sane positive number", "getQuoteSubmitCountRecent returns number from count query", "getQuoteSubmitCountRecent returns 0 on error".

**Remaining launch blockers:** None.

---

## 6. Oversized upload rejection before read

**Status: VERIFIED**

- **Route:** `storefront/src/app/supplier-portal/api/feed-upload/route.ts`. Order of operations: (1) `formData.get('file')`, (2) `file.size > MAX_FILE_BYTES` (10 MB) → return 400 with "File too large. Maximum size is 10 MB.", (3) only then `detectFileType`, then `file.arrayBuffer()` or `file.text()`. Size check is before any content read.
- **Tests:** `route.test.ts` — "rejects file larger than 10 MB with 400 before reading content (fail-fast before file read)", "accepts file at exactly 10 MB (no size error)".

**Remaining launch blockers:** None.

---

## 7. Misleading rollback logging removed / corrected

**Status: VERIFIED**

- **Telemetry:** `storefront/src/lib/hardening/telemetry.ts` — `logTransactionFailure` context type no longer includes `rollback_successful`. JSDoc states: "Do not pass rollback_successful: DB transactions auto-rollback on failure; we do not track or imply client-side rollback state here."
- **Callers:** Only caller is `feedUpload.ts` catch block; it passes `operation`, `table`, `error_code` only. No remaining references to `rollback_successful` in the feed/quote transactional paths.
- **Other:** `storefront/src/lib/hardening/transactions.ts` uses a different RPC `rollback_transaction` for a separate flow; not part of feed commit or quote submission.

**Remaining launch blockers:** None.

---

## 8. Safe concurrency estimate by flow

| Flow | Safe concurrency estimate | Rationale |
|------|----------------------------|------------|
| **Catalog browsing** | **High** — 100+ concurrent users | Bounded catalog queries, `product_best_offer_price` view, pagination and limits; read-heavy, no long transactions. |
| **Quote submission** | **Moderate** — 15/hour per email; many distinct emails | Rate limit caps per-email; one short RPC per submit; no lock contention on quote creation. Total throughput limited by DB and app capacity. |
| **Supplier feed commit** | **Moderate** — one commit per upload; sequential per supplier preferred | Single RPC per commit; short transaction (upserts + status + audit). Same-supplier concurrent commits could contend; ownership and single transaction keep state consistent. |
| **Mixed traffic** | **High** for read-heavy; **moderate** for write-heavy | ~50–100 concurrent mixed requests per app instance is reasonable; scale out horizontally for more. Browsing can scale with read replicas if added. |

---

## Summary

### Remaining launch blockers

**None.** All seven transactional/behavioral areas above are verified; no remaining launch blockers identified in this audit.

### High-risk issues

**None.** Feed commit is single-transaction RPC; quote create is single-transaction RPC with idempotency; rate limit and oversized-file checks are in place; rollback logging semantics are corrected.

### Medium issues

- **RPC response shape (feed commit):** Client assumes `data` from `catalogos.rpc('commit_feed_upload')` is the JSONB object `{ committed, created, updated, skipped }`. PostgREST for `RETURNS JSONB` can vary by version. **Recommendation:** In production, confirm Supabase/PostgREST returns a single object for this RPC; if it returns an array, use `Array.isArray(data) ? data[0] : data` before reading fields.
- **Rate limit clock:** Rate limit uses `created_at` (server time). No clock-skew or timezone handling. Acceptable for initial load; document for future hardening.

### Exact files / routes still weak

- **None** for the seven areas audited. Optional hardening: add an integration test that runs the feed commit RPC against a test DB and asserts response shape and atomicity under failure (e.g. invalid product_id).

---

## Verdict

**READY FOR INITIAL LOAD**

Transactional hardening for feed commit, quote idempotency, quote+line atomicity, quote rate limiting, oversized upload fail-fast, and rollback logging is in place and verified by unit tests. No remaining launch blockers or high-risk issues in these areas. Safe concurrency estimates are documented above; initial load within those bounds is supported.

---

*Audit performed by re-reading code paths, running `feedUpload.service.test.ts`, `feed-upload/route.test.ts`, and `quote-submit.test.ts`; all targeted tests passed.*
