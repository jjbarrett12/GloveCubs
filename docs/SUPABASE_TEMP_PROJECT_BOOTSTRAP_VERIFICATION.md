# Temporary Supabase project: migration bootstrap verification (GloveCubs)

Use this guide to prove the **full migration chain applies cleanly from zero** on a **brand-new Supabase project**, without Docker, without `supabase db reset --local`, and without touching production.

---

## 1. Safe workflow

1. **Duplicate the repo** into a new folder (so `.env` and CLI state never point at production by accident).
   - Example (PowerShell):  
     `Copy-Item -Recurse C:\dev\Glovecubs C:\dev\Glovecubs-migrate-verify`
   - Example (macOS/Linux):  
     `cp -R ~/dev/Glovecubs ~/dev/Glovecubs-migrate-verify`

2. **Create a temporary Supabase project** in the [Supabase Dashboard](https://supabase.com/dashboard) (free tier is fine). Note the **project ref** (Settings → General → Reference ID; also appears in the project URL).

3. **Do not reuse production `.env`.** In the copied folder, create `.env` from `.env.example` (or a blank file) and set **only** the temporary project’s:
   - `SUPABASE_URL` — Project Settings → API → Project URL  
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role` (secret; never commit)

4. **Install CLI** (if needed): `npm i -g supabase` or use `npx supabase` from the copied repo.

5. **Log in** (one-time):  
   `supabase login`

6. **Verify and link** (see §2): confirm the **project ref** matches the temporary project before linking.

7. **Apply migrations** to the **empty** remote database:  
   `supabase db push`

8. **Run smoke reconcile** against the same URL/key as in step 3:  
   `npm run smoke:reconcile`

9. **Inspect schema** with the SQL in §3 (Supabase Dashboard → SQL Editor, or `psql` against the pooler connection string).

10. **Tear down** when done: pause or delete the temporary project; delete the copied folder if you no longer need it.

---

## 2. Exact commands

Run these from the **copied** repo root (where `supabase/config.toml` lives).

```bash
# Optional: confirm you are logged in
supabase projects list
```

Link the local config to the **temporary** project only after you have verified the ref in the dashboard:

```bash
supabase link --project-ref <YOUR_TEMP_PROJECT_REF>
```

Apply all migrations from `supabase/migrations/` to the linked (empty) database:

```bash
supabase db push
```

Point `.env` at the temp project, then:

```bash
npm install
npm run smoke:reconcile
```

### Verify project ref before `link` or `db push`

- Dashboard: **Settings → General** → **Reference ID** must equal `<YOUR_TEMP_PROJECT_REF>`.
- After `supabase link`, open `supabase/.temp/project-ref` (if present) or run `supabase projects list` and confirm the linked project name/ref matches the **temporary** project, not production.

---

## 3. Exact SQL checks

Run as a single script in the SQL Editor (or split by section). Adjust nothing except your optional schema filters.

### 3.1 `public.inventory` columns (required for app + reconcile)

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'inventory'
  AND column_name IN (
    'id',
    'product_id',
    'quantity_on_hand',
    'quantity_reserved',
    'incoming_quantity',
    'reorder_point',
    'updated_at',
    'bin_location',
    'last_count_at',
    'canonical_product_id'
  )
ORDER BY column_name;
```

**Expect:** one row per listed column after the full migration chain (including deferred hardening).  
**If `quantity_reserved` is missing:** classic drift; `scripts/smoke-staging.mjs` will fail with a schema blocker message.

### 3.2 `public.orders` columns (required for reconcile + payment integrity)

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN (
    'inventory_reserved_at',
    'inventory_released_at',
    'inventory_deducted_at',
    'payment_integrity_hold'
  )
ORDER BY column_name;
```

**Expect:** four rows. Missing columns indicate migrations not fully applied or a partial failure.

### 3.3 Required CHECK constraints on `public.inventory`

```sql
SELECT c.conname
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.relname = 'inventory'
  AND c.contype = 'c'
  AND c.conname IN (
    'check_reserved_lte_onhand',
    'check_quantity_on_hand_nonnegative',
    'check_quantity_reserved_nonnegative'
  )
ORDER BY c.conname;
```

**Expect:** three rows (all three names present) on a complete chain.

### 3.4 Required indexes (inventory / stock / orders hardening)

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('stock_history', 'orders')
  AND indexname IN (
    'idx_stock_history_type',
    'idx_stock_history_reference',
    'idx_stock_history_product',
    'idx_stock_history_created',
    'idx_stock_history_canonical_product_id',
    'idx_orders_inventory_reserved'
  )
ORDER BY indexname;
```

**Expect:** each listed index exists (six names) after migrations through `20260630150000` and `20260628100000`.  
If `stock_history` is missing entirely, index checks fail because the table was not created—migration issue, not data.

### 3.5 Optional: atomic RPCs exist (inventory pipeline)

```sql
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reserve_stock_for_order_atomic',
    'release_stock_for_order_atomic',
    'deduct_stock_for_order_atomic'
  )
ORDER BY p.proname;
```

**Expect:** three functions if `20260630120000_inventory_reserve_release_deduct_atomic.sql` applied.

---

## 4. Pass / fail interpretation

### Bootstrap is **safe** (migrations + empty DB)

- `supabase db push` completes with **no errors** and reports all migrations applied.
- SQL §3.1 shows **`quantity_reserved`** (and peer columns) on `public.inventory`.
- SQL §3.2 shows inventory timestamp columns and **`payment_integrity_hold`** on `public.orders`.
- SQL §3.3 shows all three inventory CHECK constraints.
- SQL §3.4 shows the expected indexes (and `public.stock_history` exists).
- `npm run smoke:reconcile` exits **0** with **no** `[BLOCKER]` / `[SCHEMA BLOCKER]` lines (warnings about empty `catalogos` or NULL `canonical_product_id` on zero rows are usually fine).

### **Schema drift** (migrations not in sync with DB)

- `db push` says “up to date” but SQL checks **miss columns, constraints, or indexes** defined in repo migrations.
- Reconcile fails with **`quantity_reserved` does not exist** (or similar PostgREST schema cache errors) while the SQL in §3.1 shows the column missing.
- **Fix:** align the database with repo migrations (`db push` on a fresh project, or repair production separately—out of scope for this temp test).

### **Data issue** vs **migration issue**

| Signal | Likely cause |
|--------|----------------|
| Columns/constraints/indexes from §3 **missing** | **Migration issue** (push not run, wrong project, failed mid-migration, or wrong branch). |
| Columns present; reconcile reports **non-zero** “shipped without `inventory_deducted_at`”, “cancelled still holding reservation”, “invalid reserved/on_hand” | **Data / workflow issue** (or app bug), not missing DDL. Empty temp DB should show **zeros** for those counts. |
| Reconcile **`[SKIP]`** for `catalogos` queries | **Environment / schema** not present or not exposed; on an empty temp project this is often normal if extensions/schemas differ. Treat as informational unless you require `catalogos` on this project. |

---

## 5. Final recommendation

**Passing this temp-project test is strong evidence** that:

- The **ordered migration chain** in `supabase/migrations/` can build the schema from zero on a live Supabase host.
- **Inventory reservation DDL** and related **orders** columns match what `lib/inventory.js` and `scripts/smoke-staging.mjs` expect.

It is **not** by itself a full launch sign-off: it does not replace **staging** checks (real data volume, RLS policies, webhooks, Stripe, email, auth flows), **load/perf**, or **operational** runbooks. Use it as a **controlled, production-isolated** gate: if the temp project fails here, fix migrations before trusting a production push; if it passes, proceed to staging and your existing launch checklist with higher confidence in the DDL story.

---

## Assumptions

- The temporary project starts with an **empty** `public` schema (new Supabase project default) before the first `db push`.
- You use the **Supabase CLI** version compatible with this repo’s `config.toml` / migration format.
- `npm run smoke:reconcile` uses **`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`** from the copied repo’s `.env` pointing at the **same** temporary project you linked for `db push`.
- You have permission to create and delete Supabase projects in your org.
- Some reconcile branches touch **`catalogos`**; if those objects are absent, the script may **skip** those checks—still compatible with validating **public** inventory/orders schema on a minimal temp DB.
