# GloveCubs Productionization Audit

**Date:** 2026-06-15  
**Scope:** Customer portal, product adding/setup, backend vs frontend, production readiness, split-brain/drift, critical breakage  
**Architecture authority:** `ROUTE_OWNERSHIP.md` — Next storefront (www) owns customer HTML; Express (api) owns transitional `/api/*`; CatalogOS owns ingest/publish tooling.

---

## Executive Summary

| Area | Status | Summary |
|------|--------|---------|
| **Overall production readiness** | **Quote-first launch GO (see [Launch Readiness Closeout](#launch-readiness-closeout))** | Storefront build, root CI, and default test suites pass. Catalog, quote cart, invoice intake, and CatalogOS publish path verified. Card checkout off. Portal order features staging-ready behind flags — production flags remain OFF. |
| **Customer portal** | **Partial — MVP exists on Next `/account/*`** | Supabase auth, quotes, addresses, quicklist, pricing tier view are live. Order history + reorder are implemented but **feature-flagged off** by default. Legacy SPA portal still exists but production redirects to Next. |
| **Product adding** | **Partial — CatalogOS canonical for URL import; dual admin paths remain** | CatalogOS `ProductUrlExtractionV2` → `ProductSetupContractV1` → staging → `runPublish` is the canonical ingest contract. Storefront admin has parallel clipboard/import-draft promote path. Quick add + review wizard largely connected. |
| **Biggest blockers** | See Top Active Blockers below | Split-brain ingest, dual publish paths, production portal flag ops sign-off |
| **Best next sequence** | 1) Enable portal order flags in staging + smoke test → 2) Consolidate product-add operator path on CatalogOS → 3) Retire/disable legacy extractors → 4) Ops sign-off for production flags → 5) Launch quote-first with honest checkout copy |

### Top Active Blockers

1. **Split-brain product ingest** — triple URL extraction (CatalogOS V2, storefront clipboard, Express/legacy SPA); hybrid bulk vs clipboard operator UX.
2. **Dual publish/admin paths** — CatalogOS `runPublish` + publish-guards vs storefront `product-write` direct active status (URL-import blocked; manual allowed with server readiness mirror + documented side-effect gaps). Express legacy still unguarded.
3. **Production portal order history flag enablement** — `/account/orders` and reorder-to-quote are **staging-ready** but **production flags must stay off** until ops sign-off after staging smoke.

**Resolved (no longer active blockers):** storefront production build type errors; root `npm test` inventory authority check (`check-parent-inventory-usage`); **storefront full-suite Vitest drift** (`765/765` PASS as of 2026-06-15); **CatalogOS default Vitest suite env drift** (`696/696` PASS, 5 integration tests opt-in skipped as of 2026-06-15).

---

## Current System Map

### App structure

| Layer | Path | Role |
|-------|------|------|
| **Storefront (canonical customer + admin HTML)** | `storefront/` port 3005 | Next.js 14 — `/`, `/store`, `/store/p/:slug`, `/account/*`, `/quote-cart`, `/invoice-savings`, `/workspace/procurement/*`, `/admin/*` |
| **Express API (transitional)** | `server.js` port 3004 | `/api/*` — cart legacy, auth JWT, checkout, admin JSON, webhooks. **Frozen** — no new routes |
| **CatalogOS (internal ingest)** | `catalogos/` port 3010 | Staging, URL import, review, publish to `catalog_v2` |
| **Legacy SPA (deprecated)** | `public/js/app.js` | Full customer + admin UI; blocked in production; 308 to Next when configured |
| **CatalogOS demo storefront (do not use for launch)** | `catalogos/src/app/(storefront)/` | Parallel PDP/catalog — not canonical |

### Customer storefront routes (Next)

- `/` — marketing homepage
- `/store`, `/store/p/:slug` — catalog listing + PDP (real `catalog_v2` via `store-products.ts`)
- `/quote-cart` — quote request submit → `/api/quote-request`
- `/login` — Supabase password auth
- `/account/*` — buyer portal (see below)
- `/invoice-savings` — invoice upload → `/api/invoice/intake`
- `/workspace/procurement/*` — B2B procurement workspace (separate from transactional account)
- `/order-status` — legacy order link landing (no lookup)
- `/request-pricing`, `/glove-finder`, `/contact`, industry pages

### Admin routes

**Next storefront `/admin/*` (target):** products CRUD, import (URL proxy to CatalogOS, clipboard staging), review queue, orders, companies, inventory, POs, procurement ops.

**CatalogOS `/dashboard/*` (operator ingest):** `url-import`, `review`, `products/quick-add`, `ingestion`, `publish`.

**Express `/api/admin/*`:** JSON only; drained to Next BFF over time.

### Customer account / portal routes (Next)

| Route | Backend | Notes |
|-------|---------|-------|
| `/account` | `gc_commerce.companies`, `catalogos.quote_requests` | Hub dashboard |
| `/account/quotes`, `/account/quotes/[id]` | Supabase service role | Live quote history |
| `/account/orders`, `/account/orders/[id]` | `gc_commerce.orders` | **Flag-gated** (`FEATURE_GC_ORDER_HISTORY`) |
| `/account/shipping-addresses` | `gc_commerce.ship_to_addresses` + buyer APIs | Live CRUD |
| `/account/quicklist` | Company quicklist read model | Add to quote cart |
| `/account/pricing` | Company B2B tier | Static + tier from DB |

**Auth:** Supabase Auth (email/password). Company scope via `gc_commerce.company_members`. Post-login routing via `/api/auth/post-login-destination`.

### Product data flow

```
URL import / Quick add / CSV
  → supplier_products_raw + supplier_products_normalized (catalogos schema)
  → Review (StagedProductDetail + ProductSetupWizardPanel)
  → evaluatePublishReadiness (publish-guards.ts)
  → runPublish (publish-service.ts)
  → catalog_v2.products / variants + commerce_metadata_sync
  → Storefront fetchStoreCatalogPage / PDP
```

**Canonical contracts:**
- `ProductUrlExtractionV2` — `catalogos/src/lib/product-extraction/url-extraction-v2.ts`
- `ProductSetupContractV1` — `catalogos/src/lib/product-extraction/product-setup-contract.ts`
- Staging storage — `normalized_data.product_setup_contract_summary`, `raw_payload.product_setup_contract_full`

### Database schemas (high level)

- `catalog_v2` — live sellable catalog (products, variants, sellable_units, offers)
- `catalogos` — staging, quote_requests, import batches, url_import_jobs
- `gc_commerce` — companies, orders, ship_to_addresses, company_members

---

## Backend Capability vs Frontend UX Matrix

| Capability | Backend | Frontend | Connected | Tested | Status | Notes |
|------------|:-------:|:----------:|:---------:|:------:|--------|-------|
| Product create (manual) | ✅ CatalogOS quick-add | ✅ CatalogOS UI | ✅ | ✅ | **Ready** | Draft-first; case cost required |
| Product create (storefront admin) | ✅ product-write.ts | ✅ `/admin/products/new` | ✅ | Partial | **Partial** | Separate promote path; different guards |
| Product edit | ✅ catalog_v2 | ✅ `/admin/products/[id]/edit` | ✅ | Partial | **Ready** | |
| Product draft | ✅ staging status | ✅ | ✅ | ✅ | **Ready** | No auto-publish from URL import |
| Product publish | ✅ runPublish | ✅ Review + quick-add | ✅ | ✅ | **Ready** | CatalogOS canonical |
| URL import | ✅ crawl-v2-wire + V2 | ✅ CatalogOS + storefront proxy | Partial | ✅ | **Partial** | Bulk jobs → CatalogOS; clipboard uses storefront extractor |
| Variant creation | ✅ variant-family + publish-variant-group | ✅ StagedProductDetail | ✅ | ✅ | **Ready** | N105ORF regression tests exist |
| Image handling | ✅ extract-images + enrichment | ✅ Wizard apply | ✅ | ✅ | **Ready** | URL preview prefers legacy image over V2 primary |
| Pricing/offers | ✅ import-pricing + supplier offers | ✅ Override in review | ✅ | ✅ | **Ready** | Hard-block auto-apply for pricing |
| Case sell unit | ✅ commerce-packaging | ✅ PDP + store | ✅ | ✅ | **Ready** | Default sell unit = case |
| Pallet sell unit | ✅ readiness gates | ✅ PDP when valid | ✅ | ✅ | **Ready** | Only when pallet pricing + cases_per_pallet |
| Filters / taxonomy | ✅ attribute dictionary + seeds | ✅ Store facets | ✅ | ✅ | **Ready** | Manual mirror catalogos ↔ storefront registry |
| PDP | ✅ catalog_v2 | ✅ `/store/p/:slug` | ✅ | ✅ | **Ready** | No stock/inventory exposed |
| Category/listing | ✅ store-products.ts | ✅ `/store` | ✅ | ✅ | **Ready** | |
| Cart | ✅ Express `/api/cart` | Legacy + quote cart | Partial | Partial | **Quote-first** | No card checkout on Next |
| Checkout | ✅ Express Stripe path | ❌ Not exposed on Next | ❌ | Partial | **Intentionally off** | Quote-first launch model |
| Customer login | ✅ Supabase | ✅ `/login` | ✅ | Partial | **Ready** | |
| Account dashboard | ✅ | ✅ `/account` | ✅ | ✅ | **Ready** | |
| Order history | ✅ gc_commerce.orders | ✅ `/account/orders` | Flag | Partial | **Partial** | `FEATURE_GC_ORDER_HISTORY` off by default |
| Reorder | ✅ reorder-quote-lines API | ✅ order detail CTA | Flag | ✅ | **Partial** | Maps to quote cart, not checkout |
| Company account | ✅ companies + members | ✅ account + workspace | ✅ | Partial | **Ready** | Multi-company → active company picker |
| Quotes/RFQ | ✅ quote_requests | ✅ quotes + quote-cart | ✅ | ✅ | **Ready** | Primary commercial path |
| Admin permissions | ✅ admin_users | ✅ Supabase session gate | ✅ | Partial | **Ready** | Express JWT transitional |

---

## Split-Brain / Drift Findings

### High severity

| Finding | Files | Current behavior | Risk | Consolidation | Safe now? |
|---------|-------|------------------|------|---------------|-----------|
| **Triple URL extraction** | CatalogOS `url-extraction-v2.ts`; Storefront `productExtraction.ts`; Express `lib/parse-product-url.js` + legacy SPA | Three parsers, three version strings | Different Hospeco/N105ORF outcomes | Route all admin URL ingest through CatalogOS V2; retire Express parse-url for new work | **No** — needs operator workflow decision |
| **Dual publish path** | CatalogOS `publish-guards.ts` + `runPublish`; Storefront `product-editor-readiness.ts` + `product-write.ts` | Two ways into `catalog_v2` with different blockers | Published products with inconsistent guardrails | Storefront promote should call CatalogOS publish or shared guard module | **No** |
| **Parallel contracts** | `ProductSetupContractV1` vs `ImportDraftProductV1` | No cross-import between catalogos and storefront staging shapes | Wizard/review evidence diverges | Bridge import-draft → setup contract or route clipboard through CatalogOS staging | **No** |
| **Triple storefront** | Next `storefront/`; CatalogOS `(storefront)`; legacy `app.js` | Three customer catalog UIs | Wrong host serves wrong UX | Keep Next only; retire CatalogOS storefront routes from operator docs | **Partial** — redirect policy already guards legacy |
| **Facet registry mirror** | `catalog-facet-registry.ts` ↔ `catalogos/.../registry.ts` | Comment-only sync | Filter drift (0.5 mil, 10k UPC, PE) | Shared package or CI parity test | **Yes** — add CI check |
| **Hybrid URL import UX** | Storefront proxies bulk to CatalogOS; clipboard stays local | Same operator sees two extractors | Inconsistent staging rows | Document single path: bulk URL → CatalogOS; deprecate clipboard extract | **No** |

### Medium severity

| Finding | Files | Notes | Safe now? |
|---------|-------|-------|-----------|
| Old staging table UI | `/dashboard/staging` → `catalogos_staging_products` | Not wired to normalized pipeline | **Yes** — hide or redirect to `/dashboard/review` |
| Distributor staging | `distributor_product_staging` | Not integrated with main publish | Document only |
| Packaging dual-write | `commerce_packaging` + legacy mirrors | Intentional transition | Monitor |
| Review queue duplication | CatalogOS review + storefront `admin/products/review` | Depends on ingest entry path | Consolidate operator docs |
| Manual config mirrors | `homeBrands.ts`, `footerLinks.ts`, `store-material-bulk-options.ts` | Mirror legacy SPA | Add drift tests |
| Inventory delete in product-write | `storefront/.../product-write.ts` `.from("inventory")` | Root CI `check-parent-inventory-usage` passes as of 2026-06-15 | Monitor — not an active blocker |

### Low severity / mitigated

- `ROUTE_OWNERSHIP.md` + production boot guards for legacy SPA
- `@commerce-packaging/*` and `@glove-sku-intelligence` shared libs (wrappers differ)
- Contamination filters for demo seed data in admin KPIs
- OpenClaw legacy path when `GLOVECUBS_URL_EXTRACTION_V2=false`

---

## Customer Portal MVP Plan

### Must have before launch

1. **Supabase auth + `/login` + `/account` hub** — already exists; verify production env vars (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`)
2. **Quote history** (`/account/quotes`) — live; primary commercial continuity path
3. **Shipping addresses** — live; wired to quote submit
4. **Company linkage gate** — unlinked buyers get honest limited account (exists)
5. **Enable order history in staging/production when ready:** `FEATURE_GC_ORDER_HISTORY=1` and optionally `FEATURE_GC_REORDER_TO_QUOTE=1`
6. **Legacy order links** — `/portal-order/*` → `/order-status` (exists); consider real lookup later

### Should have before launch

1. **Account layout + nav** — centralize sidebar across account pages (currently per-page gates)
2. **Active company picker UX** — clear path from account when `active_company_required`
3. **Reorder-to-quote CTA** on order detail when flags enabled
4. **Quicklist → quote cart** polish and empty states
5. **SMTP for lead/quote notifications** — verify `SMTP_*` + `ADMIN_EMAIL` in production

### Can wait after launch

1. Card checkout / self-serve payment
2. Saved payment methods
3. Customer-specific catalog visibility (unless backend already clean — not verified as launch-critical)
4. Dedicated `/account/settings` password change (Supabase hosted flows)
5. Full workspace procurement features beyond quote-first

### Do not build yet (split-brain risk)

1. **Second customer auth system** on Express JWT for Next account pages
2. **Parallel order API** on Next while Express orders remain canonical
3. **Reviving legacy SPA portal** (`public/js/app.js`) for production
4. **CatalogOS `(storefront)` route group** as customer-facing app
5. **Customer-specific pricing engine** without single pricing authority migration complete

---

## Product Adding MVP Plan

### Must have before launch

1. **CatalogOS URL import with V2 flag on** (`GLOVECUBS_URL_EXTRACTION_V2=true`) — canonical `ProductUrlExtractionV2`
2. **Review + ProductSetupWizard** — apply safe fields only; hard-block food_safe, medical_grade, exam_grade, sterile, certifications, pricing, variants, publish
3. **Quick add manual path** — draft-first with case cost + publish guards
4. **Per-size / variant-group publish** — `publishVariantGroupForNormalized`
5. **Case/pallet commerce metadata sync** on publish
6. **Regression fixtures:** Hospeco PE (`hospeco-polyethylene-gloves.test.ts`), N105ORF family (`n105orf-family-extraction.test.ts`)
7. **Operator runbook:** CatalogOS review → publish (not storefront clipboard for URL-sourced products)

### Should have before launch

1. **URL import preview** — prefer V2 primary image over legacy `images[]` in `UrlImportPreviewClient.tsx`
2. **Bulk publish from publish list page** (currently list-only)
3. **Storefront admin → CatalogOS deep links** (already on products page; ensure `NEXT_PUBLIC_CATALOGOS_URL` in prod)
4. **QA scripts:** `npm run qa:phase-3e-v2:fixture` in catalogos CI
5. **Filter seed parity check** — 0.5 mil, 10,000 UPC, Polyethylene PE

### Can wait after launch

1. Distributor crawl → main pipeline integration
2. `/dashboard/staging` retirement
3. OpenClaw AI fallback path removal
4. Unified ingestion feature flags full cutover

### Do not build yet (creates drift)

1. **New storefront monolithic URL parser** features — extend CatalogOS V2 instead
2. **Second staging schema** for product setup
3. **Auto-publish from URL import**
4. **Replacing manufacturer SKU with GLV SKU** on product identity
5. **Parallel Express `/api/admin/products/save`** for new products
6. **Storefront import-draft promote** without shared publish-guards

---

## Critical Bugs Found

| Symptom | File(s) | Root cause | Fix | Test |
|---------|---------|------------|-----|------|
| Storefront build syntax error on `/invoice-savings` | `storefront/src/app/invoice-savings/page.tsx` | Missing closing `</div>` | **Fixed** | Build |
| Review wizard crash when publish readiness mock incomplete | `catalogos/.../product-setup-wizard-readiness.ts` | `blockerSections.sku` undefined → `.join()` | **Fixed** — defensive `joinBlockers()` | url-import-review-ux-smoke (6/7 pass; 1 assertion drift) |
| ESLint unknown rule breaks build | `storefront/.../contamination-filters.ts` | `@typescript-eslint/no-require-imports` not installed | **Fixed** | Build |
| Next route exports non-handler | `sku-collisions/route.ts` | `lookupSkuCollisions` exported from route | **Fixed** — moved to `sku-collision-lookup.ts` | Build |
| Iterator type errors in shared lib | `lib/commerce-packaging/extract.ts`, `storefront/tsconfig.json` | Missing ES2017 target | **Fixed** | Build (partial — more type errors remain) |
| YesNo attribute editor type error | `ProductAttributeEditor.tsx` | `""` passed to yes/no setter | **Fixed** — guard empty choice | Build |
| Test fixture missing `sku` blocker section | `quick-add-test-fixtures.ts` | Incomplete mock | **Fixed** | catalogos build |
| Storefront build type error | `AddToQuoteButton.tsx` | `PdpCommercePackaging` missing price fields | **Fixed** — aligned with `store-product-commerce.ts` helper | `cd storefront && npm run build` PASS |
| Root CI inventory drift | `product-write.ts` | Direct `.from("inventory")` delete | **Resolved** — root `npm test` PASS | No longer active blocker |
| Legacy review dismiss policy test | `review-queue.policy.test.ts` | Route now calls `removeClipboardStagingImport` | Update test expectations | Test drift |

---

## Changes Made

| File | Why |
|------|-----|
| `storefront/src/app/invoice-savings/page.tsx` | Missing `</div>` — production build blocker |
| `catalogos/src/lib/product-extraction/product-setup-wizard-readiness.ts` | Prevent crash on partial `blockerSections` in review wizard |
| `storefront/src/lib/admin/contamination-filters.ts` | ESLint rule reference fix |
| `lib/commerce-packaging/extract.ts` | `Array.from` for iterator compatibility |
| `storefront/tsconfig.json` | `"target": "ES2017"` for shared lib iterators |
| `storefront/src/lib/admin/sku-collision-lookup.ts` | Move `lookupSkuCollisions` out of route module |
| `storefront/src/app/admin/api/products/sku-collisions/route.ts` | Route handlers only |
| `storefront/src/app/admin/api/products/url-staging/[stagingId]/promote/route.ts` | Import collision lookup from lib |
| `storefront/src/app/admin/products/_components/ProductAttributeEditor.tsx` | Yes/no type guard |
| `catalogos/src/components/quick-add/quick-add-test-fixtures.ts` | Add `sku: []` to blocker sections |
| `catalogos/src/lib/publish/product-attributes-snapshot.test.ts` | Mock `getSupabase` catalog_v2 writes; align assertions with `metadata.facet_attributes` |
| `catalogos/src/lib/publish/publish-variant-group.test.ts` | Mock catalog_v2 admin insert path + partial `ensure-catalog-v2-link` |
| `catalogos/src/components/review/url-import-review-ux-smoke.test.tsx` | Allow duplicate normalized title in V2 panel smoke assertion |

---

## Tests / Checks Run

| Command | Result | Notes |
|---------|--------|-------|
| `cd catalogos && npm test` | **PASS 696/696** (5 skipped) | Default suite PASS 2026-06-15; 5 live-DB integration tests opt-in skipped without Supabase env |
| `cd storefront && npm test` | **PASS 765/765** | Verified 2026-06-15 |
| `cd storefront && npm run build` | **PASS** | Verified 2026-06-15 |
| Targeted portal/order policy tests | **PASS 23/23** | `reorder-to-quote.policy.test.ts`, `buyer-portal-coherence.test.ts`, `admin-orders.policy.test.ts` |
| `cd catalogos && npm run build` | **Not re-verified** | Prior failure was fixture `sku` — fixed |
| `cd .. && npm test` (root) | **PASS** | Verified 2026-06-15 |
| Regression highlights **PASS** | | `hospeco-polyethylene-gloves.test.ts`, `n105orf-family-extraction.test.ts`, `extraction-v2-bridge.test.ts`, `product-setup-contract.test.ts`, `publish-guards.test.ts` |

### Failure classification

| Failure | Class |
|---------|-------|
| Supabase env in catalogos snapshot **unit** tests | **Resolved** — unit tests mock `getSupabase` catalog_v2 admin client; no live DB required |
| Supabase env in catalogos snapshot **integration** tests | **Opt-in** — skipped unless `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set |
| URL import review UX smoke duplicate title | **Resolved** — `getAllByText` for repeated normalized title |
| `AddToQuoteButton` PdpCommercePackaging | **Resolved** — storefront build PASS |
| Root inventory drift check | **Resolved** — root `npm test` PASS |
| Storefront Vitest `@glove-sku-intelligence` path alias | **Resolved** — regex alias in `vitest.config.ts` |
| Storefront dismiss-route policy drift | **Resolved** — route delegates to `removeClipboardStagingImport`; test reads helper |
| Storefront admin leads ship-to label drift | **Resolved** — column renamed to “Delivery context” |
| Storefront variant SKU / MainProductId fixture drift | **Resolved** — neutral URLs + canonical fixture SKUs for clustering |
| Storefront variant pricing migration path | **Resolved** — test points at `20261218120100_variant_pricing_authority_phase2b0.sql` |
| Storefront clipboard staging client API drift | **Resolved** — bulk `url-staging/delete` is canonical |

**Prior storefront failure snapshot (pre-fix):** 549 pass / 3 fail / 12 config suites with 0 tests.

---

## CatalogOS Env-Dependent Test Cleanup

**Date:** 2026-06-15  
**Scope:** `cd catalogos && npm test` default Vitest run only (no production code changes to `ProductUrlExtractionV2`, `ProductSetupContractV1`, or `runPublish`).

### Failures found (before cleanup)

| Test file | Count | Symptom |
|-----------|-------|---------|
| `product-attributes-snapshot.test.ts` | 4 | `getSupabase(true)` called for `catalog_v2.catalog_products.metadata` update; unit mocks only covered catalogos client |
| `publish-variant-group.test.ts` | 1 | Same — publish path now inserts via admin `catalog_v2`; mock missing `getSupabase` + `CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID` |
| `url-import-review-ux-smoke.test.tsx` | 1 | `getByText("Nitrile Exam Glove")` — duplicate title in sheet + V2 panel |

**Prior run:** 6 failed / 690 passed / 5 skipped (701 total).

### Classification

| Failure | Class | Action |
|---------|-------|--------|
| Snapshot unit tests hitting live `getSupabase` | **Test drift** (implementation moved snapshot write to `catalog_v2`) | Add admin client mocks in unit tests |
| Variant-group partial-batch contract | **Test drift** (catalog_v2 insert path) | Extend mocks; preserve contract assertions |
| URL import review smoke duplicate title | **Test drift** | Use `getAllByText` — still validates title visible |
| `product-attributes-snapshot.integration.test.ts` | **Live DB snapshot required** | Already `describe.skipIf(!hasDb)` — unchanged |
| `publish-search-sync.integration.test.ts` | **Live DB required** | Already `describe.runIf(hasSupabase)` — unchanged |
| `url-import-infra.integration.test.ts` | **Integration opt-in** | Already `describe.skipIf(!hasDb)` — unchanged |
| `catalog-v2-sellable-integrity.integration.test.ts` | **Integration opt-in** | Already requires `RUN_CATALOG_SELLABLE_GUARD=1` — unchanged |

### What changed

- **`product-attributes-snapshot.test.ts`:** `catalogV2AdminMock` helper + `vi.spyOn(getSupabase)`; assertions now check `metadata.facet_attributes` on catalog_v2 update payload (matches production write path).
- **`publish-variant-group.test.ts`:** Partial mock of `ensure-catalog-v2-link` via `importOriginal`; mock `getSupabase` for `catalog_products`/`catalog_variants` inserts.
- **`url-import-review-ux-smoke.test.tsx`:** Duplicate-title-safe assertion.

No new skip wrappers on unit/contract tests. Existing integration gating reused.

### Remains opt-in (live Supabase)

| Test | Gate | How to run |
|------|------|------------|
| `product-attributes-snapshot.integration.test.ts` | `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Set env, then `cd catalogos && npx vitest run src/lib/publish/product-attributes-snapshot.integration.test.ts` |
| `publish-search-sync.integration.test.ts` | Same Supabase env vars | `cd catalogos && npx vitest run src/lib/publish/publish-search-sync.integration.test.ts` |
| `url-import-infra.integration.test.ts` | Same Supabase env vars | `cd catalogos && npx vitest run src/lib/url-import/url-import-infra.integration.test.ts` |
| `catalog-v2-sellable-integrity.integration.test.ts` | `RUN_CATALOG_SELLABLE_GUARD=1` + Supabase env | `cd catalogos && npm run test:catalog-sellable-guard` (with env set) |

Inline early-return pattern (not separate files): `publish-service.test.ts`, `product-attribute-sync.test.ts`, `thickness-7-plus.test.ts` skip live assertions when env missing but still pass.

### Blocker status

**Resolved for default CI/local `npm test`.** The CatalogOS env-dependent blocker is cleared for the standard suite (`696 passed`, `5 skipped`). Live-DB integration tests remain intentionally opt-in and are not fake-passed.

### Verification (2026-06-15)

| Command | Result |
|---------|--------|
| `cd catalogos && npm test` | **PASS** — 696 passed, 5 skipped (4 integration files) |
| `npm test` (root) | **PASS** |
| `cd storefront && npm test` | **PASS 765/765** |
| `cd storefront && npm run build` | **PASS** |

---

## Staging Verification Status

**Last verified:** 2026-06-15

### Build / CI Status

- **Storefront build:** PASS (`cd storefront && npm run build`)
- **Root npm test:** PASS (`npm test` at repo root)
- **Targeted portal/order tests:** PASS 23/23
  - `storefront/src/lib/account/reorder-to-quote.policy.test.ts`
  - `storefront/src/lib/account/buyer-portal-coherence.test.ts`
  - `storefront/src/lib/admin/admin-orders.policy.test.ts`

### Customer Portal Order History

**Status:** STAGING READY / PRODUCTION FLAG OFF

- `/account/orders` and `/account/orders/[orderId]` are gated by `FEATURE_GC_ORDER_HISTORY` (documented in `storefront/.env.example`).
- Read-only order history — no checkout or payment flow.
- Company-scoped: requires Supabase auth and an active `gc_commerce.company_members` row for the buyer’s company.
- Does not enable self-serve checkout.

### Reorder-to-Quote

**Status:** STAGING READY / PRODUCTION FLAG OFF

- Gated by `FEATURE_GC_REORDER_TO_QUOTE` (documented in `storefront/.env.example`).
- Writes eligible order lines to the quote cart only (`/quote-cart`).
- Does not create a checkout or payment flow.
- Requires order lines with mappable catalog variant/SKU data.

**Confirmed constraints (all environments):** no self-serve checkout enabled; no inventory/stock exposed on customer portal surfaces.

### Staging Env Checklist

Staging and preview hosts must set (no secrets in repo docs):

```bash
FEATURE_GC_ORDER_HISTORY=1
FEATURE_GC_REORDER_TO_QUOTE=1
```

Production should leave both flags **unset** until ops sign-off after staging verification.

### Manual Smoke Checklist

- [x] Sign in at `/login` as a buyer with a valid company membership. *(2026-06-15 local — magic-link session)*
- [x] Confirm redirect/dashboard at `/account`.
- [x] Confirm “Order records” link appears.
- [x] Visit `/account/orders`.
- [x] Confirm order list or empty state renders.
- [x] Confirm no stock/inventory appears.
- [x] Visit `/account/orders/[valid-order-id]`.
- [x] Confirm order detail renders lines/totals read-only.
- [x] Attempt inaccessible order ID from another company.
- [x] Confirm no cross-company data leak.
- [x] Click reorder-to-quote if available.
- [x] Confirm lines land in `/quote-cart`.
- [x] Confirm copy says quote/review, not checkout/payment.
- [x] Turn both flags off.
- [x] Confirm `/account/orders` shows unavailable shell and does not crash.

### Production Go/No-Go

**Current recommendation:** **NO-GO** for production flag enablement until:

- Staging env flags are set (`FEATURE_GC_ORDER_HISTORY=1`, `FEATURE_GC_REORDER_TO_QUOTE=1`).
- A real test buyer is verified end-to-end.
- At least one company order is smoke-tested on order list and detail.
- Unauthorized order access (cross-company order ID) is tested and blocked.
- Reorder-to-quote is tested with mappable order lines and quote-cart landing verified.

**2026-06-15 update:** Local staging browser smoke **STAGING PASS** (see **Staging Smoke Result**). Production flags remain **off** until Vercel Preview env is configured and ops sign-off completes.

### Staging Smoke Data Requirements

Minimum Supabase rows for a full pass (no mock/fake production paths):

| Layer | Table / object | Required fields / constraints | Used by |
|-------|----------------|------------------------------|---------|
| Auth | `auth.users` | Valid email/password buyer (not admin-only bootstrap) | `/login`, Supabase session cookie |
| Membership | `gc_commerce.company_members` | `user_id` → auth user, `company_id` → company, `role` in (`owner`,`admin`,`member`,`viewer`,`billing`) | `resolveCustomerProcurementGate`, `assertCustomerCompanyAccess` |
| Active company | `public.users.active_company_id` (optional) | UUID of company when buyer has **multiple** memberships; omit when single membership | `lib/active-company-resolve.js` |
| Company | `gc_commerce.companies` | Valid company row referenced by membership | Order scoping |
| Order header | `gc_commerce.orders` | `company_id`, unique `order_number`, `status`, `currency_code`, minor-unit totals (`subtotal_minor`, `discount_minor`, `shipping_minor`, `tax_minor`, `total_minor` satisfying check constraint), `placed_at` | `/account/orders`, detail, reorder API |
| Order lines | `gc_commerce.order_lines` | `order_id`, `sellable_product_id`, `line_number`, `quantity` (1–99999 int), `unit_price_minor`, line totals, `product_snapshot` JSONB | Detail table, reorder mapping |
| Sellable link | `gc_commerce.sellable_products` | `id` = line’s `sellable_product_id`, `catalog_product_id` UUID, `sku`, `display_name`, `is_active = true` | Reorder resolution |
| Catalog product | `catalog_v2.catalog_products` | `id` = sellable’s `catalog_product_id`, `status = 'active'`, `name`, `slug` | Reorder → quote cart |
| Catalog variant | `catalog_v2.catalog_variants` | `catalog_product_id`, `is_active = true`; **best case:** exactly one active variant, or snapshot includes `catalog_v2_variant_id` matching an active row, or unique `variant_sku` / `sku` match | Reorder `available` vs `needs_review` / `unavailable` |
| Brands (optional) | `catalogos.brands` | Referenced by product `brand_id` for cart display name | Reorder cart line `brandName` |
| Cross-company negative | Second `gc_commerce.companies` + `orders` row | Order UUID **not** belonging to test buyer’s active company | Expect `404` on `/account/orders/[foreign-order-id]` |

**Routes and gates (verified in code):**

| Route / API | Env flag | Auth / scope | Expected when data OK | Expected when blocked |
|-------------|----------|--------------|----------------------|------------------------|
| `GET /account/orders` | `FEATURE_GC_ORDER_HISTORY=1` | Supabase auth + `company_members` + active company | Order list or honest empty state; **no inventory/stock** | Flag off → “Order history is not available yet” shell (no crash) |
| `GET /account/orders/[orderId]` | `FEATURE_GC_ORDER_HISTORY=1` **or** `FEATURE_GC_REORDER_TO_QUOTE=1` alone | Same gate; query `.eq("company_id", companyId)` | Read-only header + lines | Wrong company / unknown id → `404`; no membership → redirect `/account` |
| `POST /api/account/reorder-quote-lines` | `isGcReorderToQuoteEnabled()` (history **or** reorder flag) | Same gate; read-only order fetch | JSON `{ availableLines, blockedLines, summary }` | Flag off → `404`; foreign order → `404 Order not found` |
| Client reorder CTA | Same as reorder flag | Uses API then `QuoteCartProvider.addItem` → `/quote-cart` | Copy: “quote request … not checkout” | Blocked lines stay on detail with explanations |

**Reorder “available” line minimum:** active sellable → active catalog product → resolvable single active variant (via snapshot `catalog_v2_variant_id`, unique SKU hint, or exactly one active variant per product).

### Staging Smoke Execution Notes

**Local env requirements (`storefront/.env.local`):**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_URL` alias used by server helpers).
- For smoke paths (local/staging only — **not production**):
  ```bash
  FEATURE_GC_ORDER_HISTORY=1
  FEATURE_GC_REORDER_TO_QUOTE=1
  ```
- Dev server: `cd storefront && npm run dev` (default port `3005` per `.env.example`).

**Verified local state (2026-06-15):** `storefront/.env.local` exists and Supabase vars are present for builds, but **`FEATURE_GC_ORDER_HISTORY` / `FEATURE_GC_REORDER_TO_QUOTE` are not set** — local smoke of enabled order history was not run in this session.

**Vercel preview / staging requirements:**

- Same Supabase project as staging data (or an isolated staging project with migrated `gc_commerce` + `catalog_v2` rows).
- Preview env vars: `FEATURE_GC_ORDER_HISTORY=1`, `FEATURE_GC_REORDER_TO_QUOTE=1` (Preview scope only; production remains unset).
- Do not commit secrets; set flags in Vercel Preview environment settings only.

**Test buyer requirements:**

- Supabase Auth user with password known to operators (not created by `local-dev-bootstrap-admin.mjs`, which grants **admin** operator access only).
- At least one `gc_commerce.company_members` row linking that user to the smoke company.
- If multiple memberships: set `public.users.active_company_id` to the smoke company **or** complete `/workspace/procurement/active-company` picker flow before visiting `/account/orders`.
- At least one `gc_commerce.orders` row for that `company_id` with ≥1 `order_lines` row for reorder smoke.

**Existing seed / smoke scripts (search results):**

| Script | Purpose | Suitable for portal order smoke? |
|--------|---------|----------------------------------|
| `storefront/scripts/local-dev-bootstrap-admin.mjs` | Create/reset auth user + **admin** operator grant | **No** — admin bootstrap, not buyer + `company_members` |
| `load-tests/scripts/setup-test-data.sql` | Legacy `public.users` load-test users | **No** — pre-`gc_commerce` schema, no order history wiring |
| `supabase/migrations/20260626150000_gc_commerce_backfill_from_legacy.sql` | One-time legacy → `gc_commerce.orders` backfill | **Reference only** — not an idempotent smoke seed |
| Targeted Vitest policy tests (`reorder-to-quote.policy.test.ts`, `buyer-portal-coherence.test.ts`, `admin-orders.policy.test.ts`) | Static/source policy checks | **Partial** — confirms gates/copy/contracts, not live DB smoke |

**No dedicated buyer portal order smoke seed or runner exists in-repo.** Operators must use real staging `gc_commerce` data (migrated legacy or native orders) or manually insert rows in a **non-production** Supabase project following the table requirements above.

**Expected pass/fail outcomes:**

| Step | Pass | Fail |
|------|------|------|
| Sign in at `/login` | Lands on `/account` or explicit `next` | Redirect loop, “no membership”, or missing Supabase config → `/request-pricing` |
| `/account/orders` with flags on | List or empty state; no stock columns | Flag off → unavailable shell; DB error → red message (no crash) |
| Order detail | Read-only lines/totals | Foreign UUID → 404; malformed UUID → 404 |
| Cross-company order id | 404, no data leak | Any foreign header/lines visible → **stop, security issue** |
| Reorder-to-quote | Lines in `/quote-cart`; banner mentions quote request | All lines `blocked` → check sellable/catalog/variant mapping |
| Flags off | Unavailable shell, no crash | White screen or thrown error |

**Known blockers (prior audit run):**

1. Portal feature flags not enabled in local `.env.local` (and staging/preview flag state not verified here).
2. No repo script to create buyer + `company_members` + sample `gc_commerce.orders` / mappable lines.
3. Test buyer email/password and company/order UUIDs not checked into docs (correct — no secrets).
4. Manual browser smoke requires operator credentials and staging data discovery (e.g. via `/admin/companies/[companyId]` order records in admin tools).

**Flag status (2026-06-15 portal smoke — names only, no secret values):**

| Environment | `FEATURE_GC_ORDER_HISTORY` | `FEATURE_GC_REORDER_TO_QUOTE` | Notes |
|-------------|---------------------------|-------------------------------|-------|
| Local `storefront/.env.local` (smoke run) | **Enabled (`1`)** during browser smoke | **Enabled (`1`)** during browser smoke | Verified then returned to **commented off** (safe local default) |
| Local `storefront/.env.local` (current) | **Off** (commented) | **Off** (commented) | Supabase URL + service role configured |
| Vercel project `jason-s-projects-920fb103/storefront` Preview | **Enabled (`1`)** | **Enabled (`1`)** | Portal + Supabase runtime vars on Preview only (2026-06-15) |
| Vercel project `jason-s-projects-920fb103/storefront` Production | **Not set** | **Not set** | Portal flags remain off |
| Production | **Must remain off** | **Must remain off** | Local staging smoke complete; production enablement still **NO-GO** |

### Missing Operator Inputs

Required before manual smoke can run (provide to operator / staging runbook — **no secrets in this doc**):

| Input | Status | Operator action |
|-------|--------|-----------------|
| Test buyer login (email + password) | **Resolved (operator-assisted)** | Buyer auth via Supabase magic link (service role); optional `GC_PORTAL_SMOKE_BUYER_PASSWORD` for password path |
| Buyer `auth.users.id` | **Present** | 1 `gc_commerce.company_members` user (prefix `5bfb9d49…`) |
| Buyer `company_id` | **Present** | Same membership company (prefix `59665c8f…`) |
| Valid `company_members` row | **Present** | 1 row, single membership (no active-company picker needed) |
| Same-company `gc_commerce.orders.id` | **Present** | 12 orders; smoke order `R6ADD-1779133592189` (id prefix `b2780f5e…`) |
| Same-company `order_lines` | **Present** | Smoke order has **1** line |
| Different-company order UUID (ACL test) | **Present (seeded)** | Foreign company order `ACL-SMOKE-*` (id prefix `a28b0277…`) seeded idempotently for smoke |
| Reorder mappable line | **Pass** | Reorder API returned **1 available** line for smoke order |
| Local/staging flags enabled for smoke | **Pass (local run)** | Both flags set to `1` in `.env.local` during smoke; flags-off shell also verified |
| Staging/preview storefront URL | **Not verified on Vercel** | Local `http://localhost:3005` smoke complete |

**Read-only Supabase discovery + browser smoke (2026-06-15):** member company data present; foreign-company ACL order seeded; full checklist pass on local dev with flags on; flags-off unavailable shell pass with flags commented off.

### Staging Smoke Result

**STAGING PASS** (2026-06-15 — local dev with flags on; operator-assisted magic-link auth)

#### Flag status (names only)

| Variable | Smoke run | Current local default |
|----------|-----------|----------------------|
| `FEATURE_GC_ORDER_HISTORY` | `1` | commented off in `.env.local` |
| `FEATURE_GC_REORDER_TO_QUOTE` | `1` | commented off in `.env.local` |

#### Buyer / company / order data used (redacted)

| Field | Value |
|-------|-------|
| Buyer user id | `5bfb9d49…514b` |
| Buyer email | `jj***@gmail.com` (redacted) |
| Auth method | Supabase magic link via service role (no password printed) |
| Company id | `59665c8f…9f1e` |
| Smoke order id | `b2780f5e…1016` |
| Smoke order number | `R6ADD-1779133592189` |
| Foreign ACL order id | `a28b0277…64a9` (`ACL-SMOKE-*`, other company `c24d4ee1…a67f`) |

#### Automated pre-checks

| Check | Result |
|-------|--------|
| `npm test` (root) | **PASS** (2026-06-15) |
| `cd storefront && npm test` | **PASS 765/765** |
| `cd storefront && npm run build` | **PASS** |
| Targeted portal/order policy tests | **PASS 23/23** |
| Reorder API (`buildReorderQuotePayload`) | **PASS** — 1 available line |

#### Manual checklist (browser — Playwright)

| Step | Result | Notes |
|------|--------|-------|
| Sign in at `/login` as buyer | **Pass** | Magic-link session injected; `/account` reachable without login redirect |
| Confirm `/account` dashboard | **Pass** | `httpStatusPath: /account` |
| “Order records” link on account | **Pass** | `hasOrderRecordsLink: true` |
| Visit `/account/orders` | **Pass** | Order list renders (12+ orders) |
| Order list or empty state; no stock | **Pass** | `showsOrderTableOrEmpty: true`; no inventory columns |
| Visit `/account/orders/[valid-order-id]` | **Pass** | Smoke order detail loads |
| Order detail read-only lines/totals | **Pass** | Lines + totals table; no edit controls |
| Inaccessible order ID (other company) | **Pass** | Foreign order `a28b0277…64a9` → not-found; no foreign order number leaked |
| No cross-company data leak | **Pass** | `leakedForeignOrderNumber: false`, `leakedBuyerOrderNumber: false` |
| Reorder-to-quote CTA | **Pass** | “Prepare selected lines” → “Add to quote cart & continue” |
| Lines land in `/quote-cart` | **Pass** | `cartItemCount: 1` |
| Copy says quote/review, not checkout | **Pass** | “not checkout” copy on order detail + quote cart |
| No payment CTA | **Pass** | No pay-now / card / Stripe CTAs |
| No stock/inventory on portal surfaces | **Pass** | Account, orders, detail, quote cart |
| Turn flags off → unavailable shell | **Pass** | `showsUnavailableShell: true`; no crash |

#### Blockers remaining

1. **Vercel Preview env** — flags not yet set on deployed preview host (local smoke only).
2. **Production flag enablement** — still **NO-GO** until preview smoke + ops sign-off.
3. **Password-path login** — smoke used magic link; optional `GC_PORTAL_SMOKE_BUYER_PASSWORD` not configured (non-blocking).

#### Operator rerun commands

```bash
cd storefront
# Enable flags in .env.local (staging/local only):
#   FEATURE_GC_ORDER_HISTORY=1
#   FEATURE_GC_REORDER_TO_QUOTE=1
npm run dev
npx tsx scripts/portal-smoke-acl-seed.mjs
npx tsx scripts/portal-smoke-browser.ts
# Flags-off unavailable shell:
# Comment flags off in .env.local, restart dev, then:
PORTAL_SMOKE_FLAGS_OFF_ONLY=1 npx tsx scripts/portal-smoke-browser.ts
```

**Production flag enablement:** **NO-GO** — local staging smoke **PASS**; Vercel Preview smoke **PASS** (see below). Production env flags remain **unset** pending ops sign-off.

### Vercel Preview Portal Smoke Result

**PREVIEW PASS** (2026-06-15 — deployed preview with Preview-only flags; operator-assisted magic-link auth + Vercel deployment-protection bypass)

#### Preview deploy / config fixes (this pass)

| Item | Detail |
|------|--------|
| **Monorepo build fix** | Added repo-root `vercel.json` so deploy includes `lib/commerce-packaging` + `lib/glove-sku-intelligence` (prior storefront-only deploys failed on `@commerce-packaging/*` imports) |
| **Root directory** | Vercel project now deploys from repo root (`vercel deploy` at `Glovecubs/`) |
| **Preview deployment** | `https://storefront-g3apsw5hk-jason-s-projects-920fb103.vercel.app` (redacted pattern: `https://storefront-….vercel.app`) |
| **Deployment protection** | Preview uses Vercel Authentication; smoke script auto-resolves protection bypass via `vercel curl` (token not printed) |

#### Flag status (names only)

| Variable | Production | Preview |
|----------|------------|---------|
| `FEATURE_GC_ORDER_HISTORY` | **Not set** | **`1`** |
| `FEATURE_GC_REORDER_TO_QUOTE` | **Not set** | **`1`** |
| Supabase runtime vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | **Not set** | **Set (Preview only)** — required for auth/order reads on deployed preview |

#### Smoke data (redacted — same as local staging)

| Field | Value |
|-------|-------|
| Buyer user id | `5bfb9d49…514b` |
| Company id | `59665c8f…9f1e` |
| Smoke order | `R6ADD-1779133592189` (`b2780f5e…1016`) |
| Foreign ACL order | `ACL-SMOKE-*` (`a28b0277…64a9`) |
| Auth | Magic link via local service role + Supabase session cookie on preview host |

#### Checklist results (Playwright on preview URL)

| Check | Result |
|-------|--------|
| `/account` + Order records link | **Pass** |
| `/account/orders` list | **Pass** — no unavailable shell; no stock/inventory |
| `/account/orders/[smoke-order-id]` detail | **Pass** — read-only lines/totals; no checkout CTA |
| Foreign order ACL | **Pass** — not-found; no order-number leak |
| Reorder-to-quote | **Pass** — Prepare → Add to quote cart |
| `/quote-cart` | **Pass** — 1 line; quote/review copy; “not checkout”; no payment CTA; no stock |
| Reorder API pre-check | **Pass** — 1 available line |

#### Blockers remaining

1. **Production env** — portal flags intentionally **off**; Supabase production runtime vars not configured on Vercel Production.
2. **Ops sign-off** — preview smoke passed; production flag enablement still requires explicit ops approval.
3. **Deployment protection** — preview URLs require Vercel bypass header or SSO for unauthenticated browser access (handled in smoke script; document for manual operators).

#### Operator rerun (preview)

```bash
cd storefront
npx tsx scripts/portal-smoke-browser.ts --base-url=https://storefront-<deployment>.vercel.app
```

#### Production GO/NO-GO (portal flags)

**NO-GO** for enabling `FEATURE_GC_ORDER_HISTORY` / `FEATURE_GC_REORDER_TO_QUOTE` on **Production** until ops completes [Production Environment Completion Checklist](#production-environment-completion-checklist) and [Production Buyer Portal Flag Enablement Sign-Off](#production-buyer-portal-flag-enablement-sign-off). **Preview verification complete.**

---

## Production Environment Completion Checklist

**Purpose:** Ops-run checklist to configure Vercel **Production** before portal flag enablement and production portal smoke. **Documentation only** — do not enable flags until Required Ops Decisions are checked and sign-off is recorded.

**Current baseline (2026-06-15):** Vercel Production scope has **0** env vars. Preview has portal flags + Supabase vars and passed smoke. Production portal smoke **NOT RUN**. Quote-first B2B launch remains **GO** with portal flags **off**.

#### Latest prerequisite gate (re-audit 2026-06-15)

**Gate result: BLOCKED** — production portal smoke **not executed**.

**Re-verified (latest audit pass):** `vercel env ls production` → **0** env vars. Ops sign-off **not recorded**. All checklist items below remain unchecked. Smoke **not run**.

| Prerequisite | Status |
| ------------ | ------ |
| `NEXT_PUBLIC_SUPABASE_URL` on Production | **Missing** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Production | **Missing** |
| `SUPABASE_URL` on Production | **Missing** |
| `SUPABASE_SERVICE_ROLE_KEY` on Production | **Missing** |
| Ops sign-off recorded | **Missing** |
| Production buyer/company/order smoke data confirmed | **Missing** |
| Foreign-company ACL test order confirmed | **Missing** |
| `FEATURE_GC_ORDER_HISTORY=1` approved + set on Production | **Missing** |
| `FEATURE_GC_REORDER_TO_QUOTE=1` approved + set on Production | **Missing** |
| Production redeploy after env/flags | **Missing** |

**Action taken:** Did **not** enable Production flags. Did **not** run `portal-smoke-browser.ts` against Production. Final decision remains **`PRODUCTION NO-GO`**.

### Required Vercel Production runtime vars

Set in Vercel → Project `storefront` → Settings → Environment Variables → **Production** (not Preview). Names only below — never commit or paste secret values in this doc.

**Step 1 — Supabase runtime (required before any portal smoke on Production):**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] All four vars set on **Production** scope
- [ ] Values match the intended **live** Supabase project (not staging/dev by mistake)
- [ ] Redeploy Production after adding vars (`vercel deploy --prod` from repo root)

**Step 2 — Portal flags (only after ops approval and Step 1 complete):**

```bash
FEATURE_GC_ORDER_HISTORY=1
FEATURE_GC_REORDER_TO_QUOTE=1
```

- [ ] Ops recorded **`PRODUCTION GO`** or approved **`PRODUCTION PARTIAL`** in [Sign-Off](#production-buyer-portal-flag-enablement-sign-off)
- [ ] **`PRODUCTION PARTIAL`:** set only `FEATURE_GC_ORDER_HISTORY=1`; leave `FEATURE_GC_REORDER_TO_QUOTE` unset
- [ ] **`PRODUCTION GO`:** set both flags as above
- [ ] Redeploy Production after setting flags

**Verify names only (no secret output):**

```bash
vercel env ls production
```

Expected before flags: four Supabase names. Expected after GO: six names (Supabase + both portal flags).

### Required ops decisions

Complete **all** before enabling portal flags on Production.

- [ ] **Production Supabase project** is the intended live data source (not Preview/staging project).
- [ ] **Production buyer login method** confirmed (`/login` → `/account` for a real buyer with `gc_commerce.company_members`).
- [ ] **Production buyer + company + order** identified for smoke (order id/number recorded out-of-band — redact in docs).
- [ ] **Foreign-company ACL test** — order UUID in a company the smoke buyer does **not** belong to (or ops-approved equivalent); expect **404**, no data leak.
- [ ] **Ops approves** exposing read-only order history to linked company buyers.
- [ ] **Ops approves** reorder-to-quote writing eligible lines to quote cart (no checkout, no DB order writes).
- [ ] **Rollback owner** named (who can remove Production flags and redeploy).
- [ ] **Rollback command** understood (see [Rollback steps](#rollback-steps) below).

Record approver and date in [Production Buyer Portal Flag Enablement Sign-Off](#production-buyer-portal-flag-enablement-sign-off) → Final decision.

### Production smoke rerun steps

**Prerequisites:** Step 1 Supabase vars on Production + redeploy. Portal flags set only if ops approved Step 2. Local `storefront/.env.local` must have service role for magic-link auth in smoke script (values not printed).

After env + sign-off + redeploy:

```bash
vercel deploy --prod
cd storefront
npx tsx scripts/portal-smoke-browser.ts --base-url https://storefront-iota-five.vercel.app
```

**Verify on Production:**

- [ ] `/account` loads for buyer; order history entry visible when flags on
- [ ] `/account/orders` loads (list or honest empty state)
- [ ] Same-company order detail loads **read-only** (lines/totals; no checkout CTA)
- [ ] Foreign-company order returns **not-found** / no leak
- [ ] Reorder-to-quote (if enabled) adds **one** quote line
- [ ] `/quote-cart` says **quote/review**, not checkout/payment
- [ ] **No payment CTA** on account, order detail, or quote cart
- [ ] **No stock/inventory** on portal paths

**Optional pre-check (redacted):**

```bash
cd storefront
node scripts/portal-smoke-discover.mjs
```

Record pass/fail in [Production portal smoke result](#production-portal-smoke-result-2026-06-15) and update Final decision to **`PRODUCTION GO`**, **`PRODUCTION PARTIAL`**, or keep **`PRODUCTION NO-GO`**.

### Rollback steps

If smoke fails after enabling flags, or wrong data is exposed:

```bash
vercel env rm FEATURE_GC_ORDER_HISTORY production
vercel env rm FEATURE_GC_REORDER_TO_QUOTE production
vercel deploy --prod
cd storefront
PORTAL_SMOKE_FLAGS_OFF_ONLY=1 npx tsx scripts/portal-smoke-browser.ts --base-url https://storefront-iota-five.vercel.app
```

**Expected after rollback:**

- [ ] `/account/orders` shows unavailable shell or safe fallback
- [ ] **No crash**
- [ ] Quote cart unaffected (still loads; no new checkout/payment CTAs)

Record rollback timestamp, operator, and confirmation in Sign-Off notes.

### Current decision

**`PRODUCTION NO-GO — Production env/sign-off incomplete.`** ← **do not change** until Production Supabase runtime vars are configured, ops decisions are checked, portal flags are enabled only with approval, redeploy completes, and production portal smoke passes.

| Related evidence | Status |
| ---------------- | ------ |
| Local buyer portal smoke | **STAGING PASS** |
| Vercel Preview portal smoke | **PREVIEW PASS** |
| Production portal smoke (flags on) | **NOT RUN** |
| Test suites (latest gate pass) | Root **PASS** (257/0 fail/1 skip); storefront **765/765** + build **PASS**; catalogos **696/5 skipped** |

---

## Production Buyer Portal Flag Enablement Sign-Off

**Last updated:** 2026-06-15 (prerequisite gate re-audit — smoke blocked)  
**Scope:** Vercel **Production** enablement of `FEATURE_GC_ORDER_HISTORY` and `FEATURE_GC_REORDER_TO_QUOTE` only. Does **not** authorize checkout, payment, inventory exposure, or CatalogOS/Express changes.

**Ops entry point:** complete [Production Environment Completion Checklist](#production-environment-completion-checklist) first, then record Final decision here.

### Current verified status

| Check | Status |
|-------|--------|
| Local buyer portal smoke | **STAGING PASS** |
| Vercel Preview buyer portal smoke | **PREVIEW PASS** |
| Manual Active Publish Smoke | **PASS** |
| Root `npm test` | **PASS** |
| `cd storefront && npm test` | **PASS 765/765** |
| `cd storefront && npm run build` | **PASS** |
| Vercel Production `FEATURE_GC_ORDER_HISTORY` | **OFF** — not set on Production scope (`vercel env ls production` — 0 vars) |
| Vercel Production `FEATURE_GC_REORDER_TO_QUOTE` | **OFF** — not set on Production scope |
| Vercel Production Supabase runtime vars | **Not configured** — Preview-only (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` on Preview) |
| Ops sign-off recorded | **No** — prerequisite checklist incomplete; decision box unchanged |
| Production portal smoke (flags on) | **NOT RUN** — blocked until Production env + ops GO/PARTIAL + redeploy |
| Production flags-off shell check | **FAIL** (2026-06-15) — see [Production portal smoke result](#production-portal-smoke-result-2026-06-15) |
| **Current recommendation** | **PRODUCTION NO-GO** — prerequisites incomplete |

**Quote-first constraints (all environments):** read-only order history; reorder writes to quote cart only; no self-serve checkout; no stock/inventory on customer portal surfaces.

### Final decision (ops — check one)

- [ ] **`PRODUCTION GO — flags may be enabled`**
- [x] **`PRODUCTION NO-GO — production env/sign-off not completed`** ← **current status**
- [ ] **`PRODUCTION PARTIAL — order history only, reorder-to-quote remains off`**

| Field | Value |
|-------|-------|
| Decision date | _(pending)_ |
| Approver name / role | _(pending)_ |
| Production URL verified | `https://storefront-iota-five.vercel.app` (production alias; latest prod deployment inspected) |
| Post-enable smoke result | **Not run** — flags off; Production Supabase runtime missing |
| Production env audit (2026-06-15) | Production scope: **0** env vars. Preview scope: `FEATURE_GC_ORDER_HISTORY`, `FEATURE_GC_REORDER_TO_QUOTE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (values encrypted; names only) |

### Production env verification (2026-06-15)

Command: `vercel env ls production` (project `storefront`, names only). **Re-verified 2026-06-15 (prerequisite gate).**

| Variable | Production | Preview |
| -------- | ---------- | ------- |
| `FEATURE_GC_ORDER_HISTORY` | **Not set** | Set |
| `FEATURE_GC_REORDER_TO_QUOTE` | **Not set** | Set |
| `NEXT_PUBLIC_SUPABASE_URL` | **Not set** | Set |
| `SUPABASE_URL` | **Not set** | Set |
| `SUPABASE_SERVICE_ROLE_KEY` | **Not set** | Set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Not set** | Set (required for buyer auth on host) |

**Ops sign-off:** **Not recorded.** Final decision checkbox remains **`PRODUCTION NO-GO`**. Production prerequisites checklist (Environment and data) — all items **unchecked**. Flags were **not enabled** during this audit (non-negotiable).

### Production portal smoke result (2026-06-15)

**Production host:** `https://storefront-iota-five.vercel.app`  
**Flags on production:** OFF (Vercel Production scope has no portal or Supabase vars).

#### Full portal smoke (flags on) — NOT RUN

**Latest (2026-06-15 re-audit):** Prerequisites gate **BLOCKED** — see [Latest prerequisite gate](#latest-prerequisite-gate-re-audit-2026-06-15). Smoke command **not executed**:

```bash
# NOT RUN — blocked until ops completes checklist
cd storefront
npx tsx scripts/portal-smoke-browser.ts --base-url https://storefront-iota-five.vercel.app
```

Blocked until ops completes checklist, sets Production Supabase + flag env vars, redeploys, and records **`PRODUCTION GO`** or **`PRODUCTION PARTIAL`**. Did not enable Production flags in this pass.

#### Flags-off shell check (rollback path baseline)

```bash
cd storefront
PORTAL_SMOKE_FLAGS_OFF_ONLY=1 npx tsx scripts/portal-smoke-browser.ts --base-url=https://storefront-iota-five.vercel.app
```

| Check | Result |
| ----- | ------ |
| Script exit | **FAIL** |
| Final path | `/request-pricing` (redirect; unavailable shell not shown) |
| Buyer session on prod host | Not established — Production deployment lacks Supabase runtime vars |
| `/account/orders` unavailable shell | **Not verified** on live Production |

**Interpretation:** Production cannot honor injected buyer session until Production Supabase vars are configured and redeployed. This is expected with current Production env gap — not a signal to enable flags without ops sign-off.

#### Production checks not verified (smoke blocked)

| Check | Status |
| ----- | ------ |
| `/account` hub + order records link | **Not verified** on Production |
| `/account/orders` list | **Not verified** |
| Same-company order detail (read-only) | **Not verified** |
| Foreign-company ACL (404, no leak) | **Not verified** |
| Reorder-to-quote → quote cart | **Not verified** |
| Quote cart quote/review copy (no checkout/payment) | **Not verified** on Production |
| No payment CTA / no stock on portal paths | **Not verified** on Production |

**Evidence for portal behavior remains:** local **STAGING PASS** and Vercel **PREVIEW PASS** (Preview env + flags configured).

#### Rollback readiness

| Item | Status |
| ---- | ------ |
| Production flags currently | **OFF** (not set) |
| Rollback plan in this doc | **Valid** — remove flags + redeploy |
| Flags-off smoke script | **Available** — `PORTAL_SMOKE_FLAGS_OFF_ONLY=1` |
| Re-run rollback confirmation after enablement | Required post-GO before treating Production as safe |

**Rollback today:** no-op for flags (already off). Quote-first catalog/PDP/quote cart unaffected.

### Production prerequisites checklist

Complete **all** items before setting Production flags. Names only for env vars; never commit or paste secret values in this doc.

#### Environment and data

- [ ] **Production Vercel** has required Supabase runtime vars configured (Preview scope is **not** sufficient):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_URL` (if used by server helpers)
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **Production Supabase project** is the intended live environment (not staging/dev project by mistake).
- [ ] **Buyer auth** confirmed on production domain (`/login` → `/account` for a real buyer with `gc_commerce.company_members`).
- [ ] **At least one production buyer + company + order** identified for smoke (order number and id recorded out-of-band — redact in docs).
- [ ] **`gc_commerce.company_members`** rows exist for production buyers who should see order history.
- [ ] **Order lines** for smoke order(s) have reorder mapping if reorder-to-quote will be enabled (active sellable → active catalog product → resolvable variant; see `reorder-to-quote-read-model.ts`).
- [ ] **Foreign-company ACL test** — order UUID in a company the smoke buyer does **not** belong to (or ops-approved equivalent); expect **404**, no data leak.

#### Product / policy gates

- [ ] **Support/operator** knows how to disable both flags quickly (see Rollback plan).
- [ ] **No checkout/payment CTA** on order detail, account, or quote cart paths (quote-first model unchanged).
- [ ] **No stock/inventory** on `/account`, `/account/orders`, order detail, or quote cart.
- [ ] **Ops approves** exposing read-only order history to linked company buyers.
- [ ] **Ops approves** reorder-to-quote writing eligible lines to quote cart (no checkout, no DB order writes).

#### Already verified (do not re-litigate unless production data differs)

- [x] Local staging smoke **PASS** (flags on, magic-link auth, ACL seed, reorder → quote cart).
- [x] Vercel Preview smoke **PASS** (Preview flags + Preview Supabase vars; deployment-protection bypass in smoke script).
- [x] Policy tests **PASS 23/23** (portal/order/reorder guards).

### Production enablement steps

**Do not run until prerequisites are checked and Final decision is `PRODUCTION GO` or approved `PRODUCTION PARTIAL`.**

1. **Confirm Production Supabase vars** in Vercel → Project `storefront` → Settings → Environment Variables → **Production** (not Preview).
2. **Set flags (Production only):**
   - `FEATURE_GC_ORDER_HISTORY=1` — enables `/account/orders` list + detail.
   - `FEATURE_GC_REORDER_TO_QUOTE=1` — enables reorder-to-quote on order detail (also implied when order history flag is on per code OR).  
   - **Partial option:** set only `FEATURE_GC_ORDER_HISTORY=1` and leave reorder off if ops chose `PRODUCTION PARTIAL`.
3. **Redeploy Production** (repo root `vercel deploy --prod` or promote vetted build).
4. **Run production portal smoke** (operator machine with local `.env.local` service role for magic-link auth — values not printed):

```bash
cd storefront
# Production URL — use live production hostname, not Preview
npx tsx scripts/portal-smoke-browser.ts --base-url=https://<PRODUCTION_STOREFRONT_HOST>
```

5. **Verify manually if smoke is blocked** (e.g. production SSO, custom domain cookies):
   - [ ] `/account` shows “Order records” link.
   - [ ] `/account/orders` — list or honest empty state; **no stock/inventory**.
   - [ ] `/account/orders/[valid-order-id]` — read-only lines/totals; **no checkout CTA**.
   - [ ] `/account/orders/[foreign-order-id]` — **404**; no cross-company leak.
   - [ ] Reorder-to-quote (if enabled) — lines land in `/quote-cart`; copy says quote/review, **not checkout/payment**.
   - [ ] Quote cart — **no payment CTA**; **no stock/inventory**.
6. **Record result** in Final decision table (date, approver, URL, pass/fail notes).

### Rollback plan

If order history or reorder exposes wrong data, confuses buyers, or violates quote-first constraints:

1. **Disable flags on Vercel Production** — remove or set off:
   - `FEATURE_GC_ORDER_HISTORY`
   - `FEATURE_GC_REORDER_TO_QUOTE`
2. **Redeploy Production** immediately.
3. **Confirm unavailable shell** (authenticated buyer):

```bash
cd storefront
PORTAL_SMOKE_FLAGS_OFF_ONLY=1 npx tsx scripts/portal-smoke-browser.ts --base-url=https://<PRODUCTION_STOREFRONT_HOST>
```

   - Expected: `/account/orders` shows honest “not available yet” shell; **no crash**.
4. **Confirm quote cart unchanged** — existing quote cart still loads; no new checkout/payment CTAs introduced by rollback.
5. **Record rollback result** (timestamp, operator, confirmation notes).

**Rollback does not** revert Supabase data, orders, or quote requests — flags only hide UI/API paths.

### Operator command runbook

#### Inspect flag state (names only)

```bash
cd storefront
vercel env ls production
vercel env ls preview
```

#### Add Production flag (example — run interactively; value is `1`)

```bash
cd storefront
echo 1 | vercel env add FEATURE_GC_ORDER_HISTORY production
echo 1 | vercel env add FEATURE_GC_REORDER_TO_QUOTE production
```

#### Remove Production flag (rollback)

```bash
cd storefront
vercel env rm FEATURE_GC_ORDER_HISTORY production
vercel env rm FEATURE_GC_REORDER_TO_QUOTE production
```

#### Deploy

```bash
cd c:\dev\Glovecubs
vercel deploy --prod
```

#### Smoke helpers (no secrets in command history beyond local `.env.local`)

```bash
cd storefront
npx tsx scripts/portal-smoke-discover.mjs
npx tsx scripts/portal-smoke-acl-seed.mjs
npx tsx scripts/portal-smoke-browser.ts --base-url=https://<HOST>
PORTAL_SMOKE_FLAGS_OFF_ONLY=1 npx tsx scripts/portal-smoke-browser.ts --base-url=https://<HOST>
```

| Script | Purpose |
|--------|---------|
| `portal-smoke-discover.mjs` | Redacted Supabase membership/order/reorder pre-check |
| `portal-smoke-acl-seed.mjs` | Idempotent foreign-company order for ACL smoke (non-production caution) |
| `portal-smoke-browser.ts` | Full browser checklist; supports `--base-url`; auto Vercel protection bypass on `*.vercel.app` |

**Production caution:** run ACL seed only in non-production Supabase or with ops approval; do not seed fake orders in live production without explicit policy.

### Remaining blockers (production enablement)

1. **Production Supabase runtime vars** — **0** vars on Vercel Production scope (verified 2026-06-15).
2. **Production buyer/order smoke data** — not verified on live hostname with flags on.
3. **Ops sign-off** — **not recorded**; Final decision remains **`PRODUCTION NO-GO`**.
4. **Foreign-company ACL on production** — not tested on live hostname (smoke blocked).
5. **Production portal smoke (flags on)** — not run; enable only after ops **`PRODUCTION GO`** or **`PRODUCTION PARTIAL`** + Production env + redeploy.
6. **Custom domain / SSO** — if production uses non-Vercel-auth flows, confirm smoke script or manual checklist still applies.

---

## Product Ingest Authority / Split-Brain Containment

**Audit date:** 2026-06-15  
**Scope:** Product URL/import entry points, extraction contracts, staging, promote, publish — **no ingestion rewrites in this pass.**

### Canonical authority (code-backed)

| Layer | Owner | Canonical contract | Canonical publish |
|-------|-------|-------------------|-----------------|
| URL extraction (bulk/single jobs) | CatalogOS | `ProductUrlExtractionV2` (`catalogos/src/lib/product-extraction/url-extraction-v2.ts`) when `GLOVECUBS_URL_EXTRACTION_V2=true` | — |
| Product setup / review evidence | CatalogOS | `ProductSetupContractV1` (`catalogos/src/lib/product-extraction/product-setup-contract.ts`) | — |
| Staging → live catalog | CatalogOS | `evaluatePublishReadiness` + `runPublish` (`publish-guards.ts`, `publish-service.ts`) | `POST /api/publish`, review actions |
| Storefront admin draft create | Storefront | `ImportDraftProductV1` + `productExtraction.ts` (clipboard only) | `product-write.ts` → `catalog_v2` **draft** only |
| Express legacy admin | Express (frozen) | `lib/parse-product-url.js` | `POST /api/admin/products/save` (legacy SPA) |

### Authority map

| Flow | Entry Point | Current Owner | Contract Used | Output | Publish Path | Status | Risk |
| ---- | ----------- | ------------- | ------------- | ------ | ------------ | ------ | ---- |
| CatalogOS URL import (bulk/single crawl) | `POST /api/admin/url-import` → `crawl-service.ts` | CatalogOS | `ProductUrlExtractionV2` (flag on) or OpenClaw legacy path (flag off) | `url_import_jobs`, `url_import_products` | None (staging only) | **Active — canonical for bulk URL** | **High** when V2 flag off (legacy OpenClaw path still runs) |
| CatalogOS URL import bridge | `POST /api/admin/url-import/[jobId]/bridge` → `bridge.ts` | CatalogOS | `ProductSetupContractV1` on `ParsedRow.product_setup_contract_full` | `import_batches` → `supplier_products_raw/normalized` (pending) | `runPipelineFromParsedRows` (no publish) | **Active — canonical** | Low — no auto-publish |
| CatalogOS URL import preview | `/dashboard/url-import/[jobId]` `UrlImportPreviewClient.tsx` | CatalogOS | V2 extraction summary + contract | UI only | None | **Active** | Low — preview only |
| CatalogOS review wizard | `ProductSetupWizardPanel.tsx` + `review-setup-wizard.ts` | CatalogOS | `ProductSetupContractV1` apply candidates | Updates staged `normalized_data` | None until operator publish | **Active — canonical** | Low |
| CatalogOS staged review | `/dashboard/review` `StagedProductDetail.tsx` | CatalogOS | Staging row + contract summary | `supplier_products_normalized` | `evaluatePublishReadiness` → `runPublish` | **Active — canonical publish** | Low |
| CatalogOS publish API | `POST /api/publish` | CatalogOS | `buildPublishInputFromStaged` | `catalog_v2.products/variants`, offers, search sync | `runPublish` | **Active — canonical** | Low |
| CatalogOS quick add (manual) | `/dashboard/products/quick-add` | CatalogOS | Dictionary + staging validation | `supplier_products_normalized` draft | Same `runPublish` after guards | **Active — canonical manual** | Low |
| Storefront bulk URL import UI | `/admin/products/import` → proxy `POST /admin/api/products/import/url` | Storefront proxy → CatalogOS | CatalogOS V2 (via crawl) | CatalogOS `url_import_jobs` | Bridge → CatalogOS staging (not storefront) | **Active — proxy only** | Low — does not extract locally |
| Storefront clipboard URL staging | `POST /admin/api/products/url-staging` → `clipboard-url-staging.ts` | Storefront | `ImportDraftProductV1` via `productExtraction.ts` (`productExtraction.v2`) | `catalog_v2.admin_url_clipboard_staging` | None at staging | **Active — parallel extractor** | **High** — duplicates V2 parser/mapper |
| Storefront import draft mapper | `import-draft-mapper.ts` | Storefront | `ImportDraftProductV1` | Normalized JSON in staging `extracted` | None | **Active — parallel contract** | **High** — not `ProductSetupContractV1` |
| Storefront clipboard promote | `POST .../url-staging/[id]/promote` → `import-draft-promote.ts` | Storefront | `ImportDraftProductV1` → `ProductWriteInput` | `catalog_v2.catalog_products` **status=draft** | `product-write.ts` (not `runPublish`) | **Active — draft only** | **Medium** — bypasses CatalogOS publish-guards |
| Storefront unified ingestion promote | `POST .../ingestion/staging/[id]/promote` | Storefront | `ImportDraftProductV1` from unified staging | `catalog_v2` draft | `product-write.ts` | **Transitional** (`UNIFIED_STAGING_WRITE`) | Medium — flag-gated fourth staging table |
| Storefront manual admin add/edit | `/admin/products/new`, `product-editor-actions.ts` | Storefront | `ProductWriteInput` + `product-editor-readiness.ts` | `catalog_v2` draft or **active** if operator sets status | Direct `insertCatalogProduct` / `updateCatalogProduct` | **Active** | **Medium** — can set `status=active` without CatalogOS `runPublish` |
| Express parse-product-url | `POST /api/admin/products/parse-url` (`server.js`) | Express (frozen) | `lib/parse-product-url.js` raw extract | JSON hints to caller | None | **Transitional — frozen route** | **High** for legacy SPA only |
| Express products save | `POST /api/admin/products/save` | Express (frozen) | Legacy product shape | Legacy/public product tables | Legacy save path | **Transitional — frozen** | High if used for new products |
| Legacy SPA URL add | `public/js/app.js` → Express parse-url + save | Legacy SPA | Express parsers | Legacy paths | Legacy save | **Deprecated** (prod redirect) | Medium — blocked in prod when redirect on |

### Active ingest paths (operator-facing)

1. **Canonical URL → sellable:** CatalogOS URL import (V2 on) → bridge → review + wizard → `runPublish`.
2. **Canonical manual:** CatalogOS quick-add → review → `runPublish`.
3. **Parallel URL (avoid for new work):** Storefront clipboard staging → promote → storefront editor → manual `active` via `product-write`.
4. **Transitional:** Express parse-url + save via legacy SPA; unified ingestion when flags enabled.

### Transitional paths (do not extend)

- `lib/parse-product-url.js` + `POST /api/admin/products/parse-url` (frozen in `scripts/express-route-freeze-baseline.json`)
- `POST /api/admin/products/save` (Express)
- `public/js/app.js` admin product URL flows
- CatalogOS OpenClaw-only crawl branch when `GLOVECUBS_URL_EXTRACTION_V2=false`
- Storefront `productExtraction.ts` for **new** URL features (containment: bugfixes only until bridged)

### Prohibited future paths

- A fourth monolithic URL parser in storefront or Express
- Auto-publish from URL import, bridge, clipboard staging, or import-draft promote
- Storefront clipboard calling CatalogOS extraction then writing a **different** normalized shape without contract bridge
- New Express routes for product create/publish
- Replacing manufacturer SKUs with internal GLV SKUs at extraction identity
- Collapsing X/XL size codes or changing variant clustering in ingest
- Exposing inventory/stock on ingest or publish surfaces
- Changing case/pallet sell-unit rules in parallel mappers

### Split-brain findings (this audit)

| Severity | Files | Current behavior | Should defer to | Duplicates | Classification | Containment |
|----------|-------|------------------|-----------------|------------|----------------|-------------|
| **High** | `storefront/src/lib/admin/productExtraction.ts`, `clipboard-url-staging.ts` | Local HTML extraction → `ImportDraftProductV1` | CatalogOS `ProductUrlExtractionV2` + bridge | Parser, variants, packaging, SKU proposals | **Active** | Operator runbook: bulk URL → CatalogOS; clipboard = legacy quick paste only |
| **High** | `storefront/src/lib/admin/import-draft-types.ts` vs `product-setup-contract.ts` | Parallel schemas; no cross-import | `ProductSetupContractV1` | Setup/review evidence shape | **Active** | Future bridge `ImportDraftProductV1` → contract summary; do not extend draft schema |
| **High** | `lib/parse-product-url.js`, `server.js` parse-url route | Third parser for legacy SPA | CatalogOS V2 | Parser, Hospeco enrich | **Transitional** | Frozen; no new callers in Next storefront `src/` |
| **Medium** | `product-write.ts`, `product-editor-readiness.ts` vs `publish-guards.ts` | Storefront can write `catalog_v2` active without `runPublish` | CatalogOS publish pipeline | Publish guards, commerce sync, offers | **Active** | Manual publish in storefront editor is intentional shortcut; URL-sourced products must use CatalogOS publish |
| **Medium** | `crawl-service.ts` (V2 off branch) | OpenClaw extract path still runs | V2 when flag on | Extraction logic | **Transitional** | Require `GLOVECUBS_URL_EXTRACTION_V2=true` in all ingest envs |
| **Medium** | `unified-ingestion-promote.ts`, `catalog_staging_*` tables | Fourth staging surface behind flags | Clipboard or CatalogOS staging | Staging + promote | **Transitional** | Do not enable flags for new URL work until unified path documented |
| **Low** | `storefront` bulk URL proxy routes | Correctly proxy only | CatalogOS | None | **Active** | Keep as thin proxy; policy tests enforce |
| **Low** | `import-pipeline.policy.test.ts`, `clipboard-url-staging.policy.test.ts` | Guard html-evidence / editor UI drift | — | — | **Test-only** | Extend with `product-ingest-authority.policy.test.ts` |

### Must-not-break invariants

- `ProductUrlExtractionV2.version === "product-url-extraction-v2"` — do not change contract file
- `PRODUCT_SETUP_CONTRACT_SCHEMA_VERSION === "glovecubs.product_setup_contract.v1"` — do not change contract file
- URL import / bridge / pipeline: **no auto-publish** (`run-pipeline.ts`, `bridge.ts`, clipboard staging)
- Clipboard promote: **draft only** (`promoteStagingToDraftProduct` → `status: "draft"`)
- Manufacturer SKU preserved on variants; GLV SKUs are proposals/overrides only
- Express route freeze: `POST /api/admin/products/parse-url` remains in baseline
- Storefront bulk URL import does not import `productExtraction` in proxy routes

### Recommended consolidation sequence

1. **Env:** Set `GLOVECUBS_URL_EXTRACTION_V2=true` on CatalogOS in staging/production ingest hosts.
2. **Operator runbook:** URL-sourced products → CatalogOS import → bridge → review/wizard → publish; stop using clipboard for supplier URL pages.
3. **Storefront clipboard:** Route clipboard POST through CatalogOS single-URL job (proxy) OR bridge `ImportDraftProductV1` → `ProductSetupContractV1` summary (no new parser).
4. **Publish convergence:** Storefront `status=active` for URL-derived drafts should call CatalogOS `runPublish` or shared guard module (not in this pass).
5. **Retire:** Legacy SPA parse-url UX; OpenClaw-only crawl branch after V2 stable; unified staging flags after single queue.
6. **Express:** Keep frozen; verify no new Next callers (policy test).

### Policy tests added (2026-06-15)

- `catalogos/src/lib/product-ingest-authority.policy.test.ts` — URL-import path does not call `runPublish`; canonical contract version strings
- `storefront/src/lib/admin/product-ingest-authority.policy.test.ts` — no `parse-product-url` in `src/`; clipboard promote stays draft-only

**Intentionally not added:** brittle cross-package import ban on `productExtraction.ts` (existing `import-pipeline.policy.test.ts` already scopes pipeline files). CatalogOS snapshot **unit** tests now mock admin client; live-DB integration tests remain opt-in (see **CatalogOS Env-Dependent Test Cleanup**).

### Clipboard URL Ingest Containment Status (2026-06-15)

| Item | Detail |
|------|--------|
| **Option chosen** | **A** — CatalogOS-first extraction via existing `catalogosInternalRequest` single-product URL import; local `productExtraction.ts` fallback only when CatalogOS is unconfigured or import fails |
| **Files touched** | `storefront/src/lib/admin/clipboard-url-catalogos-extract.ts`, `clipboard-url-staging.ts`, policy tests (`clipboard-url-staging.policy.test.ts`, `import-pipeline.policy.test.ts`, `product-ingest-authority.policy.test.ts`), `clipboard-url-catalogos-extract.test.ts` |
| **Risk reduced** | Clipboard URL paste no longer **always** runs a parallel storefront parser when CatalogOS is online; staging `extracted` can carry `product_setup_contract_*` passthrough and `extraction_authority: catalogos_url_import_v2` |
| **Remains transitional** | `ImportDraftProductV1` shape for promote/editor; local `productExtraction` fallback; clipboard → `product-write` draft promote (not CatalogOS `runPublish`); unified staging flags |
| **No publish behavior change** | Staging still `needs_review`; promote still `status: "draft"` via `promoteStagingToDraftProduct`; no `runPublish`, no `active` from clipboard path |
| **Next step** | Operator runbook: bulk URL → CatalogOS review/publish; clipboard for quick paste only. Future: route clipboard promote through CatalogOS publish or shared guards |

### Clipboard Promote Publish Guard Status (2026-06-15)

| Item | Detail |
|------|--------|
| **Before** | Promote already called `promoteStagingToDraftProduct` with `status: "draft"`, but `insertCatalogProduct` could still activate when `input.status === "active"`; editor `updateCatalogProduct` could set `active` after save; CatalogOS job metadata was not persisted on draft |
| **After** | Promote route rejects `status: active/published` in body; forces `merged.status = "draft"`; seeds `import_extraction_authority`, `catalogos_url_import_job_id`, contract schema version on product metadata; `insertCatalogProduct` skips activation when `importStagingId` set; `updateCatalogProduct` blocks `active` for `import_staging_id` products; editor publish readiness blocks URL-import drafts |
| **Files** | `clipboard-promote-guards.ts`, `url-staging/[id]/promote/route.ts`, `product-write.ts`, `product-editor-readiness.ts`, `products/[productId]/page.tsx`, policy tests |
| **Guardrails** | Draft-only promote; no `runPublish`; no Express parser; metadata preservation; storefront publish blocked for URL-import drafts |
| **Unresolved** | Manual non-URL products still publish via storefront editor; CatalogOS `runPublish` vs `product-write` dual path remains |
| **Dual publish blocker** | **Still active** — URL-import drafts are guarded; general manual admin publish path unchanged |

### Clipboard CatalogOS Bridge Status (2026-06-15)

| Item | Detail |
|------|--------|
| **Implementation** | **UI CTA + API helper** — `clipboard-staging-catalogos-bridge.ts` path builders; `ClipboardUrlStagingClient` primary **“Bridge to CatalogOS review”** when `catalogos_job_id` + `catalogos_product_id` + `extraction_authority: catalogos_url_import_v2`; calls existing storefront proxy `POST /admin/api/products/import/url/jobs/[jobId]/bridge` with `{ product_ids: [...] }` |
| **CatalogOS bridge contract** | CatalogOS: `POST /api/admin/url-import/[jobId]/bridge` via `catalogosInternalRequest`; body `{ product_ids: string[] }` (required, max 2000); response `{ success: true, batchId, normalizedCount }`; bridges via `bridgeUrlImportToBatch` → `runPipelineFromParsedRows` (no publish) |
| **Before operator path** | Clipboard paste → storefront staging only → **Promote to draft** (fallback) → storefront editor (publish blocked for URL-import drafts) |
| **After operator path** | Clipboard paste (CatalogOS-first) → **Bridge to CatalogOS review** → storefront review queue (`/admin/products/review?batchId=…`) + CatalogOS review/job links → CatalogOS wizard/publish guards → `runPublish`; **Promote to draft (fallback)** remains draft-only |
| **Files changed** | `clipboard-staging-catalogos-bridge.ts`, `clipboard-staging-catalogos-bridge.test.ts`, `ClipboardUrlStagingClient.tsx`, `import/url/page.tsx`, `clipboard-staging-ui.policy.test.ts`, this audit |
| **Remains transitional** | Two admin surfaces (storefront clipboard + CatalogOS bulk URL import); storefront review queue vs CatalogOS `/dashboard/review`; operators may still use draft promote fallback; manual non-URL storefront publish unchanged |
| **Dual publish/admin blocker** | **Still active** — bridge routes toward CatalogOS canonical publish but does not remove storefront draft promote or general manual publish paths |

### Storefront Review Queue CatalogOS Handoff Status (2026-06-15)

| Item | Detail |
|------|--------|
| **Before** | Bridge linked to `/admin/products/review?batchId=…` but page only showed batch id; unified queue **Approve / promote** could create storefront drafts for deep-crawl URL-import rows (`ingestion_jobs.lineage.url_import_job_id`) |
| **After** | Batch handoff banner + CatalogOS review links (`/dashboard/review?batch_id=…`); unified/clipboard URL-import rows show **“reviewed and published in CatalogOS”** with job/batch/review CTAs; **Approve / promote hidden** for URL-import rows; API `promoteUnifiedStagingVariant` rejects `lineage.url_import_job_id` |
| **Detection** | **Batch:** `batchId` search param (from bridge). **Unified row:** `ingestion_jobs.lineage.url_import_job_id` (+ optional `source_batch_id`). **Clipboard row:** `parseClipboardCatalogosStagingRef` on extracted blob |
| **Blocked / redirected** | Storefront unified promote for URL-import lineage; storefront publish not exposed from review queue (promote was draft-only already). Operators redirected to CatalogOS review dashboard, batch filter, or URL import job |
| **Files changed** | `review-queue-catalogos-handoff.ts`, `unified-ingestion-review-queue.ts`, `unified-ingestion-promote-guards.ts`, `unified-ingestion-promote.ts`, `ProductReviewQueueClient.tsx`, `review/page.tsx`, policy tests |
| **Unresolved** | Bridged batches may not appear in unified queue (CatalogOS `import_batches` vs `catalog_v2` staging); storefront review queue remains a visibility surface; manual non-URL unified promote unchanged; clipboard draft promote fallback unchanged |
| **Dual publish/admin blocker** | **Still active** — CatalogOS `runPublish` vs storefront `product-write` for manual/non-URL paths; URL-import batches/rows now guided away from storefront promote |

### CatalogOS Bridge Success Deep-Link Status (2026-06-15)

| Item | Detail |
|------|--------|
| **Before** | Bridge success in `UrlJobDetailClient` and `ClipboardUrlStagingClient` linked **primary** to storefront `/admin/products/review?batchId=…`; CatalogOS review was secondary or absent |
| **After** | Shared `UrlImportBridgeSuccessBanner` + `buildUrlImportBridgeSuccessLinks`: **primary** CatalogOS batch review (`/dashboard/review?batch_id=…`) or dashboard when `catalogosBaseUrl` configured; **secondary** storefront review (visibility); optional job link |
| **Primary CTA** | `Open batch in CatalogOS review` when batch + base URL; else `Open CatalogOS review`; else storefront review queue |
| **Secondary CTA** | `Storefront review (visibility)` when CatalogOS primary is available |
| **Wizard row deep links** | **Not available** — bridge response returns only `{ batchId, normalizedCount }`; no staged row ids; use batch/dashboard links only |
| **Files changed** | `clipboard-staging-catalogos-bridge.ts`, `UrlImportBridgeSuccessBanner.tsx`, `ClipboardUrlStagingClient.tsx`, `UrlJobDetailClient.tsx`, `jobs/[jobId]/page.tsx`, policy tests |
| **Unresolved** | Per-row wizard deep links need bridge/API to return staged ids; dual admin surfaces remain; clipboard draft promote fallback unchanged |
| **Dual publish/admin blocker** | **Partially contained** — URL-import storefront active publish blocked; manual active save allowed with UI + server minimum guards; Express legacy path remains |

## Recommended Next Cursor Prompt

```
/build Optional shared manual publish wrapper (offers + attribute snapshot) callable from storefront product-write active path — without rewriting runPublish or touching Express/URL-import paths.
```

---

## Go / No-Go Assessment

| Launch mode | Verdict | Rationale |
|-------------|---------|-----------|
| **Quote-first B2B (no card checkout)** | **Conditional GO** after staging portal smoke + prod env verified | Storefront build and root CI pass; catalog, account, quotes, invoice intake, and CatalogOS publish path are substantially ready |
| **Full self-serve commerce** | **NO-GO** | Checkout intentionally disabled; order history flag-off; Express/Next API split |
| **Operator product adding at scale** | **Conditional GO** via CatalogOS | Use V2 URL import + review wizard; avoid storefront clipboard for URL products until consolidated |

**Customer portal:** Partial — functional MVP on Next; order history + reorder-to-quote are staging-ready behind flags; production flags remain off pending ops sign-off (see Staging Verification Status).
  
**Product adding:** Partial — CatalogOS canonical path is strong; split admin entry points remain the main operational risk.

---

## Publish Authority / Dual Admin Path Audit

**Date:** 2026-06-15  
**Scope:** Active publish paths only — CatalogOS canonical publish vs storefront manual/product-write vs legacy Express.

### Publish authority table

| Publish Path | Entry Point | Owner | Guard Used | Can Set Active? | URL Import Allowed? | Manual Product Allowed? | Risk |
| ------------ | ----------- | ----- | ---------- | --------------: | ------------------: | ----------------------: | ---- |
| **CatalogOS review publish** | `catalogos/src/app/actions/review.ts` → `publishStagedToLive` | CatalogOS | `evaluatePublishReadiness` → `runPublish` | Yes | Yes (canonical) | N/A (staging rows) | Low — full pipeline |
| **CatalogOS wizard publish** | `review-setup-wizard.ts` + `StagedProductDetail` / `ProductSetupWizardPanel` | CatalogOS | `evaluatePublishReadiness` (UI); publish via `review.ts` | Yes | Yes (canonical) | N/A | Low |
| **CatalogOS POST /api/publish** | `catalogos/src/app/api/publish/route.ts` | CatalogOS | `evaluatePublishReadiness` → `runPublish` | Yes | Yes | N/A | Low |
| **CatalogOS variant-group publish** | `review.ts` → `runPublishVariantGroup` | CatalogOS | Staged status + batch guards | Yes | Yes | N/A | Low |
| **Storefront product editor active save** | `ProductEditorShell` → `adminUpdateProductAction` → `updateCatalogProduct` | Storefront | UI: `computeEditorReadiness`; server: `evaluateActivePublishReadiness` → `computeEditorReadiness` | Yes (non-URL only) | **No** (blocked) | Yes | **Medium** — server now mirrors editor readiness; still no offers/sync pipeline |
| **Storefront manual add active save** | `ProductEditorForm` → `adminCreateProductAction` → `insertCatalogProduct` | Storefront | Client minimum fields + server `evaluateActivePublishReadiness` | Yes (non-URL only) | **No** (`importStagingId` forces draft) | Yes | **Medium** — server readiness mirror on active insert |
| **Storefront clipboard promote** | `url-staging/[stagingId]/promote/route.ts` → `promoteStagingToDraftProduct` | Storefront | `clipboardPromoteStatusOverrideError`; always `status: "draft"` | **No** | Promote to draft only | N/A | Low — contained |
| **Storefront unified review promote** | `ingestion/staging/.../promote/route.ts` → `promoteUnifiedStagingVariant` | Storefront | `canPromoteUnifiedStaging` blocks `catalogosUrlImportJobId`; `insertCatalogProduct` draft-only | **No** | **No** (CatalogOS handoff) | Yes (non-URL CSV/unified) | Low for URL; medium for non-URL draft promote |
| **Express legacy save** | `server.js` → `productsService` → `catalogosProductService.createProduct/updateProduct` | Express (frozen) | `in_stock` heuristic only; no publish-guards | Yes | Unguarded | Yes | **High** — bypasses CatalogOS readiness; route freeze — do not extend |

### URL-import publish status

| Check | Status |
| ----- | ------ |
| Clipboard promote sets active | **Blocked** — draft-only + `clipboardPromoteStatusOverrideError` |
| Unified promote for CatalogOS URL jobs | **Blocked** — `canPromoteUnifiedStaging` returns 409 |
| Storefront editor active save on URL-import metadata | **Blocked** — `isUrlImportProductMetadata` (`import_staging_id`, `catalogos_url_import_*`, known extraction authority) |
| Storefront product-write calls `runPublish` | **No** — policy-tested |
| CatalogOS remains canonical publish for URL import | **Yes** — `runPublish` + offers/sync only from CatalogOS |

### Manual product publish status

**Recommendation: keep storefront manual active publish with guards** (not draft-only).

- Manual/non-URL products may be created and published from storefront when minimum server guards pass and edit UI readiness passes.
- `ProductEditorShell` enforces full `computeEditorReadiness` (images, category, glove attrs, case/pallet, SKU collisions) before publish click.
- Server layer enforces URL-import block + full `evaluateActivePublishReadiness` mirror of `computeEditorReadiness({ publishIntent: true })`.
- Draft editing is unchanged.

### Remaining dual-path risk

1. **Storefront active save vs CatalogOS `runPublish`** — storefront sets `catalog_v2.catalog_products.status = active` directly without supplier offers sync, attribute snapshot rebuild, or publish_events audit trail that `runPublish` provides.
2. **Express `catalogosProductService`** — legacy admin JSON can still activate products via `in_stock` without CatalogOS guards (frozen surface; drain to Next).
3. **API bypass** — direct calls to `adminUpdateProductAction` skip UI readiness; server minimum guard only.

### Safe containment applied (this audit)

- Extended `isUrlImportProductMetadata` to block active publish when `catalogos_url_import_job_id` / `catalogos_url_import_product_id` / known `import_extraction_authority` present (not only `import_staging_id`).
- Added server-side `evaluateActivePublishReadiness` mirroring `computeEditorReadiness` on active insert/update.
- Policy + unit tests for publish guards.

### Storefront Manual Active Save Server Readiness Status

**Before:** Server active save used `manualActivePublishGuard` only (category, primary image, one variant). UI `ProductEditorShell` enforced full `computeEditorReadiness`, but API/direct writes could bypass.

**After:** `insertCatalogProduct` and `updateCatalogProduct` call `evaluateActivePublishReadiness` when `status === "active"`, which maps `ProductWriteInput` into `computeEditorReadiness` via `product-write-active-readiness.ts`.

**Files:** `product-write-active-readiness.ts`, `product-write.ts` (wired on insert/update active paths).

**Checks enforced server-side:** URL-import metadata block; product name; brand; category; primary image; variants + variant SKUs; case/pallet commerce packaging (units per case, case price); required category attributes; glove filter attributes (when glove candidate); SKU collision blockers; governance blockers (orphan category, duplicate GTIN as publish blockers); variant duplicate issues.

**Still different from CatalogOS `runPublish`:** No supplier offer upsert, no `product_attributes` snapshot rebuild from staging, no `publish_events` audit, no `evaluatePublishReadiness` staging workflow gates, no master-product link requirement, no global GTIN/signature collision DB scan on write.

**Remaining risk:** Express `catalogosProductService` legacy active path; storefront active save still sets `catalog_products.status` directly without offers/sync pipeline.

**Recommendation:** Keep manual storefront active publish with server readiness mirror. URL-import remains CatalogOS-only for live publish.

### Next consolidation step

Route all **URL-import** live publish exclusively through CatalogOS (`evaluatePublishReadiness` → `runPublish`). For **manual** products, next step is optional shared publish wrapper (offers + attribute snapshot) callable from storefront — without rewriting `runPublish`. Retire Express product create/update active path when Next admin fully replaces SPA admin JSON.

### Storefront Manual Publish Side-Effect Parity

**Audit date:** 2026-06-15  
**Scope:** Storefront `insertCatalogProduct` / `updateCatalogProduct` active path vs CatalogOS `runPublish` (`publish-service.ts`). No wrapper built in this pass.

#### Side-effect parity table

| Side Effect | CatalogOS `runPublish` | Storefront Active Save | Required for Manual Launch? | Risk if Missing | Safe Convergence Option |
| ----------- | ---------------------: | ---------------------: | ---------------------------: | --------------- | ----------------------- |
| **status active** | Yes — `activateCatalogProductWhenReady` after attribute/commerce/image gates | Yes — final `catalog_products.status = "active"` after readiness guard | **Yes** | Product invisible on `/store` | Already converged in `product-write.ts` |
| **variants** | Yes — `upsertCatalogVariantFromGloveIngest` / insert with size + SKU proposals | Yes — `insert`/`mergeVariantsForProduct` with collision checks | **Yes** | PDP/quote cart cannot pick size/SKU | Already converged |
| **images** | Yes — `ensurePublishImages` | Yes — `syncProductImages` | **Yes** | Broken PDP/listing cards | Already converged |
| **category** | Yes — slug lookup + `metadata.category_id` on activate | Yes — `mergeProductMetadata` writes `category_id` | **Yes** | Wrong filters / readiness failures | Already converged |
| **attributes / filter snapshot** | Yes — `syncProductAttributesFromStaged` + **`refreshProductAttributesJsonSnapshot`** (`metadata.facet_attributes`) | Yes — **`syncProductAttributesFromEditor`** → `catalogos.product_attributes` only (no JSON snapshot rebuild) | **Partial** — rows yes, snapshot no | Next `/store` reads **`product_attributes` directly** (facets OK). Stale `facet_attributes` affects legacy Express/admin KPI paths only | Future shared hook: call `refreshProductAttributesJsonSnapshot` after editor sync (CatalogOS helper exists; no combined hook yet) |
| **supplier offers** | Yes — `supplier_offers` upsert via `buildSupplierOfferUpsertRow` | **No** | **No** for quote-first PDP/listing default sort | No row in `product_best_offer_price` → **price filter/sort** omit product; `bestPrice` null (case price still from `metadata.commerce_packaging`) | Future shared hook: manual-offer upsert from editor case price + internal SKU (do **not** call full `runPublish`) |
| **case/pallet commerce data** | Yes — `syncCommercePackagingToCatalogV2Metadata` from staging | Yes — `applyCommercePackagingToMetadata` on save when editor sends `commerce_packaging` | **Yes** | PDP/quote cart lose case/pallet pricing | Already converged for manual editor path |
| **publish event / audit** | Yes — `publish_events` insert | **No** | **No** | Weaker operator audit trail for manual publishes | Optional future hook; non-blocking for launch |
| **master product linking** | Yes — required via `evaluatePublishReadiness` staging workflow | **N/A** — manual products have no staging row | **No** | None for storefront-created manual SKUs | Keep N/A; URL import stays CatalogOS-only |
| **storefront visibility / searchability** | Yes — verifies active + updates staging `search_publish_status` | Yes — `status = active` only (no staging search sync) | **Yes** | Manual products visible on default `/store` sort; no external search index dependency verified | Accept for launch; staging search fields irrelevant without normalized row |
| **pricing display compatibility** | Offer-driven `bestPrice` + commerce metadata | Commerce metadata + variant `list_price` fallback; **no** offer view row | **Partial** | Cards/PDP show case price from packaging; price-sorted listing and price-range filter skip product | Document operator expectation; optional offer upsert in shared hook |
| **quote / cart compatibility** | Uses `catalog_v2` variants + commerce metadata (+ sellable for legacy checkout) | Uses same variant/commerce writes; **no** `gc_commerce.sellable_products` upsert | **Yes** for quote-first | Quote cart works from catalog rows; reorder-to-quote (flag off) needs sellable link for historical orders only | Optional `upsertSellableForCatalogV2Product` when reorder flags enabled |
| **rollback / error handling** | Transactional stages; publish fails if snapshot/commerce/search sync fails | Per-step writes; active flip last; delete-on-fail on insert only | **Partial** | Update path can leave draft intermediate state if later step fails after partial writes | Future hook should mirror activate-last ordering; not launch-blocking |

#### Launch-critical vs acceptable gaps

**Launch-critical (storefront path already covers):** active status, variants, images, category metadata, `product_attributes` facet rows, `metadata.commerce_packaging`, server `evaluateActivePublishReadiness` mirror.

**Acceptable for quote-first launch (documented gaps):** no `supplier_offers` / `product_best_offer_price` (price filter + price sort degraded; display fallback OK), no `publish_events`, no staging `search_publish_status`, no `facet_attributes` snapshot rebuild, no `gc_commerce.sellable_products` (reorder flag off).

**Not acceptable to bypass:** URL-import products activating via storefront (blocked).

#### Recommendation: **Option A** (keep storefront manual active save with readiness guard)

Manual non-URL products can go live from the storefront editor for quote-first launch. Missing CatalogOS side effects are **operational/pricing-authority gaps**, not customer-facing blockers, given `commerce_packaging` + direct `product_attributes` writes.

**Option B** (small shared post-active hook) is the **next build step** when a dedicated helper is added — individual CatalogOS functions exist (`refreshProductAttributesJsonSnapshot`, `upsertSellableForCatalogV2Product`, `buildSupplierOfferUpsertRow`) but **no safe combined hook** callable from storefront without new wiring. Do **not** call full `runPublish` from storefront.

**Option C** (draft-only until shared publish) — **not recommended**; would block intentional manual admin workflow without fixing customer-visible gaps.

#### Missing side effects (manual storefront active save)

1. `catalogos.supplier_offers` upsert → `product_best_offer_price` view empty  
2. `refreshProductAttributesJsonSnapshot` → legacy `metadata.facet_attributes` drift  
3. `gc_commerce.sellable_products` upsert → reorder/legacy checkout bridge absent  
4. `publish_events` audit row  
5. Staging lifecycle + `finalizePublishSearchSync` (N/A without normalized row)

#### Safe next build step

Add a **manual-only** post-active helper (new module, not `runPublish`) invoked from `product-write.ts` after readiness passes: (1) optional supplier offer from editor case price, (2) `refreshProductAttributesJsonSnapshot`, (3) optional sellable upsert when reorder flags on. Guard: never run for URL-import metadata; never replace staging publish.

#### Dual publish path status

**Still active.** URL-import active publish is contained (CatalogOS-only). Manual storefront active save remains a second publish path with documented side-effect gaps. Express `catalogosProductService` legacy active path remains a third unguarded surface (frozen).

#### Policy tests added (this pass)

- `storefront/src/lib/admin/storefront-manual-publish-side-effects.policy.test.ts` — documents missing CatalogOS post-publish calls on active save; URL-import must use CatalogOS publish

### Storefront Manual Post-Active Side Effects Status

**Date:** 2026-06-15  
**Helper:** `storefront/src/lib/admin/product-write-manual-post-active.ts` (`runManualPostActiveSideEffects`)

#### Side effects implemented

| Side effect | Status | Notes |
|-------------|--------|-------|
| `metadata.facet_attributes` JSON snapshot | **Implemented** | `product-attributes-json-snapshot.ts` mirrors CatalogOS snapshot; **fail-closed** on error |
| `catalogos.supplier_offers` upsert | **Conditional** | Uses `buildSupplierOfferUpsertRow` when `GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID` is set + case price + variant/parent SKU; skips safely when unconfigured |
| `gc_commerce.sellable_products` upsert | **Implemented (non-blocking)** | From editor case price; warnings only on failure — does not enable checkout |

#### Side effects intentionally skipped

| Side effect | Reason |
|-------------|--------|
| `publish_events` | Requires staging `normalized_id`; no safe manual helper |
| `finalizePublishSearchSync` / staging `search_publish_status` | N/A without normalized staging row |
| Supplier offer when env unset | No fabricated supplier identity — set `GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID` in operator env |

#### Before / after manual active behavior

| Step | Before | After |
|------|--------|-------|
| Readiness guard | `evaluateActivePublishReadiness` | Unchanged |
| Attribute rows | `syncProductAttributesFromEditor` | Unchanged |
| Post-active | None — only `status = active` | Snapshot refresh (+ optional offer/sellable) then activate |
| URL-import active | Blocked | Still blocked — helper never runs |

#### Quote-first launch readiness

**Improved:** facet JSON snapshot parity; optional `product_best_offer_price` when operator supplier env is set; sellable bridge for future reorder (non-blocking).

**Still different from CatalogOS `runPublish`:** staging workflow gates, master-product linking, publish_events audit, search sync lifecycle, SKU proposal application from staging.

#### Dual publish path status

**Still active** for manual products (intentional). URL-import remains CatalogOS-only. Express legacy path unchanged.

### Manual Publish Operator Env

| Item | Detail |
|------|--------|
| **Env var** | `GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID` (server-only; documented in `storefront/.env.example`) |
| **When required** | Only when operators want manual storefront **active** save to upsert `catalogos.supplier_offers` and populate `product_best_offer_price` for price filter/sort parity |
| **When missing** | Manual active publish still works after `evaluateActivePublishReadiness`; snapshot + sellable upsert still run; supplier offer step skips with `supplier_id_unconfigured` (no fabricated supplier) |
| **Not for URL import** | URL-import products must publish via CatalogOS review → `runPublish`; storefront active save remains blocked for URL-import metadata |
| **Does not enable** | Checkout, payment, inventory/stock exposure |

#### Expected side effects when env is set

After a **manual non-URL** product passes readiness and saves **active** (`product-write.ts` → `runManualPostActiveSideEffects`):

| Check | Expected |
|-------|----------|
| `catalog_v2.catalog_products.status` | `active` |
| `catalog_v2.catalog_products.metadata.facet_attributes` | JSON object rebuilt from `catalogos.product_attributes` |
| `catalogos.supplier_offers` | Row for `(supplier_id, product_id, supplier_sku)` when case price + SKU present |
| `product_best_offer_price` | Row with `best_price` when offer upsert succeeded |
| `gc_commerce.sellable_products` | Upsert attempted from case price (non-blocking) |
| Draft save | **No** post-active helper; no supplier offer row |

#### Manual active publish smoke checklist

**Prerequisites**

- [ ] `storefront/.env.local`: `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_URL` alias) configured
- [ ] `GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID` set to a **valid** `catalogos.suppliers.id` UUID for the environment
- [ ] Storefront dev server: `cd storefront && npm run dev`
- [ ] Manual test product fields ready: name, brand, category, primary image, ≥1 variant + SKU, `units_per_case`, case price, required category attributes

**Steps**

| # | Step | Pass criteria |
|---|------|---------------|
| 1 | Create or edit a **non-URL** manual product in `/admin/products/new` or edit | Editor loads; no URL-import metadata on product |
| 2 | Save as **draft** | `status = draft`; no new `supplier_offers` row for product (query by `product_id`) |
| 3 | Set status **active** and save | Readiness passes; no error toast |
| 4 | Confirm DB: product active | `catalog_v2.catalog_products.status = 'active'` |
| 5 | Confirm DB: facet snapshot | `metadata.facet_attributes` is non-null object matching filter attrs |
| 6 | Confirm DB: supplier offer (env set) | `catalogos.supplier_offers` row exists; `product_best_offer_price.best_price` > 0 |
| 7 | Storefront listing | Product appears at `/store` (default sort); no stock/inventory columns |
| 8 | PDP | `/store/p/:slug` renders; case price from `metadata.commerce_packaging` |
| 9 | Price filter/sort (optional) | With offer row, product included in price-range filter and price sort |
| 10 | Quote cart | Add to quote works; copy mentions quote/review, not checkout/payment |
| 11 | URL-import negative | Product with `import_staging_id` / CatalogOS URL metadata cannot save active from storefront editor |

**Smoke result (2026-06-15):** **PASS** — see **Manual Active Publish Smoke Result** below.

### Manual Active Publish Smoke Result

**Status:** **PASS** (2026-06-15 — operator env + browser smoke; price filter/sort fix confirmed via rerun)

**Caveat:** Admin editor browser UI still requires authenticated Supabase admin session for a full click-through edit-form pass. Core publish/store/PDP/quote/filter path is verified (server read model + Playwright).

#### Env / config (names only)

| Variable | Configured in `storefront/.env.local` |
|----------|--------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID` | **Yes** — GloveCubs Legacy Catalog (`a0000001…0001`) |

#### Supplier UUID validation

| Check | Result |
|-------|--------|
| Env supplier configured | Yes |
| Env supplier exists in `catalogos.suppliers` | Pass — `GloveCubs Legacy Catalog`, active |
| Supplier offer upsert without script override | Pass |

#### Product tested (smoke / QA data — kept)

| Field | Value |
|-------|-------|
| Product ID | `74d94e44-04d0-4a32-a1b1-d4c12d8c3dad` |
| Slug / PDP | `/store/p/manual-smoke-smk-19c0a6` |
| Admin edit path | `/admin/products/74d94e44-04d0-4a32-a1b1-d4c12d8c3dad/edit` |
| Parent SKU | `SMK-19C0A6` |
| Flow | Programmatic draft → active via `product-write.ts` (no `runPublish`) |
| Readiness | `evaluateActivePublishReadiness` → null (pass) |

#### DB side effects verified (env set, no script override)

| Check | Result |
|-------|--------|
| Draft save — no `supplier_offers` | Pass |
| `status = active` | Pass |
| `metadata.facet_attributes` | Pass |
| `catalogos.supplier_offers` | Pass (1 row) |
| `catalogos.product_best_offer_price` | Pass (`best_price = 49.99`, `offer_count = 1`) |
| `gc_commerce.sellable_products` | Pass (`list_price_minor = 4999`) |

#### Browser / admin result

| Check | Result |
|-------|--------|
| Admin editor browser (authenticated UI) | **Not verified in browser** — redirects to `/login` (Supabase session required) |
| Admin server read model (`fetchAdminProductDetail`) | Pass — editor payload loads, `status = active`, no URL-import block |
| Required fields / no URL-import blocker (manual product) | Pass (server read model) |

#### Storefront / PDP / quote cart

| Check | Result |
|-------|--------|
| `/store` listing includes smoke product | Pass (Playwright) |
| PDP HTTP 200 | Pass |
| Case price `$49.99` | Pass |
| Quote CTA on PDP | Pass |
| Add to quote click → quote cart line | Pass (`localStorage` `glovecubs-quote-cart-v1`, 1 line) |
| Quote cart copy | Pass — “Request pricing… **not a checkout**”; no self-serve payment CTA |
| Checkout / payment on PDP | Pass — absent |
| Stock / inventory | Pass — absent on PDP and quote cart |

#### Price filter / sort result

| Check | Result (pre-fix) | Result (post-fix) |
|-------|------------------|-------------------|
| URL exercised | `/store?price_min=40&price_max=55&sort=price_asc` | Same |
| Smoke product in filtered HTML | **Fail** | **Pass** (Playwright rerun) |
| `fetchStoreCatalogPage` with same params | **Fail** — 0 products | **Pass** — `serverCatalogTotal = 1`, `smokeBestPrice = 49.99` |
| Root cause | Listing queried `public.product_best_offer_price` (empty) | Fixed — uses `catalogos.product_best_offer_price` via `catalogBestOfferPriceQuery` |
| DB best-price row | Pass | Pass |

### Price Filter / Sort Fix Status

**Date:** 2026-06-15

#### Root cause

Storefront listing read model (`store-products.ts`, `store-product-detail.ts`) queried `supabase.from("product_best_offer_price")` (implicit **public** schema). The canonical view is `catalogos.product_best_offer_price` (migration `20260403000001_catalog_product_best_price_view.sql`). Manual active publish writes offers into `catalogos.supplier_offers`, which feeds the catalogos view — but filter/sort never saw those rows.

#### Fix applied

- Added `catalogBestOfferPriceQuery()` in `storefront/src/lib/catalog/store-best-offer-price-query.ts`
- Updated all listing filter/sort/hydration paths in `store-products.ts` and PDP best-price read in `store-product-detail.ts` to use `catalogos.product_best_offer_price`
- Display fallback unchanged: `commerceDisplayFromProductMetadata` still supplies case price when offer row absent

#### Test coverage

- `storefront/src/lib/catalog/store-products-price-filter.test.ts` — query helper + policy tests (no public-schema reads; commerce metadata fallback preserved)

#### Smoke product price filter/sort (post-fix)

| Check | Result |
|-------|--------|
| `fetchStoreCatalogPage` `price_min=40` `price_max=55` `sort=price_asc` | **Pass** — smoke product included, `bestPrice = 49.99` |
| Filtered `/store` HTML | **Pass** — smoke product visible |
| Source | `catalogos.product_best_offer_price` via `catalogBestOfferPriceQuery` |

#### Remaining limitation

Products **without** a `catalogos.product_best_offer_price` row are omitted from price filter/sort (by design — filter uses offer view). They may still appear on default sort and show case price from `metadata.commerce_packaging` on PDP/listing cards.

#### URL-import negative smoke

| Check | Result |
|-------|--------|
| Sample product | GrizzlyNite XL draft (`ac5dedb3…fbd5`) |
| Storefront active blocked | Pass |
| Error copy | `"URL-import products cannot be published from storefront. Complete CatalogOS review and publish."` |
| `shouldRunManualPostActiveSideEffects` | Pass — false |
| Active status written | Pass — remained `draft` |

#### Cleanup status

Smoke product **kept** as labeled QA data (`manual-smoke-smk-19c0a6` / `SMK-19C0A6`). Delete when no longer needed:

```bash
cd storefront
npx tsx scripts/manual-active-publish-smoke.ts --cleanup-slug=manual-smoke-smk-19c0a6
```

#### Remaining caveats (non-blocking)

1. **Admin editor browser pass** — requires authenticated Supabase admin session for full UI verification (server read model verified; admin URL redirects to `/login` as expected).

#### Operator rerun commands

```bash
cd storefront
npm run dev
npx tsx scripts/manual-active-publish-browser.ts manual-smoke-smk-19c0a6
```

**Latest browser rerun (2026-06-15):** all checks pass — `/store` listing, PDP `$49.99`, quote cart (1 line, quote/review copy, no checkout/payment), price filter/sort (`serverCatalogTotal = 1`), URL-import negative blocked.

---

## Launch Readiness Closeout

**Date:** 2026-06-15  
**Purpose:** Final quote-first B2B launch readiness snapshot — what is verified, what is flag-gated, what is intentionally deferred, and what ops must complete before production portal flags.

### Launch recommendation

**QUOTE-FIRST B2B LAUNCH: GO** for storefront catalog/PDP/quote cart, manual non-URL admin publish (with server readiness + post-active helper), and URL-import live publish via CatalogOS review — **after ops review of this closeout**.

**NO-GO** for enabling production buyer portal flags until [Production Buyer Portal Flag Enablement Sign-Off](#production-buyer-portal-flag-enablement-sign-off) checklist is completed, Production Supabase runtime is configured, flags are enabled with redeploy, and post-enable smoke passes. **Current production decision (2026-06-15): `PRODUCTION NO-GO`.**

**Not in scope for this launch:** card checkout, self-serve payment, customer-facing inventory/stock, full elimination of split-brain ingest or dual publish paths.

### Final status table

| Area | Status | Evidence | Remaining Action |
| ---- | ------ | -------- | ---------------- |
| **Storefront build** | **PASS** | `cd storefront && npm run build` — verified 2026-06-15 | None for quote-first launch |
| **Root CI** | **PASS** | `npm test` — 257 pass / 0 fail / 1 skipped — verified 2026-06-15 | Keep root inventory authority check in CI |
| **Storefront tests** | **PASS** | `765/765` Vitest — verified 2026-06-15 | None |
| **CatalogOS tests** | **PASS** (default suite) | `696 passed`, `5 skipped` integration — verified 2026-06-15 | Live-DB integration tests remain opt-in (see [CatalogOS Env-Dependent Test Cleanup](#catalogos-env-dependent-test-cleanup)) |
| **Manual product publish** | **PASS** | [Manual Active Publish Smoke Result](#manual-active-publish-smoke-result) — browser + server read model | Optional authenticated admin editor UI click-through |
| **URL import product publish** | **PASS** (CatalogOS canonical) | CatalogOS `runPublish` + publish-guards; storefront active publish blocked for URL-import metadata — [Publish Authority](#publish-authority--dual-admin-path-audit) | Operator runbook: URL products → CatalogOS review/publish only |
| **Product ingest authority** | **Contained** | `product-ingest-authority.policy.test.ts` (catalogos + storefront); [Product Ingest Authority / Split-Brain Containment](#product-ingest-authority--split-brain-containment) | Do not add new non-CatalogOS URL parsers |
| **Clipboard URL import** | **Contained** | CatalogOS-first extract + draft-only promote fallback; bridge CTA when job metadata present | Retire clipboard local-parser as default (deferred) |
| **CatalogOS bridge/review handoff** | **Ready** | Bridge contract + `ProductSetupContractV1`; review wizard + staged publish | Ops: bulk URL → bridge → CatalogOS review |
| **Storefront review queue handoff** | **Contained** | URL-import rows redirect to CatalogOS; unified promote blocked for URL lineage — [Storefront Review Queue CatalogOS Handoff Status](#storefront-review-queue-catalogos-handoff-status-2026-06-15) | Deep links to CatalogOS wizard (deferred) |
| **Buyer portal order history** | **Staging-ready / prod OFF** | Local **STAGING PASS**; Vercel **PREVIEW PASS**; Production smoke **NOT RUN** (env + sign-off pending) | Ops: Production Supabase vars + sign-off + smoke |
| **Reorder-to-quote** | **Staging-ready / prod OFF** | Same as order history | Same as order history flags |
| **Production portal flags** | **OFF — PRODUCTION NO-GO** | Vercel Production: 0 env vars; ops sign-off not recorded — [Production portal smoke result (2026-06-15)](#production-portal-smoke-result-2026-06-15) | Complete checklist → enable flags → redeploy → smoke |
| **Price filter/sort** | **PASS** | Manual smoke: `serverCatalogTotal = 1` with `catalogos.product_best_offer_price` — [Manual Active Publish Smoke Result](#manual-active-publish-smoke-result) | Monitor after manual publishes |
| **Quote cart** | **Launch-ready** | `/quote-cart` → quote request; no card checkout on Next | Honest copy: quote-first, not instant purchase |
| **Checkout/payment** | **Intentionally off** | Next storefront does not expose card checkout; Express Stripe path transitional/frozen | Defer self-serve commerce |
| **Inventory/stock exposure** | **Not exposed (customer)** | Customer PDP/store/portal do not show stock counts; root CI guards parent inventory usage | Admin inventory remains internal-only |
| **Express legacy routes** | **Transitional / frozen** | `server.js` route freeze; production redirects legacy SPA to Next | No new Express routes; drain admin JSON to Next BFF over time |
| **Live DB integration tests** | **Opt-in only** | 5 skipped without Supabase env / `RUN_CATALOG_SELLABLE_GUARD=1` — [CatalogOS Env-Dependent Test Cleanup](#catalogos-env-dependent-test-cleanup) | Run before major DB migration releases |

### Safe to launch now

- Storefront quote-first catalog, PDP, and quote cart (no checkout/payment)
- Manual **non-URL** product publish with server readiness mirror + post-active helper (offers/snapshot/sellable where configured)
- URL-import live publish exclusively through CatalogOS review → `runPublish`
- CatalogOS-first clipboard URL import with draft-only storefront promote fallback
- Price filter/sort for products with rows in `catalogos.product_best_offer_price`
- Buyer portal order history + reorder-to-quote **code** — verified in local staging and Vercel Preview **with flags on**; safe to ship codebase with production flags **off**

### Do not enable yet

Until production sign-off is recorded:

- **`FEATURE_GC_ORDER_HISTORY`** on Vercel Production
- **`FEATURE_GC_REORDER_TO_QUOTE`** on Vercel Production

**Prerequisites (all required):**

1. Production Supabase runtime vars configured on Vercel Production (not Preview-only)
2. Production buyer/company/order ACL data verified for smoke accounts
3. Production portal smoke passes (account hub, orders list, order detail, ACL denial, reorder → quote cart — no checkout/inventory)
4. Ops sign-off recorded in [Production Buyer Portal Flag Enablement Sign-Off](#production-buyer-portal-flag-enablement-sign-off) (`PRODUCTION GO` or `PRODUCTION PARTIAL`)

### Intentionally deferred

- Full elimination of clipboard fallback parser (`productExtraction.ts`)
- Full elimination of Express legacy parse/save product routes
- Single publish engine for all manual products (shared wrapper vs `runPublish` — optional future)
- CatalogOS staged row / wizard deep links from storefront review queue
- Password-login portal smoke path (magic-link operator smoke used instead)
- Live DB CatalogOS integration tests in default CI (`npm test` without env)
- Admin product editor full browser click-through with authenticated admin session (server read model verified)

### Operational runbook pointers

| Topic | Section in this doc |
| ----- | ------------------- |
| Production portal flag enablement | [Production Environment Completion Checklist](#production-environment-completion-checklist) → [Production Buyer Portal Flag Enablement Sign-Off](#production-buyer-portal-flag-enablement-sign-off) |
| Manual publish browser smoke | [Manual Active Publish Smoke Result](#manual-active-publish-smoke-result) |
| CatalogOS test env / integration opt-in | [CatalogOS Env-Dependent Test Cleanup](#catalogos-env-dependent-test-cleanup) |
| URL ingest authority / split-brain containment | [Product Ingest Authority / Split-Brain Containment](#product-ingest-authority--split-brain-containment) |
| Dual publish paths / URL-import blocks | [Publish Authority / Dual Admin Path Audit](#publish-authority--dual-admin-path-audit) |
| Staging / Preview portal smoke evidence | [Staging Verification Status](#staging-verification-status) |

### Production portal decision (2026-06-15)

| Decision | Status |
| -------- | ------ |
| **QUOTE-FIRST B2B (catalog/admin code)** | **GO** after ops review |
| **Production buyer portal flags** | **`PRODUCTION NO-GO`** — prerequisite gate blocked; Production env empty; ops sign-off not recorded |
| **Production portal smoke (flags on)** | **NOT RUN** (gate blocked 2026-06-15 re-audit) |
| **ACL / reorder / quote cart on Production** | **NOT VERIFIED** |
| **Rollback readiness** | **Valid** — flags off; documented rollback plan unchanged |

### Closeout verification (latest prerequisite gate — smoke not run)

| Command | Result |
| ------- | ------ |
| `vercel env ls production` | **0** vars — all 6 required names **missing** |
| Production portal smoke | **NOT RUN** (gate blocked) |
| `npm test` (root) | **PASS** — 257 pass, 0 fail, 1 skipped |
| `cd storefront && npm test` | **PASS** — 765/765 |
| `cd storefront && npm run build` | **PASS** |
| `cd catalogos && npm test` | **PASS** — 696 passed, 5 skipped |

### Final remaining blockers (non-launch-blocking for quote-first)

1. **Split-brain product ingest** — contained via CatalogOS-first policy and handoffs; not fully eliminated
2. **Dual publish/admin paths** — URL-import blocked on storefront; manual path intentional with documented side-effect gaps; Express legacy unguarded but frozen
3. **Production buyer portal flags** — **`PRODUCTION NO-GO`** — Production Supabase runtime not configured; ops sign-off not recorded; production portal smoke (flags on) not run

---

## Fresh Productionization Re-Audit

**Date:** 2026-06-15  
**Type:** Closeout re-audit from current repo state — confirms prior hardening; does not re-open resolved blockers.

### Executive Decision

**QUOTE-FIRST LAUNCH GO** with buyer portal **Production flags OFF**.

| Surface | Decision |
| ------- | -------- |
| Quote-first B2B (catalog, PDP, quote cart, manual publish, CatalogOS URL publish) | **GO** |
| Production buyer portal order history + reorder-to-quote | **`PRODUCTION NO-GO`** until [Production Environment Completion Checklist](#production-environment-completion-checklist) is complete |

No contradiction found with prior Launch Readiness Closeout. Production portal smoke was **not re-run** (Production Vercel env still empty — recorded once below).

### Evidence Summary

| Check | Result | Notes |
| ----- | ------ | ----- |
| `npm test` (root) | **PASS** | 257 pass, 0 fail, 1 skipped |
| `cd storefront && npm test` | **PASS** | 765/765 |
| `cd storefront && npm run build` | **PASS** | 2026-06-15 re-audit |
| `cd catalogos && npm test` | **PASS** | 696 passed, 5 integration skipped |
| Manual Active Publish Smoke | **PASS** | [Manual Active Publish Smoke Result](#manual-active-publish-smoke-result) |
| Buyer portal local smoke | **STAGING PASS** | [Staging Verification Status](#staging-verification-status) |
| Buyer portal Vercel Preview smoke | **PREVIEW PASS** | Preview env + flags configured |
| Production portal smoke | **NOT RUN** | Production Vercel: **0** env vars; ops sign-off not recorded |
| CatalogOS env-dependent unit tests | **PASS** | Admin client mocks; 5 live-DB tests opt-in skipped |

### Remaining Launch Blockers

#### Blocks quote-first launch

**None identified.** All default test/build suites pass; smoke evidence for catalog/publish/portal code paths is current.

#### Blocks production buyer portal flags

1. Production Supabase runtime vars not set on Vercel Production (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
2. Portal flags not set on Production (`FEATURE_GC_ORDER_HISTORY`, `FEATURE_GC_REORDER_TO_QUOTE`)
3. Ops sign-off not recorded; smoke data + ACL test not confirmed on Production
4. Production redeploy after env/flags not completed
5. Production portal smoke (flags on) not run

#### Does not block launch / intentionally deferred

- Split-brain ingest (CatalogOS-first; clipboard fallback documented)
- Dual publish paths (URL-import blocked on storefront; manual path intentional)
- Express legacy routes (frozen)
- Full elimination of clipboard fallback parser
- Single publish engine for all manual products
- Live DB CatalogOS integration tests in default CI
- Admin editor authenticated browser click-through (server read model verified)
- Production buyer portal on live hostname until ops checklist complete

#### Repo hygiene (not a functional launch blocker)

- **~357** paths in `git status --short` (modified + untracked) — large uncommitted productionization WIP (CatalogOS extraction/publish, storefront admin/portal, smoke scripts, audit docs, `vercel.json`, shared `lib/commerce-packaging`). Recommend ops commit/tag before production deploy; tests pass on working tree.
- `storefront/.env.local` — **gitignored** (`.env*.local`); not committed.
- Generated artifacts (`.next/`, `node_modules/`, `tsbuildinfo`) — should remain uncommitted per `.gitignore`.

### Backend Capability vs Frontend UX Matrix

| Capability | Backend | Frontend | Connected | Tested | Production Status | Notes |
| ---------- | ------: | -------: | --------: | -----: | ----------------- | ----- |
| Storefront catalog | ✅ `store-products.ts` | ✅ `/store` | ✅ | ✅ | **Launch-ready** | No inventory on cards; `no-fake-doctrine.test.ts` |
| PDP | ✅ `store-product-detail.ts` | ✅ `/store/p/:slug` | ✅ | ✅ | **Launch-ready** | Case/pallet commerce metadata |
| Price filter/sort | ✅ `catalogos.product_best_offer_price` via `store-best-offer-price-query.ts` | ✅ `/store` facets | ✅ | ✅ | **Launch-ready** | Policy test blocks bare `public.product_best_offer_price` |
| Quote cart | ✅ quote APIs | ✅ `/quote-cart` | ✅ | ✅ | **Launch-ready** | Copy: quote/review, not checkout |
| Checkout/payment | Express transitional | ❌ not on Next | N/A | Partial | **Off** | Quote-first by design |
| Manual product create/edit | ✅ `product-write.ts` | ✅ `/admin/products/*` | ✅ | ✅ | **Launch-ready** | Draft unaffected |
| Manual active publish | ✅ `evaluateActivePublishReadiness` + post-active helper | ✅ editor | ✅ | ✅ | **Launch-ready** | Smoke PASS; `GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID` in `.env.example` |
| URL import (canonical) | ✅ CatalogOS V2 + contract | ✅ CatalogOS + proxy | ✅ | ✅ | **Launch-ready** | `ProductUrlExtractionV2`, `ProductSetupContractV1` policy-locked |
| CatalogOS bridge/review | ✅ `bridge.ts` | ✅ dashboard review | ✅ | ✅ | **Launch-ready** | No auto-publish from bridge |
| CatalogOS publish | ✅ `runPublish` + guards | ✅ review actions | ✅ | ✅ | **Launch-ready** | URL-import canonical live path |
| Clipboard URL import | ✅ CatalogOS-first + fallback | ✅ clipboard staging | Partial | ✅ | **Contained** | Fallback `productExtraction.ts` only when CatalogOS unavailable |
| Clipboard promote | ✅ draft-only | ✅ promote route | ✅ | ✅ | **Launch-ready** | Policy: no active from clipboard |
| Storefront review queue | ✅ handoff banners | ✅ `/admin/products/review` | Partial | ✅ | **Contained** | URL-import rows → CatalogOS; no storefront active publish |
| Customer login/account | ✅ Supabase | ✅ `/login`, `/account` | ✅ | Partial | **Launch-ready** | Quotes, addresses, quicklist live |
| Order history | ✅ `gc_commerce.orders` | ✅ `/account/orders` | ✅ | ✅ | **Flag-gated** | STAGING/PREVIEW PASS; Production **OFF** |
| Order detail | ✅ company-scoped read | ✅ `/account/orders/[id]` | ✅ | ✅ | **Flag-gated** | Read-only; no checkout CTA |
| Reorder-to-quote | ✅ quote cart API | ✅ order detail CTA | ✅ | ✅ | **Flag-gated** | Writes quote cart only; policy tests |
| Company ACL | ✅ `assertCustomerCompanyAccess` | ✅ order routes | ✅ | ✅ | **Flag-gated** | Preview/staging ACL smoke PASS |
| Production portal flags | ✅ env helpers | ✅ gated UI | ✅ | ✅ | **`PRODUCTION NO-GO`** | 0 Production Vercel vars |
| Express legacy routes | ✅ `server.js` frozen | Legacy SPA redirected | Transitional | Partial | **Frozen** | No new Next `src/` parse-url callers |
| Live DB integration tests | ✅ CatalogOS | N/A | N/A | Opt-in | **Skipped default CI** | 5 tests; requires Supabase env |

### Split-Brain / Drift Status

| Risk | Current status | Containment | Deferred | Launch impact |
| ---- | -------------- | ----------- | -------- | ------------- |
| **Product ingest** (CatalogOS V2 vs clipboard vs Express) | **Contained** | CatalogOS-first clipboard; bulk URL → CatalogOS; policy tests on authority + proxy routes | Retire clipboard fallback; retire Express parser | **Low** if operators follow runbook |
| **Publish/admin paths** | **Contained** | URL-import active blocked (`isUrlImportProductMetadata`); CatalogOS `runPublish` for URL; manual active with server readiness + post-active helper; no `runPublish` in `product-write` | Shared manual publish wrapper; Express unguarded path | **Low** for quote-first if URL products use CatalogOS publish |
| **Express legacy** | **Frozen** | Route freeze; production redirect to Next; no `parse-product-url` in storefront `src/` | Drain admin JSON to Next BFF | **Low** for Next storefront launch |
| **Pricing authority** | **Aligned** | `store-best-offer-price-query.ts` → `catalogos.product_best_offer_price`; filter/sort smoke PASS | Monitor after manual publishes | **None** |
| **Variants/SKU** (X/XL, manufacturer SKU) | **Protected** | Policy tests + normalization guards; no internal GLV replacement in publish path | — | **None** |

**Drift check result:** No new regressions found in policy tests or price-filter guard since prior closeout.

### Production Ops Gate

**Single check (2026-06-15):** `vercel env ls production` → **0 variables**.

| Required before Production portal GO | Status |
| ------------------------------------ | ------ |
| `NEXT_PUBLIC_SUPABASE_URL` | Missing |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Missing |
| `SUPABASE_URL` | Missing |
| `SUPABASE_SERVICE_ROLE_KEY` | Missing |
| `FEATURE_GC_ORDER_HISTORY=1` (after approval) | Missing |
| `FEATURE_GC_REORDER_TO_QUOTE=1` (after approval) | Missing |
| Ops sign-off + smoke data + ACL confirmation | Missing |
| Production redeploy | Missing |
| Production portal smoke | **NOT RUN** |

**Portal decision:** **`PRODUCTION NO-GO`**. **Quote-first launch:** **GO** with flags **OFF**.

Complete [Production Environment Completion Checklist](#production-environment-completion-checklist) before re-attempting smoke.

### Safe-to-Launch Scope

- Storefront `/store`, PDP, `/quote-cart` (quote/review copy; no checkout/payment)
- Manual **non-URL** product active publish (readiness + post-active side effects)
- URL-import live publish via CatalogOS review → `runPublish`
- CatalogOS-first clipboard URL import with draft-only promote fallback
- Price filter/sort via `catalogos.product_best_offer_price`
- Buyer account: quotes, addresses, quicklist, pricing tier (without order history flags on Production)

### Do-Not-Enable Scope

- Production `FEATURE_GC_ORDER_HISTORY` until ops checklist + smoke pass
- Production `FEATURE_GC_REORDER_TO_QUOTE` until ops checklist + smoke pass
- Card checkout / self-serve payment on Next storefront
- Customer-facing inventory/stock displays
- Storefront active publish for URL-import metadata
- Enabling Production portal flags without recorded sign-off

### Deferred Work

- Eliminate clipboard `productExtraction.ts` fallback as default
- Eliminate Express legacy product parse/save routes
- Single publish engine for all manual products
- CatalogOS wizard deep links from storefront review queue
- Live DB integration tests in default CI
- Production portal smoke until ops completes checklist
- Commit/tag large uncommitted productionization WIP for reproducible deploys

### Security / Privacy / Customer-Safety (spot check)

| Check | Status |
| ----- | ------ |
| No inventory/stock on catalog/PDP/quote cart/account order surfaces | ✅ Policy + code scan |
| Quote cart anti-checkout copy | ✅ `quote-cart/page.tsx` + `no-fake-doctrine.test.ts` |
| Company-scoped order reads | ✅ `reorder-to-quote.policy.test.ts`, buyer read model |
| Reorder writes quote cart only | ✅ Policy: no order insert/update in reorder path |
| Secrets not in committed files | ✅ `.env.local` gitignored; smoke scripts redact |
| Vercel bypass in smoke script | ✅ Resolves via `vercel curl`; not printed in report JSON |
| Service role server/operator only | ✅ Smoke uses local `.env.local`; not Production-exposed |
| Production portal flags | ✅ **OFF** on Vercel Production |

---

## Release Hygiene / Commit Readiness

**Date:** 2026-06-16  
**Purpose:** Classify working-tree changes before quote-first launch commit/tag. Documentation + git hygiene only — no product behavior changes.

### Git status summary

| Metric | Count |
| ------ | ----: |
| Total paths in `git status --short` | **355** (was 357; `storefront/tmp-*` now gitignored) |
| Modified / deleted (`M`, `D`) | **~102** |
| Untracked (`??`) | **~253** |

**Functional launch status:** Tests/builds pass on current tree. **Deploy reproducibility:** **At risk** until WIP is committed or tagged — Production deploy from a clean checkout would omit productionization hardening.

**Secrets spot-check (names/risk only — no values printed):**

| Path / pattern | In `git status`? | Risk |
| -------------- | ---------------- | ---- |
| `storefront/.env.local` | **No** (gitignored via `.env*.local`) | Low |
| `.env` / `.env.*` (except `.env.example`) | **No** | Low |
| Supabase service-role / anon keys in tracked files | **Not observed in status** | Low — still run secret scan before push |
| `vercel` token files | **No** (`.vercel` gitignored) | Low |
| `node_modules/`, `**/.next/` | **No** | Low |
| `database_backup.json` | **`D` (deleted)** | Review — was tracked; deletion aligns with `.gitignore` |
| `storefront/tmp-hospeco-live.html` | **Hidden** (gitignored via `storefront/tmp-*`) | Low — do not force-add |
| `storefront/tmp-tw-out.css` | **Hidden** (gitignored via `storefront/tmp-*`) | Low — do not force-add |
| `catalogos/tsconfig.tsbuildinfo` | **`M` modified (still tracked)** | **Do not commit** — run untrack step below |

### Commit Staging Plan

**Hygiene applied (2026-06-16):** Minimal `.gitignore` patch only — no product behavior changes, no staging, no commits.

#### `.gitignore` changes applied

| Change | Before | After |
| ------ | ------ | ----- |
| TypeScript build info | `storefront/tsconfig.tsbuildinfo` only | `**/*.tsbuildinfo` |
| Storefront scratch files | *(none)* | `storefront/tmp-*` |
| Playwright / coverage artifacts | *(none)* | `test-results/`, `playwright-report/`, `coverage/` |
| Duplicate entries | `.vercel` / `.env*.local` listed twice (lines 28–32) | Deduped to single block |

**Tracked build artifact — human step required before commit:**

`catalogos/tsconfig.tsbuildinfo` is **still tracked** (shows as `M`). Gitignore alone does not untrack it. Safe untrack (does not delete local file):

```bash
git rm --cached catalogos/tsconfig.tsbuildinfo
```

Include that change in **Commit 5 — Config / deploy support** (or a dedicated hygiene commit).

#### Files still requiring human decision

| Item | Recommendation |
| ---- | -------------- |
| `.cursor/commands/design.md` | Omit from launch commit unless team standardizes Cursor commands in repo |
| `database_backup.json` (**`D`**) | **Commit deletion** — aligns with `.gitignore`; confirm in commit message |
| Large binary image diffs (`public/images/*`, procurement PNGs, `growl-gloves.png`) | Confirm intentional brand/asset updates before staging |
| Single squash vs five commits | See grouping below; tag either way |
| Root `scripts/contamination-*` and audit SQL | Default **commit** (operator tooling aligned with governance docs) |

#### Proposed commit groups

Stage manually per group; verify with `git diff --cached --name-only` before each commit.

**Commit 1 — Productionization core hardening**

```text
catalogos/src/lib/product-extraction/**
catalogos/src/lib/publish/**
catalogos/src/lib/review/**
catalogos/src/lib/url-import/**
catalogos/src/lib/normalization/**
catalogos/src/lib/sku-intelligence/**
catalogos/src/lib/ingestion/**
catalogos/src/lib/catalogos/**
catalogos/src/lib/db/**
catalogos/src/lib/variant-family/**
catalogos/src/app/actions/review*.ts
catalogos/src/app/(dashboard)/dashboard/url-import/**
catalogos/src/components/review/**
catalogos/src/components/quick-add/**
lib/commerce-packaging/**
lib/glove-sku-intelligence/**
lib/admin-identity.js
lib/contamination-heuristics.js
lib/contamination-quarantine.js
lib/inventory.js
lib/products/taxonomy.js
lib/supplier-offer-normalization.ts
lib/storefront-public-redirect.js
supabase/migrations/*.sql
supabase/sql/**
tests/canonical-sync-publish-guard.test.js
tests/commerce-packaging-phase2e.test.js
tests/contamination-heuristics.test.js
tests/contamination-quarantine.test.js
tests/admin-identity.test.js
```

**Commit 2 — Storefront admin / manual publish hardening**

```text
storefront/src/app/admin/**
storefront/src/app/account/**
storefront/src/app/api/**
storefront/src/app/store/**
storefront/src/app/quote-cart/**
storefront/src/app/workspace/**
storefront/src/app/glove-finder/**
storefront/src/app/industries/**
storefront/src/app/invoice-savings/**
storefront/src/app/request-pricing/**
storefront/src/app/contact/**
storefront/src/app/faq/**
storefront/src/app/login/**
storefront/src/app/order-status/**
storefront/src/app/page.tsx
storefront/src/app/resources/**
storefront/src/components/**
storefront/src/config/**
storefront/src/lib/admin/**
storefront/src/lib/catalog/**
storefront/src/lib/account/**
storefront/src/lib/quote-cart/**
storefront/src/lib/procurement/**
storefront/src/lib/commerce/**
storefront/src/lib/education/**
storefront/src/lib/education-hub/**
storefront/src/lib/layout/**
storefront/src/lib/auth/**
storefront/src/lib/prep-line/**
storefront/src/lib/pricing/**
storefront/public/images/**
server.js
services/usersService.js
public/js/app.js
tests/auth.test.js
tests/guard-scripts-phase-0d.test.js
tests/storefront-public-redirect.test.js
```

**Commit 3 — Portal smoke / operator tooling**

```text
storefront/scripts/manual-active-publish-browser.ts
storefront/scripts/manual-active-publish-smoke.ts
storefront/scripts/portal-smoke-browser.ts
storefront/scripts/portal-smoke-discover.mjs
storefront/scripts/portal-smoke-acl-seed.mjs
storefront/scripts/grant-admin-user-once.mjs
storefront/scripts/local-dev-bootstrap-admin.mjs
catalogos/scripts/**
scripts/audit-admin-identity.js
scripts/audit-admin-identity.sql
scripts/audit-commerce-packaging-coverage.mjs
scripts/audit-stale-product-import-staging.mjs
scripts/backfill-commerce-packaging.mjs
scripts/check-express-freeze.js
scripts/contamination-quarantine-plan.mjs
scripts/contamination-report.mjs
scripts/express-route-freeze-baseline.json
scripts/gen-express-route-baseline.js
scripts/sql/**
scripts/verify-commerce-packaging-migration.mjs
```

**Commit 4 — Audit docs / closeout**

```text
docs/audits/glovecubs-productionization-audit.md
docs/COMMERCE_PACKAGING_QA.md
docs/CONTAMINATION_GOVERNANCE.md
docs/PRODUCT_SETUP_SKU_QA.md
ROUTE_OWNERSHIP.md
```

**Commit 5 — Config / deploy support**

```text
.gitignore
vercel.json
package.json
storefront/package.json
storefront/package-lock.json
storefront/.env.example
storefront/next.config.mjs
storefront/tsconfig.json
storefront/vitest.config.ts
catalogos/package.json
catalogos/next.config.mjs
catalogos/tsconfig.json
catalogos/vitest.config.ts
public/images/**
# After human untrack step:
# catalogos/tsconfig.tsbuildinfo  (via git rm --cached)
# database_backup.json deletion (already staged D)
```

#### Exact do-not-stage list

| Pattern / path | Reason |
| -------------- | ------ |
| `.env`, `.env.*`, `.env*.local` | Secrets / local config |
| `.vercel/` | Deploy tokens |
| `**/node_modules/**`, `**/.next/**` | Dependencies / build output |
| `**/*.tsbuildinfo` | Build artifacts (untrack `catalogos/tsconfig.tsbuildinfo` first) |
| `storefront/tmp-*` | Local scrape/CSS scratch |
| `test-results/`, `playwright-report/`, `coverage/` | Test/coverage output |
| `data/` | Generated Fishbowl exports |
| `database.json`, `contamination-report.json`, etc. | Legacy/generated JSON (see `.gitignore`) |
| `.cursor/commands/**` | IDE-local unless team decides otherwise |
| `supabase/.temp/` | Supabase CLI local artifacts |

#### Secret-scan step (before each commit / before push)

No dedicated repo secret-scanner script was found. Use manual review:

```bash
# After staging a group — review file list
git diff --cached --name-only

# Review full staged diff (watch for keys, tokens, connection strings)
git diff --cached

# Optional: launch readiness checks env *presence* only (does not scan git diff)
node scripts/launch-readiness-audit.js
```

Do **not** stage or commit `.env.local`, service-role keys, JWT secrets, Stripe keys, or Vercel tokens. Reject any staged path matching do-not-stage patterns above.

#### Tag recommendation

After all five commits (or a single squash):

```bash
git tag -a quote-first-launch-candidate-2026-06-16 -m "Quote-first launch candidate; buyer portal Production flags OFF"
```

Alternative single-squash tag: `quote-first-productionization-2026-06-16`.

**Pre-commit checklist (human):**

1. `git status` shows no `.env.local`, no forced `tmp-*`, no new `tsbuildinfo` commits
2. `catalogos/tsconfig.tsbuildinfo` untracked via `git rm --cached` if still `M`
3. Secret scan on each staged group (`git diff --cached --name-only` + `git diff --cached`)
4. `npm test && cd storefront && npm test && npm run build && cd catalogos && npm test`
5. Tag as above; push when ready (not automated in this pass)

### File classification

#### Commit: source code

- **CatalogOS:** `catalogos/src/**` (product-extraction, publish, review, url-import, normalization, sku-intelligence, ingestion) — modified + untracked production modules
- **Storefront:** `storefront/src/**` (catalog, admin, account, quote-cart, components, lib) — large admin/manual-publish/portal surface
- **Shared libs:** `lib/commerce-packaging/**`, `lib/glove-sku-intelligence/**`, `lib/admin-identity.js`, `lib/contamination-*.js`, root `lib/*.js` (inventory, taxonomy, supplier-offer-normalization)
- **Express (transitional):** `server.js`, `services/usersService.js`, `public/js/app.js` (freeze-checked scripts accompany)
- **Supabase:** `supabase/migrations/*.sql`, `supabase/sql/**`
- **Root tests:** `tests/*.test.js` (auth, guard-scripts, contamination, commerce-packaging)

#### Commit: tests

- All `**/*.test.ts`, `**/*.test.tsx`, `**/*.policy.test.ts`, `**/*-smoke.test.ts` under `catalogos/` and `storefront/`
- `catalogos/src/lib/product-ingest-authority.policy.test.ts`, integration tests (opt-in skipped in CI)

#### Commit: docs / audits

- `docs/audits/glovecubs-productionization-audit.md` (this file)
- `docs/COMMERCE_PACKAGING_QA.md`, `docs/CONTAMINATION_GOVERNANCE.md`, `docs/PRODUCT_SETUP_SKU_QA.md`
- `ROUTE_OWNERSHIP.md`

#### Commit: smoke / operator scripts

- `storefront/scripts/manual-active-publish-browser.ts`, `manual-active-publish-smoke.ts`
- `storefront/scripts/portal-smoke-browser.ts`, `portal-smoke-discover.mjs`, `portal-smoke-acl-seed.mjs`
- `catalogos/scripts/**` (QA phase scripts)
- Root `scripts/audit-*`, `scripts/contamination-*`, `scripts/backfill-commerce-packaging.mjs`, `scripts/check-express-freeze.js`, `scripts/gen-express-route-baseline.js`, `scripts/verify-commerce-packaging-migration.mjs`
- `scripts/express-route-freeze-baseline.json`, `scripts/sql/**`

#### Commit: config required for deploy

- `vercel.json` (monorepo storefront build from repo root)
- `package.json` (root, `storefront/`, `catalogos/`)
- `storefront/package-lock.json`
- `storefront/.env.example` (names/comments only — no secrets)
- `storefront/next.config.mjs`, `catalogos/next.config.mjs`
- `storefront/tsconfig.json`, `catalogos/tsconfig.json`, `vitest.config.ts` files
- `storefront/public/images/**`, `public/images/**` (binary assets — commit if intentional brand updates)
- `.gitignore` (if patched for build artifacts — see below)

#### Do not commit: local env

| Pattern | Coverage |
| ------- | -------- |
| `.env*.local` | ✅ `.gitignore` line 29–32 |
| `.env` | ✅ line 10 |
| `.env.*` except `.env.example` | ✅ line 11–13 |

#### Do not commit: generated artifacts

| Pattern | Coverage | Notes |
| ------- | -------- | ----- |
| `**/node_modules/` | ✅ | |
| `**/.next/` | ✅ | |
| `storefront/tsconfig.tsbuildinfo` | ✅ (via `**/*.tsbuildinfo`) | |
| `catalogos/tsconfig.tsbuildinfo` | ✅ ignore rule added; **still tracked** — run `git rm --cached catalogos/tsconfig.tsbuildinfo` |
| Playwright `test-results/`, `playwright-report/` | ✅ | No local artifacts present at audit time |
| Coverage output | ✅ `coverage/` | No local artifacts present at audit time |
| `storefront/tmp-*` | ✅ | Hidden from status after patch |

#### Review before commit

| Item | Recommendation |
| ---- | -------------- |
| `database_backup.json` (**`D`**) | **Commit deletion** — file is listed in `.gitignore`; legacy JSON backup should not return to repo |
| `storefront/tmp-hospeco-live.html`, `storefront/tmp-tw-out.css` | **Gitignored** — do not `git add -f`; safe to delete locally |
| `.cursor/commands/design.md` | **Human decision** — IDE-local; omit from launch commit unless team standardizes Cursor commands in repo |
| Large binary image diffs (`public/images/*`, procurement PNGs) | Confirm intentional brand/asset updates |
| `data/` directory | ✅ Already gitignored — do not force-add exports like `fishbowl-customers.csv` |

#### Unknown / needs human decision

- **Single squash vs multi-commit** (see recommended grouping below)
- Whether to commit `.cursor/commands/**` for team runbooks
- Whether root `scripts/contamination-*` and audit SQL belong in same repo or ops-only fork (default: **commit** — they are operator tooling aligned with governance docs)

### `.gitignore` patch — applied 2026-06-16

See [Commit Staging Plan](#commit-staging-plan) for full detail. Summary:

```gitignore
**/*.tsbuildinfo
storefront/tmp-*
test-results/
playwright-report/
coverage/
```

Duplicate `.vercel` / `.env*.local` entries removed.

### Recommended commit grouping

**Option A — five logical commits (reviewable):**

| Commit | Scope | Representative paths |
| ------ | ----- | -------------------- |
| **1 — Productionization core hardening** | CatalogOS extraction/publish/review + shared packaging/SKU libs + Supabase migrations | `catalogos/src/lib/product-extraction/**`, `catalogos/src/lib/publish/**`, `lib/commerce-packaging/**`, `lib/glove-sku-intelligence/**`, `supabase/migrations/**` |
| **2 — Storefront admin / manual publish hardening** | product-write, clipboard, review queue, catalog read models, price filter | `storefront/src/lib/admin/**`, `storefront/src/lib/catalog/**`, `storefront/src/app/admin/**` |
| **3 — Portal smoke / operator tooling** | Browser smoke + discover/ACL seed + CatalogOS QA scripts | `storefront/scripts/manual-*`, `storefront/scripts/portal-*`, `catalogos/scripts/**`, root `scripts/audit-*` |
| **4 — Audit docs / closeout** | Productionization audit + QA/governance docs | `docs/audits/**`, `docs/*_QA.md`, `docs/CONTAMINATION_GOVERNANCE.md` |
| **5 — Config / deploy support** | Vercel monorepo build + package locks + `.env.example` + `.gitignore` hygiene | `vercel.json`, `package.json`, `storefront/.env.example`, `.gitignore` |

**Option B — single squash commit:** `quote-first-productionization-2026-06-15` — cleaner tag point if review bandwidth is limited.

**Pre-commit checklist (human):**

1. `git status` shows no `.env.local`, no `tmp-*`, no `tsbuildinfo`
2. Secret scan on staged diff (names only review)
3. `npm test && cd storefront && npm test && npm run build && cd catalogos && npm test`
4. Tag: e.g. `quote-first-launch-candidate-2026-06-15`

### Quote-first deploy reproducibility after commit

| Question | Answer |
| -------- | ------ |
| Reproducible from clean checkout after committing classified files? | **Yes** — with `vercel.json` + lockfiles + source |
| Reproducible **today** without commit? | **No** — 357-path WIP not on remote |
| Production buyer portal on live host? | **No** — still **`PRODUCTION NO-GO`**; Production Vercel **0** env vars (unchanged) |
| Quote-first launch decision after commit? | **`QUOTE-FIRST LAUNCH GO`** with portal flags **OFF** |

### Remaining human decisions before deploy

1. **Commit strategy:** five commits vs single squash tag
2. **`database_backup.json` deletion:** confirm intentional in commit message
3. **Untrack** `catalogos/tsconfig.tsbuildinfo` via `git rm --cached` (ignore rule already applied)
4. **`.cursor/commands/**`:** commit or ignore
5. **Production ops:** complete [Production Environment Completion Checklist](#production-environment-completion-checklist) separately (not blocked on code commit)
6. **Vercel Production env:** still empty — portal flags remain off

### Final verification (release hygiene pass — 2026-06-16)

| Command | Result |
| ------- | ------ |
| `npm test` | **PASS** — 257 pass, 0 fail, 1 skipped |
| `cd storefront && npm test` | **PASS** — 765/765 |
| `cd storefront && npm run build` | **PASS** |
| `cd catalogos && npm test` | **PASS** — 696 passed, 5 skipped |

---

## Recommended Next Cursor Prompt

```
Stage Commit 1 (Productionization core hardening) per docs/audits/glovecubs-productionization-audit.md Commit Staging Plan. Run secret scan on staged diff. Do not commit until I confirm.
```

---
