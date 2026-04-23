# Types and API contract audit

This document records how GloveCubs aligns **Postgres schema** (UUID catalog + legacy BIGINT commerce), **TypeScript Supabase types**, **HTTP API responses**, and **frontend expectations**—and what was changed to enforce a **contract layer**.

---

## 1. Regenerating Supabase types (production schema)

**Script (repo root):** `npm run gen:db-types` → `scripts/gen-supabase-types.mjs`

**Requirements (either):**

| Method | Environment |
|--------|-------------|
| Direct introspection | `DATABASE_URL` or `SUPABASE_DB_URL` (Postgres URI from Supabase Dashboard → Database) |
| Hosted project | `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN`, or run `supabase login` and use `--linked` (adjust script if you prefer linked projects) |

**Output file:** `storefront/src/lib/supabase/database.from-remote.ts`  
Includes **`public`** and **`catalogos`** schemas (`--schema public --schema catalogos`).

**After a successful run:**

1. Review the generated file (RLS, views, and enum drift are common).
2. Point `storefront/src/lib/supabase/types.ts` at the generated module, for example:
   - `export type { Database, Json } from "./database.from-remote";`
3. Keep `database.manual.ts` only for **named** row helpers (`OrderItemRow`, `CatalogosProductRow`, …) if you still want stable imports independent of regeneration churn.

**Status in this workspace:** Regeneration was **not** executed against a live database (no `DATABASE_URL` in the automation environment). The repo ships a **manual permissive baseline** until you run the script locally or in CI with secrets.

---

## 2. Comparison: schema vs old types vs API vs frontend

### 2.1 Storefront (`storefront/`)

| Area | Before | Issue | After |
|------|--------|-------|--------|
| `src/lib/supabase/types.ts` | Partial `Database` (glove reco + `users` only) | Missing `canonical_products`, `order_items`, `inventory`, dozens of tables used by `.from(...)` | `database.manual.ts`: permissive `Database` (all tables → `Record<string, unknown>` rows) + **strict** `CanonicalProductRow`, `OrderItemRow` (includes **`canonical_product_id: string \| null`**), `OrdersRow`, `InventoryRow`, `CartItemStored`, `ProductsRow` |
| Admin buyer spend query | Cast `item.products` / `item.orders` as `unknown` | UI coupled to ad-hoc cast, not a named contract | `BuyerSpendOrderItemJoined` in `@/lib/contracts/admin-buyer-queries` + `createServerClient<Database>` |
| Legacy Express API | Undocumented JSON shapes | Frontend (`public/js/app.js`) and future clients had no single source of truth | Zod + types: `LegacyCartLineApi`, `LegacyOrderItemApi` in `@/lib/contracts/legacy-express-api` |
| Commerce mapping | N/A | DB row shape leaked into API layer | `mapOrderItemRowToLegacyApi` in `@/lib/contracts/map-commerce` |

### 2.2 Legacy Express server (`server.js`, `services/dataService.js`)

| Area | Before | Issue | After |
|------|--------|-------|--------|
| `GET /api/cart` / cart persistence | Only `product_id` | Misaligned with UUID catalog strategy | `lib/contracts/cart-line.js`: `newCartLineFromBody` persists optional **`canonical_product_id`**; POST `/api/cart`, reorder, and `/api/cart/bulk` pass it through when provided |
| Order enrichment | `order.items` omitted `canonical_product_id` | API contract hid UUID even when stored | `_enrichOrderWithItems`, `getOrderByIdAdmin`, `getAllOrdersAdmin` include **`canonical_product_id`** when present |

### 2.3 CatalogOS app (`catalogos/`)

| Area | Before | Issue | After |
|------|--------|-------|--------|
| `src/lib/db/types.ts` | Hand-written `public` tables (`catalogos_suppliers`, `catalogos_master_products`, … BIGINT) | **Stale vs live schema**: master catalog is **`catalogos.products` (UUID)** in Postgres, not only legacy `catalogos_master_products` | `database.manual.ts`: permissive `Database` with both **`public`** and **`catalogos`** keys + **`CatalogosProductRow`** (UUID `id`, `live_product_id`, `slug`, `family_id`, …) |
| `getSupabaseCatalogos()` | Untyped client | No compile-time link to schema | Left **untyped** `SupabaseClient` return type: typing it as `Database, "catalogos"` caused **`.select()` data to infer as `never`** with the permissive index signature. **Follow-up:** regenerate full types and use the official multi-schema `Database` from `database.from-remote.ts`, then re-enable generics. |

---

## 3. Mismatches still to watch

1. **`database.manual.ts` is not a full introspection.** Until `gen:db-types` runs, column-level safety is **not** guaranteed for every table.
2. **CatalogOS compile noise.** `catalogos` and `storefront` packages already had unrelated `tsc` errors (components, jobs). This change does not claim a green build for the whole monorepo.
3. **`public/js/app.js`** does not import Zod; contracts are documented in TypeScript for **maintainers** and for any future TS client. Optional follow-up: validate responses in tests using `LegacyCartLineApiSchema`.
4. **PostgREST embeds** (e.g. `order_items` → `canonical_products`) require FK metadata; types alone do not prove embeds work at runtime.

---

## 4. Locked contract layer (conventions)

| Layer | Location | Rule |
|-------|-----------|------|
| **HTTP / legacy API DTOs** | `storefront/src/lib/contracts/legacy-express-api.ts` | Zod schemas + `z.infer` types for cart and order lines exposed by Express |
| **Query result DTOs** | `storefront/src/lib/contracts/admin-buyer-queries.ts` | Named interfaces for specific `.select(...)` result shapes |
| **DB → API mapper** | `storefront/src/lib/contracts/map-commerce.ts` | Map `OrderItemRow` → `LegacyOrderItemApi` |
| **Express persistence helper** | `lib/contracts/cart-line.js` | Normalize cart JSON before `carts.upsert` |
| **Supabase row reference types** | `storefront/src/lib/supabase/database.manual.ts` | Import **`OrderItemRow`**, **`CanonicalProductRow`**, etc.—not `Database["public"]["Tables"]["x"]["Row"]` in UI |

**Guideline:** App routes and React components should depend on **`@/lib/contracts`** (or local query DTOs), not on raw `Database` row types. Server modules that talk to Supabase may use **`OrderItemRow`**-style aliases when mapping to DTOs.

---

## 5. Files touched (summary)

| File | Role |
|------|------|
| `scripts/gen-supabase-types.mjs` | Regenerate `database.from-remote.ts` |
| `package.json` | `gen:db-types` script |
| `.env.example` | `DATABASE_URL` hint |
| `storefront/src/lib/supabase/database.manual.ts` | Permissive `Database` + strict commerce/catalog row types |
| `storefront/src/lib/supabase/types.ts` | Re-exports manual types; switch to `database.from-remote` after regen |
| `storefront/src/lib/contracts/*` | DTOs, Zod, mapper |
| `lib/contracts/cart-line.js` | Express cart normalization |
| `server.js` | Cart + bulk + reorder: `canonical_product_id` |
| `services/dataService.js` | Order API lines include `canonical_product_id` |
| `catalogos/src/lib/db/database.manual.ts` | Permissive multi-schema `Database` + `CatalogosProductRow` |
| `catalogos/src/lib/db/types.ts` | Re-exports manual DB types |
| `catalogos/src/lib/db/client.ts` | Quoted `Accept-Profile` headers (syntax fix) |

---

## 6. Follow-up (recommended)

1. Run `npm run gen:db-types` in CI (with masked `DATABASE_URL`) on a schedule or after migrations merge.
2. Replace `database.manual.ts` `Database` with generated types; keep `*.manual.ts` only for **documented** stable aliases if needed.
3. Re-attempt `createClient<Database, "catalogos">` **after** full generation so `catalogos.Tables` is concrete.
4. Add a short ESLint `no-restricted-imports` rule: disallow `@/lib/supabase/database.manual` from `**/app/**/*.tsx` except allowlist (optional).

---

*Last updated as part of the types and contract hardening pass.*
