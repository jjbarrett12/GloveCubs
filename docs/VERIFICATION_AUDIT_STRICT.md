# Strict Verification Audit: JSON-to-Supabase Migration

**Date:** 2025-03-02  
**Scope:** Entire GloveCubs codebase

---

## Search Results

### loadDB
| Location | Type | Verdict |
|---------|------|--------|
| **server.js** | — | No matches. Removed. |
| **import-products.js** | Own `loadDB()` reads database.json via fs.readFileSync | **Legacy** (CLI only) |
| **docs/** | References in VERIFICATION_AUDIT_DATABASE_JSON.md, REFACTOR_DATABASE_SUPABASE.md, LEGACY_ROUTE_INVENTORY.md, MIGRATION_COMPLETE_VERIFICATION.md | Documentation only |

### saveDB
| Location | Type | Verdict |
|---------|------|--------|
| **server.js** | — | No matches. Removed. |
| **import-products.js** | Own `saveDB(db)` writes database.json via fs.writeFileSync | **Legacy** (CLI only) |
| **docs/** | Documentation references | Documentation only |

### database.json
| Location | Type | Verdict |
|---------|------|--------|
| **server.js** | — | Not read or written. |
| **import-products.js** | `DB_PATH = path.join(__dirname, 'database.json')`; read/write in loadDB/saveDB | **Legacy** (CLI) |
| **seed.js** | `DB_PATH`, fs.writeFileSync(DB_PATH, ...) | **Legacy** (seed script) |
| **scripts/diagnose-products.mjs** | Default path `./database.json`, fs.readFileSync(dbPath) | **Legacy** (script) |
| **docs/, DEPLOYMENT_GUIDE.md, BUILD_AGENT_HANDOFF.md, migrations (comments)** | References only | Documentation/config |

### db. (application logic using a `db` object)
| Location | Type | Verdict |
|---------|------|--------|
| **server.js** | No `db.` references. Pricing uses `getPricingContext()` (Supabase) passed to `getEffectiveMargin(ctx, …)`. | **Clean** |
| **lib/pricing.js** | `getEffectiveMargin(db, …)` expects `{ companies, customer_manufacturer_pricing }`. Called from server with Supabase-sourced context only. | **Clean** (no JSON) |
| **lib/product-store.js** | `upsertProductsFromCsv(db, …)` mutates `db.products`. Used only by **import-products.js** CLI. `productsToCsv(products, { manufacturers })` used by server with Supabase-sourced data. | **Mixed**: server path clean; CLI path legacy |
| **import-products.js** | `db.products` (loadDB, push, saveDB) | **Legacy** (CLI) |
| **scripts/diagnose-products.mjs** | Reads `db.products` from parsed JSON | **Legacy** (script) |
| **docs/** | References in inventory/refactor docs | Documentation only |

### fs.readFile / fs.writeFile
| Location | Purpose | Verdict |
|---------|--------|--------|
| **server.js** | Fishbowl CSV export file write; `index.html` read for static fallback | **PASS** (not app DB) |
| **import-products.js** | database.json read/write; CSV file read | **FAIL** (DB persistence) |
| **seed.js** | database.json write | **FAIL** (DB persistence) |
| **scripts/diagnose-products.mjs** | database.json read | **FAIL** (DB persistence) |
| **scripts/hospeco-image-scraper.ts, enrich-hospeco-images.mjs, download-manufacturer-logos.js** | CSV/output file writes | **PASS** (not app DB) |

---

## Answers to Audit Questions

### 1. Are there any runtime application paths still depending on JSON-based persistence?

**PASS** for the **Express application** (server.js and all routes).

- No route or helper in server.js calls loadDB, saveDB, or reads/writes database.json.
- All route data comes from Supabase via productsService, usersService, companiesService, dataService; pricing uses getPricingContext() from Supabase.

**FAIL** for the **whole repo** if “application” includes CLI/scripts.

- **import-products.js** (CLI): reads/writes database.json.
- **seed.js**: writes database.json.
- **scripts/diagnose-products.mjs**: reads database.json.

**Verdict:** **PASS** for Express server runtime; **FAIL** for repo-wide if CLIs/scripts are in scope.

---

### 2. Are any routes still guaranteed to 500 because they hit legacy stubs?

**PASS** — No.

- loadDB and saveDB have been **removed** from server.js (no stubs, no call sites).
- No route in server.js calls loadDB() or saveDB(); therefore no route can 500 due to “database.json removed” or missing db.

**Verdict:** **PASS**

---

### 3. Are carts, orders, inventory, admin company/customer flows, and support/account flows all Supabase-backed now?

**PASS** for server.js.

- **Carts:** dataService.getCart, dataService.setCart (Supabase).
- **Orders:** dataService.createOrder, getOrdersByUserId, getOrderById, getAllOrdersAdmin, etc. (Supabase).
- **Inventory:** dataService.upsertInventory, productsService; GET/PUT/POST admin inventory use Supabase.
- **Admin company/customer:** companiesService, usersService, dataService (companies, users, overrides, manufacturers) (Supabase).
- **Support/account:** dataService (contact_messages, password_reset_tokens, ship_to_addresses, saved_lists, uploaded_invoices); usersService; RFQs via dataService (Supabase).

**Verdict:** **PASS**

---

### 4. Can loadDB/saveDB be deleted entirely?

- **From server.js:** Already deleted. No loadDB or saveDB in server.js.
- **From entire codebase:** **No** — import-products.js defines and uses its own loadDB() and saveDB() for its CLI. Deleting those would break the CLI unless it is migrated to Supabase or retired.

**Verdict:** **PASS** for Express app (already gone). **FAIL** for full codebase (CLI still uses them).

---

### 5. Is Supabase now the true single source of truth?

- **For the Express server and all HTTP API routes:** **Yes.** All reads and writes for products, users, companies, carts, orders, inventory, manufacturers, purchase orders, contact messages, password reset, ship-to addresses, saved lists, uploaded invoices, RFQs, and pricing context go through Supabase (and services that use Supabase).
- **For the whole repo:** **No.** import-products.js, seed.js, and scripts/diagnose-products.mjs still use database.json. So for “single source of truth” across the entire repo, the answer is no until those are migrated or retired.

**Verdict:** **PASS** for Express application. **FAIL** for repo-wide (CLI/scripts still use database.json).

---

## Summary Table

| Question | Express server.js only | Entire codebase |
|----------|------------------------|------------------|
| 1. Runtime paths depending on JSON? | **PASS** | **FAIL** (import-products, seed, diagnose-products) |
| 2. Routes 500 due to legacy stubs? | **PASS** | **PASS** |
| 3. Carts, orders, inventory, admin, support Supabase-backed? | **PASS** | **PASS** (server only) |
| 4. loadDB/saveDB can be deleted? | **PASS** (already deleted) | **FAIL** (CLI still has them) |
| 5. Supabase single source of truth? | **PASS** | **FAIL** (CLI/scripts use database.json) |

---

## Exact Files for Any Failures (repo-wide)

- **import-products.js** — loadDB(), saveDB(), database.json, fs.readFileSync(DB_PATH), fs.writeFileSync(DB_PATH), db.products.
- **seed.js** — DB_PATH, fs.writeFileSync(DB_PATH, ...).
- **scripts/diagnose-products.mjs** — database.json path, fs.readFileSync(dbPath), db.products.
- **lib/product-store.js** — upsertProductsFromCsv mutates db.products; only used by import-products.js CLI (not by server).

No routes in server.js are in the failure set; all failures are in CLI/standalone scripts.

---

## Recommendation

- **Production Express app:** Migration is complete. No route depends on JSON; no stub-induced 500s; Supabase is the single source of truth for the API.
- **Full codebase:** To make “single source of truth” and “no loadDB/saveDB” true everywhere, either:
  - Migrate import-products.js, seed.js, and diagnose-products.mjs to Supabase (or to reading/writing only Supabase-sourced data), or
  - Retire or document them as legacy tools that still use database.json by design.
