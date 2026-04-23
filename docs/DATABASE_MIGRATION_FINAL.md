# GloveCubs Database Migration — Final

**Supabase is the only source of truth.** No JSON database; no loadDB/saveDB; no database.json.

---

## Summary

All application code and tooling now use Supabase. The following were migrated or removed:

| Item | Before | After |
|------|--------|-------|
| **Express server** | loadDB/saveDB, db.* | Supabase via services |
| **import-products.js** | database.json, loadDB, saveDB | importCsvToSupabase (Supabase) |
| **seed.js** | fs.writeFileSync(database.json) | Supabase insert/upsert |
| **scripts/diagnose-products.mjs** | fs.readFileSync(database.json) | Supabase query |
| **lib/product-store.js** | upsertProductsFromCsv (db.products) | Removed; productsToCsv kept |
| **database.json** | Application data store | Deleted; in .gitignore |

---

## Commands

### Import products from CSV

```bash
node import-products.js <file.csv> [--replace]
```

- **file.csv**: Path to CSV file (required columns: sku, name; optional: brand, cost, image_url).
- **--replace**: Remove products whose SKU is not in the CSV (full catalog replace).

**Requires:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

### Seed demo data

```bash
node seed.js
```

- Seeds 20 demo products and demo user (demo@company.com / demo123) into Supabase.
- **Environment guard:** Runs only when `NODE_ENV=development` or `SEED_ALLOW=1`. Set `SEED_ALLOW=1` to run in production/staging.

**Requires:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

### Diagnose products

```bash
node scripts/diagnose-products.mjs
```

- Reports product counts, brand stats, categories, missing slugs/image_url, and verification hints.
- Reads from Supabase (no file path argument).

**Requires:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

---

## Confirmation

- **database.json**: No longer used. Deleted from repo; listed in .gitignore.
- **loadDB / saveDB**: Removed from entire codebase.
- **db.products / db.users**: No runtime code uses them; lib/pricing receives Supabase context only.
- **fs.readFile / fs.writeFile for app data**: Only used for Fishbowl CSV export and static index.html; no app persistence.
- **Tooling**: import-products, seed, diagnose-products all use Supabase.
