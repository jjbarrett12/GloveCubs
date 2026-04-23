# Catalog & Inventory Architecture Review — GloveCubs

**Role:** Principal systems architect review  
**Scope:** SQL schema + application architecture for catalog, inventory, pricing, and product structure  
**Goal:** Assess fitness for long-term expansion beyond gloves into many product lines  
**Constraint:** This document is **design-only** — **no migrations** are specified as executable SQL here.

---

## Executive summary

The repository contains **two parallel catalog narratives**: a **modern UUID-based `catalogos` schema** (suppliers, staging, normalized attributes, offers, pricing rules, publish events) and a **legacy BIGINT `public.products` surface** tied to orders, inventory, carts, and manufacturer-centric B2B pricing. The `catalogos` layer is **structurally closer** to a multi-line PPE/categories platform; the **commercial/fulfillment layer** remains **SKU- and manufacturer-centric** with **weak variant modeling** and **no FK** from some order paths to a unified canonical UUID.

**Verdict:** Suitable for incremental expansion **only if** you complete **identity unification** (one sellable variant = one stable ID), **inventory at variant granularity**, and **pricing separation** (list vs cost vs customer-specific) with explicit rules. Without that, new lines will accumulate in JSON blobs and duplicate columns (`glove_type`, size strings) until search and fulfillment diverge.

---

## 1. What is structurally correct

### 1.1 `catalogos` core model

- **Suppliers** (`catalogos.suppliers`, UUID) as the ingestion anchor — correct for multi-source catalog.
- **Categories** (`catalogos.categories`) with **slug uniqueness** — appropriate backbone for category-scoped attribute definitions.
- **Attribute definitions** (`catalogos.attribute_definitions`) + **allowed values** (`catalogos.attribute_allowed_values`) — the **right relational pattern** for filterable, validated facets per category (better than JSON-only long term).
- **Normalized attribute values** (`catalogos.product_attributes`) alongside **JSONB `attributes`** on `catalogos.products` — dual storage is defensible if **JSON = flexible / source snapshot** and **EAV = indexed filter path**; requires a **single write path** to avoid drift.
- **Ingestion pipeline tables**: `supplier_products_raw` (immutable payload + checksum + idempotent unique on batch/supplier/external_id), `supplier_products_normalized` (staging status, link to raw and optional master), `import_batches`, logs — **sound boundaries** for audit and replay.
- **Supplier offers** (`catalogos.supplier_offers`): many offers per **catalog product** with trace to `raw_id` / `normalized_id` — correct shape for **procurement / best-offer** logic.
- **Pricing rules** (`catalogos.pricing_rules`) with scoped rule types — good **starting point** for declarative margin/fixed price (needs strict evaluation order and conflict rules in application code).
- **Publish events** / **review decisions** — appropriate for **workflow audit**.

### 1.2 Search / read-model direction

- **`public.canonical_products`** as a **published search surface** synced from `catalogos.products` — correct **pattern** (internal master → denormalized read model).
- **Full-text + trigram** infrastructure (storefront migrations) — appropriate for Postgres-native search; must stay **aligned** with attribute columns actually populated.

### 1.3 Variant modeling (partial)

- **`catalogos.product_families`** + **`catalogos.products.family_id`** (later migration) — **correct conceptual move**: shared marketing attributes vs per-variant SKUs.

---

## 2. What is overloaded or dangerous

### 2.1 Dual product identities (UUID vs BIGINT)

- **`catalogos.products.id`** (UUID) is the **intended master** catalog key.
- **`public.products.id`** (BIGINT) is the **transactional** key for **inventory**, **order_items** (when FK exists), and **`catalogos.products.live_product_id`** bridge.
- **`public.canonical_products.id`** is UUID and is intended to align with **catalogos product id** in sync — but **orders/inventory** do not natively reference it.

**Risk:** Two “product” IDs for the same sellable unit → **sync bugs**, **wrong inventory decrement**, **offers attached to UUID row while order references BIGINT**.

### 2.2 `public.products` as a wide “glove row”

Legacy `public.products` accumulates **dozens of columns** (material, powder, cuff, sterility, case dims, etc.) via migrations. That is:

- **Overloaded** as both **merchandising** and **storage** for unstructured merchandising data.
- **Dangerous** for new lines: either **NULL-heavy sparse rows** or **new columns per line** (schema churn).

JSONB `attributes` on `public.products` helps but **does not remove** the temptation to add line-specific columns.

### 2.3 JSONB used instead of relational structure

| Location | Issue |
|----------|--------|
| `catalogos.products.attributes` | Fast iteration; **without** strict sync to `product_attributes`, **filters and DB constraints diverge**. |
| `supplier_products_normalized.normalized_data` / `attributes` | Fine for **staging**; dangerous if **publish** reads only JSON and skips validated EAV. |
| `public.carts.items`, PO `lines` | **Opaque payloads** — hard to reconcile with **reserved inventory**, **unit of measure**, **pack vs each**. |
| `supplier_feeds.config` | OK for integration config; ensure **secrets** not stored plaintext. |

### 2.4 Pricing split across systems

- **List/customer pricing** on `public.products` (`price`, `bulk_price`, overrides via companies/manufacturers).
- **Supplier cost** on `catalogos.supplier_offers` (`cost`, and evolved columns like `sell_price`, trust/rank fields per later migrations).
- **Customer–manufacturer margin** (`customer_manufacturer_pricing`) — **brand/manufacturer-centric**, not **SKU or variant-centric**.

**Danger:** **No single “price resolution” graph** documented in schema; easy to double-apply margin or show wrong price channel-by-channel.

### 2.5 Manufacturer vs supplier

- **`manufacturers`** (BIGINT) powers **legacy pricing overrides** and **POs**.
- **`catalogos.suppliers`** powers **ingestion and offers**.

Same real-world entity may appear in **both** without a **guaranteed mapping** — **overloaded** conceptually.

### 2.6 Inventory model

- **`public.inventory`**: **one row per `products.id` (BIGINT)** — assumes **one stock bucket per legacy product**.
- **Variant size** on `order_items.size` (TEXT) suggests **variants are not always distinct product rows** — **inventory may not match** “each” actually shipped if variants share one `product_id`.

---

## 3. Where the schema will break when adding new product lines

1. **`public.canonical_products.glove_type`** (and sync extracting `glove_type` from attributes) — **semantic leak** into global search columns; new lines need **different facet columns** or **generic facet projection**.
2. **Category = flat list** — no **first-class tree** for `Category → Subcategory` in `catalogos` (slug list exists; **subcategory** often lives in **string columns** or JSON). Deep merchandising hierarchies will **break filters** and **breadcrumbs**.
3. **`order_items`**: **BIGINT `product_id` + free-text `size`** — **multi-pack UOM** (case vs each vs layer) and **non-size variants** (color, dexterity) **do not fit** reliably.
4. **Search token / filter assumptions** in application code (historically glove-biased) — even with registry improvements, **FTS triggers** may still weight legacy columns.
5. **`product_families` comments and inference** tuned to **glove size suffixes** — other categories need **different variant keys** (e.g. diopter, lens tint, ANSI rating).
6. **Attribute definitions seeded** heavily for **disposable_gloves** — other categories need **parity** or **dynamic admin**; otherwise **everything lands in JSON** unvalidated.

---

## 4. Canonical catalog entities vs commercial entities

| Canonical catalog (truth for “what we sell”) | Commercial / transactional (truth for “what we charged / moved”) |
|-----------------------------------------------|------------------------------------------------------------------|
| Product **family** (optional grouping for PDP) | **Sold line** snapshot on order/quote (SKU, description, UOM, unit price, taxes) |
| **Variant** / sellable SKU (`catalogos.products` row or explicit variant table) | **Order line** referencing **variant_id** (or stable product surrogate) |
| **Category**, **attribute definitions**, **EAV values** | **Promotional price**, **customer contract price**, **channel-specific list** |
| **Supplier product** (raw + normalized staging) | **AP invoice**, **PO line**, **landed cost adjustments** |
| **Supplier offer** (cost, lead time, MOQ, pack) | **Inventory valuation** method, **warehouse bin** (ops) |
| **Publish / canonical read model** | **Search index**, **CDN images**, **storefront cache** |

**Rule of thumb:** Anything **customer-facing and filterable** should be **derivable from canonical + publish**; anything **legal/financial** should **snapshot** at transaction time and reference **stable variant identity**.

---

## 5. Proposed TARGET catalog architecture

This is the **north-star** logical model (not a drop-in replacement). Names can vary; relationships matter.

### 5.1 Canonical products

- **`product_family`** (optional): shared content, brand, category, non-variant attributes.
- **`product_variant`** (sellable unit): **stable UUID**, **SKU unique globally**, `family_id` nullable, `category_id` required, `status` (draft/staged/published/archived).
- **No line-specific columns** on variant — line-specific facts live in **attributes** or **typed extension tables** only where query volume justifies (e.g. regulated fields).

### 5.2 Variants

- Explicit **variant axes** (not only “size”): e.g. `axis_key` + `axis_value` **or** JSON with **schema validation** per **product_type**.
- **Pack / UOM**: `base_uom`, `sell_uoms[]` (each, box, case), conversion factors — **required** for B2B quoting and inventory.

### 5.3 Product types (or product lines)

- **`product_type`** or **`product_line_code`**: assigns **which attribute schema** and **which variant rules** apply (replaces implicit “gloves” everywhere).
- Maps **category** → **type** (many-to-one or many-to-many) — **data-driven**, not hardcoded in app branches.

### 5.4 Attribute definitions & values

- Keep **`attribute_definitions`** + **`attribute_allowed_values`** per category (or per product type).
- **`product_attribute_value`**: relational values; **JSONB** only for **vendor-specific extensions** or **AI extraction payload** with version.

### 5.5 Supplier products

- **`supplier_product_raw`**: immutable (already close to `supplier_products_raw`).
- **`supplier_product_staging`**: normalized, match candidates, **does not mutate** raw.
- **Link** staging → **variant** (or **family** + proposed variant) with **confidence** and **human review** flags.

### 5.6 Supplier offers / pricing

- **`supplier_offer`**: `variant_id`, `supplier_id`, `supplier_sku`, **cost**, **currency**, **min_qty**, **pack_qty**, **lead_time**, **effective_dates** (future), **is_preferred**.
- **Customer price** and **list price** as separate concepts:
  - **`channel_price`** or **`price_list_item`** (variant, channel, currency, breakdown).
  - **`pricing_rule`** remains for **margins** but **evaluation order** is explicit (code + tests).

### 5.7 Inventory tied to variants

- **`inventory_balance`**: `variant_id` (UUID), `location_id` (future), `qty_on_hand`, `qty_reserved`, `reorder_point`, `uom`.
- **Legacy BIGINT** either **maps 1:1** to variant during transition or **dual-write** until cutover.

### 5.8 Ingestion staging tables

- Preserve **raw → normalized → review → merge → publish** boundaries.
- Add **idempotency** at **supplier + external_id + feed version** level across batches where business allows (not only per-batch uniqueness).

### 5.9 Publish workflow

- **States:** `staged` → `approved` → `published` → `deprecated`.
- **Mechanism:** transactional **publish job** writes:
  - canonical variant row,
  - EAV rows,
  - **canonical read model** (materialized table or view refresh),
  - **search vectors**,
  - optional **legacy `public.products` projection** for backward compatibility.

---

## 6. Migration strategy (additive only)

**Principle:** **Do not drop** `public.products`, `public.inventory`, or `order_items` in early phases.

### Phase A — Metadata and mapping (no destructive changes)

1. Ensure **every `catalogos.products` row** that is live has a **deterministic link** to **`public.products`** (`live_product_id`) or introduce a **`product_id_map`** table: `(catalogos_uuid, public_bigint, effective_from, effective_to)`.
2. Add **`product_line_code`** / **`product_type_id`** on published read model and catalog master (already started in separate work — align all sync jobs).
3. **`category_product_line`** (or equivalent) — **only INSERT/UPDATE** maps for new categories.

### Phase B — Variant and UOM clarity

1. Introduce **`variant_uom`** / **`pack_definition`** tables **nullable** at first; backfill from JSON/`pack_qty`/`case_qty` on legacy products.
2. **Dual-write**: when admin saves product, write **both** legacy columns and new tables.

### Phase C — Inventory

1. Add **`inventory_variant_id`** UUID column **nullable** alongside `product_id` BIGINT; **sync job** keeps them equal for migrated SKUs.
2. **Reserve/decrement** logic prefers UUID when set.

### Phase D — Orders (highest risk)

1. New orders: store **`catalog_variant_id`** on `order_items` **nullable** + keep `product_id` for legacy reads.
2. **Reporting** uses COALESCE join path.

### Phase E — Deprecation (later, not launch prerequisite)

- Freeze new columns on `public.products`; **new lines** only use **catalogos + projection**.
- Eventually **drop** glove-specific columns when **read model + APIs** no longer reference them.

---

## 7. Launch blockers vs fix later

### Launch blockers (address before treating multi-line catalog as “production true”)

| Item | Why |
|------|-----|
| **Single sellable identity** for storefront checkout vs catalog master | Prevents wrong pick, wrong price, wrong inventory. |
| **Inventory vs variant** | If size variants share one BIGINT `product_id`, **ATP/fulfillment** will be wrong for non-glove assortments. |
| **Price resolution spec** | Document and test **one function**: list, B2B, cost, margin, override — **per channel**. |
| **Publish path consistency** | Staging merge must **atomically** update **EAV + JSON + canonical_products** or define **one source** post-publish. |
| **FK integrity on `order_items.product_id`** | Ensure **referential integrity** to `public.products` everywhere orders are created (avoid orphan IDs). |

### Fix later (technical debt, not blocking first additional line if scoped)

| Item | Why |
|------|-----|
| **Renaming `glove_type`** column | Additive columns / read-model aliases suffice first. |
| **Full removal of JSONB duplicates** | Migrate incrementally; JSON remains useful for **vendor raw** and **edge attributes**. |
| **Multi-warehouse inventory** | Add `location_id` when ops require it. |
| **Supplier ↔ manufacturer master merge** | Needs MDM strategy; can map in app layer short term. |
| **Category tree depth** | Flat + slug works for moderate catalogs; tree table when navigation requires it. |
| **Quote/RFQ catalogos vs public** | Consolidate workflows when volume justifies. |

---

## 8. JSON vs relational — guidance

| Use JSONB | Use relational |
|-----------|------------------|
| Raw supplier payload, AI extraction blobs, **provenance** | Filterable facets, **constraints**, **reporting** |
| Feed config, feature flags | **Prices** with effective dating (when added) |
| Short-term staging before schema known | **Inventory movements** and **reservations** |

---

## 9. BigInt vs UUID inconsistencies (summary)

| Entity | Typical ID | Notes |
|--------|------------|--------|
| `public.users`, `orders`, `order_items`, `inventory`, `manufacturers` | BIGINT | Legacy commercial core |
| `catalogos.*`, `canonical_products` | UUID | Modern catalog |
| `catalogos.products.live_product_id` | BIGINT FK | **Bridge** — critical for migration |

**Target:** **UUID variant_id** as **canonical**; BIGINT as **legacy projection** until retired.

---

## 10. References (schema touchpoints in repo)

- `supabase/migrations/20260311000001_catalogos_schema_full.sql` — core `catalogos` tables  
- `supabase/migrations/20260404000001_canonical_products_table_and_sync.sql` — read model + sync  
- `supabase/migrations/20260601000001_product_families_and_variant_staging.sql` — families / staging hints  
- `supabase/migrations/20260330000002_glovecubs_orders_carts_inventory.sql` — orders, inventory, carts  
- `supabase/migrations/20260327100000_product_line_registry.sql` — product line map (if applied)  
- `storefront/supabase/migrations/20260312000002_product_search.sql` — FTS / `glove_type` weighting  

---

## 11. Conclusion

The **`catalogos` schema is directionally correct** for a **multi-line, supplier-driven catalog**. The **legacy `public` commercial schema** is **the limiting factor**: BIGINT product rows, **weak variant and UOM modeling**, and **split pricing concepts** will **break** as soon as you add lines with **different variant dimensions** and **pack structures**.

**Recommended strategic focus:** treat **`catalogos.products` (UUID) + explicit variant/UOM + publish read model** as **canonical**, and make **`public.products` + inventory + order_items** a **controlled projection** until you can **additive-migrate** foreign keys and inventory to **UUID variant identity**.

---

*End of document — architecture and schema design pass only; no migrations authored here.*
