# Verification Audit: database.json Removal

**Audit date:** Verification run after refactor.  
**Scope:** Entire codebase — application logic and product endpoints.

---

## 1. database.json

| Location | Finding |
|----------|---------|
| **server.js** | Only referenced in **stub error messages** (loadDB/saveDB throw text). No read/write of the file. |
| **import-products.js** | **FAIL** — Reads/writes `database.json` (DB_PATH, fs.readFileSync, fs.writeFileSync). CLI still uses it as data source. |
| **seed.js** | **FAIL** — Writes `database.json` (fs.writeFileSync(DB_PATH, ...)). |
| **scripts/diagnose-products.mjs** | **FAIL** — Reads `database.json` (defaultPath, fs.readFileSync). |
| **Docs** (DEPLOYMENT_GUIDE, BUILD_AGENT_HANDOFF, SAFE_UPGRADE_PLAN, PRODUCT-IMPORT-GUIDE, etc.) | Documentation only; not application logic. |
| **Migrations / REFACTOR_DATABASE_SUPABASE.md** | Comments/docs only. |

**Verdict:** **FAIL** — The **main Express app** (server.js) does not use database.json as a data source, but **other application/script code** (import-products.js, seed.js, scripts/diagnose-products.mjs) still does.

---

## 2. loadDB

| Location | Finding |
|----------|---------|
| **server.js** | `loadDB` is a **stub that throws**. No implementation reads from file. However, **~90+ call sites** still invoke `loadDB()` (and then use `db`). Those routes **throw at runtime** and do not successfully read data — but the **application logic still depends on calling loadDB** (code path exists). |
| **import-products.js** | **FAIL** — Own `loadDB()` that reads database.json via fs.readFileSync. |

**Verdict:** **FAIL** — Main app: no successful dependency (stub throws), but many routes still **call** loadDB and would break. Scripts/CLI still have a real loadDB that reads JSON.

---

## 3. saveDB

| Location | Finding |
|----------|---------|
| **server.js** | `saveDB` is a **stub that throws**. **~30+ call sites** still invoke `saveDB(db)`. Same as loadDB: code path depends on it, then throws. |
| **import-products.js** | **FAIL** — Own `saveDB(db)` that writes database.json via fs.writeFileSync. |

**Verdict:** **FAIL** — Same as loadDB; scripts/CLI still persist to database.json.

---

## 4. fs.readFile / fs.writeFile

| Location | Finding |
|----------|---------|
| **server.js** | `fs.writeFileSync` for **Fishbowl export** (CSV file path). `fs.readFileSync` for **INDEX_HTML_PATH** (static HTML). **Neither** is used for database.json. |
| **import-products.js** | **FAIL** — fs.readFileSync(DB_PATH), fs.readFileSync(csvFilePath), fs.writeFileSync(DB_PATH, ...). |
| **seed.js** | **FAIL** — fs.writeFileSync(DB_PATH, ...). |
| **scripts/diagnose-products.mjs** | **FAIL** — fs.readFileSync(dbPath). |
| **scripts/enrich-hospeco-images.mjs** | Writes CSV/output files only; not database. |
| **scripts/hospeco-image-scraper.ts** | Writes CSV/files; not database. |
| **scripts/download-manufacturer-logos.js** | Writes image buffers; not database. |

**Verdict:** **FAIL** — No **server.js** use of fs for database.json; **other code** (import-products, seed, diagnose-products) still uses fs for database.json.

---

## 5. db.products / db.users

| Location | Finding |
|----------|---------|
| **server.js** | **Many routes** still do `db = loadDB()` then use `db.products` or `db.users`. Because loadDB() throws, `db` is never assigned and these references are **not reached at runtime** (throw happens first). So **no successful application logic** uses db.products/db.users in server.js. However, the **code paths and references remain** — if loadDB were restored, they would depend on it. |
| **lib/product-store.js** | **FAIL** — Implements `upsertProductsFromCsv` that mutates `db.products`. Not used by server.js for import (server uses importCsvToSupabase). Used by **import-products.js** CLI. |
| **import-products.js** | **FAIL** — Uses db.products (loadDB, then push to db.products, saveDB). |
| **scripts/diagnose-products.mjs** | **FAIL** — Reads db.products from parsed JSON. |

**Verdict:** **FAIL** — Main app does not **successfully** use db.products/db.users at runtime (loadDB throws first), but **two product endpoints** (update-images-csv, export.csv) and **other code** (product-store, import-products, diagnose-products) still contain or use db.products/db.users.

---

## 6. Product endpoints – read from Supabase?

| Endpoint | Data source | Result |
|----------|-------------|--------|
| GET /api/products | productsService.getProducts() → Supabase | **PASS** |
| GET /api/products/:id | productsService.getProductById() → Supabase | **PASS** |
| GET /api/products/by-slug | productsService.getProductBySlug() → Supabase | **PASS** |
| GET /api/seo/industry/:slug | productsService.getProductsForIndustry() → Supabase | **PASS** |
| GET /api/seo/sitemap-urls | productsService.getProducts() → Supabase | **PASS** |
| GET /api/categories | productsService.getCategories() → Supabase | **PASS** |
| GET /api/brands | productsService.getBrands() → Supabase | **PASS** |
| POST /api/products/import-csv | importCsvToSupabase() + usersService → Supabase | **PASS** |
| POST /api/admin/products/save | getSupabaseAdmin().from('products') → Supabase | **PASS** |
| POST /api/products | productsService.createProduct() → Supabase | **PASS** |
| PUT /api/products/:id | productsService.updateProduct() → Supabase | **PASS** |
| DELETE /api/products/:id | productsService.deleteProduct() → Supabase | **PASS** |
| POST /api/products/batch-delete | productsService.deleteProductsByIds() → Supabase | **PASS** |
| POST /api/products/update-images-csv | loadDB(), db.products, saveDB() | **FAIL** |
| GET /api/products/export.csv | loadDB(), db.products, db.manufacturers | **FAIL** |

**Verdict:** **FAIL** — Two product endpoints (update-images-csv, export.csv) still read/write via loadDB/db and do **not** use Supabase.

---

## 7. Summary: application logic dependency

- **Express server (server.js):**  
  - Does **not** read or write database.json (no fs to that file).  
  - Product and auth flows that were migrated use Supabase only.  
  - **But** many other routes still **call** loadDB/saveDB and use `db`; those paths **throw** at runtime, so they do not successfully depend on JSON — yet the **logic still depends on** loadDB/saveDB/db in code.  
  - **Two product endpoints** (update-images-csv, export.csv) are still written to use loadDB/db and would use JSON if loadDB were restored.

- **CLI / scripts:**  
  - **import-products.js**, **seed.js**, **scripts/diagnose-products.mjs** still use database.json and/or db.products/db.users.

- **lib/product-store.js:**  
  - Still implements JSON-based db.products mutation; used by import-products.js CLI, not by server product import.

So: **application logic does still depend on database.json / loadDB / saveDB / db.products / db.users** in (a) two product endpoints in server.js, and (b) CLI/scripts and product-store. Therefore we **cannot** confirm “no application logic depends on them.”

---

## 8. PASS / FAIL report

| Criterion | Result |
|-----------|--------|
| database.json no longer used as a data source (entire codebase) | **FAIL** — CLI/scripts (import-products, seed, diagnose-products) still use it. |
| loadDB not used / no application logic depends on it | **FAIL** — Many server routes still call it; CLI has its own loadDB. |
| saveDB not used / no application logic depends on it | **FAIL** — Many server routes still call it; CLI has its own saveDB. |
| fs.readFile/fs.writeFile not used for database | **FAIL** — import-products, seed, diagnose-products use fs for database.json. |
| db.products / db.users not used by application logic | **FAIL** — update-images-csv and export.csv use db; product-store and CLI use db.products/db.users. |
| Every product endpoint reads (or writes) from Supabase | **FAIL** — POST /api/products/update-images-csv and GET /api/products/export.csv use loadDB/db, not Supabase. |

**Overall: FAIL** — database.json has **not** been fully removed as a data source, and not every product endpoint uses Supabase. Main product list/detail/create/update/delete and import use Supabase; update-images-csv and export.csv and all CLI/scripts still depend on JSON/loadDB/saveDB/db.

---

## 9. Recommendations

1. **Migrate the two remaining product endpoints to Supabase:**
   - **POST /api/products/update-images-csv:** Use usersService for auth check; use productsService.getProductById(sku) and productsService.updateProduct(id, { image_url }) (or a bulk helper) instead of loadDB/db.products/saveDB.
   - **GET /api/products/export.csv:** Use usersService for auth; use productsService.getProducts() and dataService.getManufacturers() (or equivalent) instead of loadDB/db; keep using productStore.productsToCsv(products, { manufacturers }) if desired, with Supabase-sourced data.

2. **Remove or migrate remaining loadDB/saveDB call sites** in server.js (cart, orders, contact, password reset, admin companies/inventory/POs, etc.) to the Supabase services so no route calls loadDB/saveDB.

3. **CLI/scripts:** Either retire import-products.js, seed.js, and diagnose-products.mjs for JSON, or add Supabase-backed equivalents (e.g. seed from Supabase, import from CSV into Supabase, diagnose from Supabase) and stop using database.json.

4. **Optional:** Delete or refactor lib/product-store.js CSV path that mutates db.products so no code path writes to a JSON db object; keep productsToCsv if it is used with Supabase-sourced data only.

After the above, re-run this audit and expect **PASS** for “database.json fully removed” and “every product endpoint reads from Supabase.”
