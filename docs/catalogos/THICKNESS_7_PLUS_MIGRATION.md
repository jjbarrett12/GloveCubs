# Thickness 7_plus Migration

Legacy `thickness_mil` value `"7_plus"` is migrated to canonical numeric values (e.g. `"7"`, `"8"`) where source text contains an actual thickness.

## What it does

1. **supplier_products_normalized**
   - Finds rows where `normalized_data.filter_attributes.thickness_mil` or `attributes.thickness_mil` is `"7_plus"`.
   - For each row, derives numeric thickness from:
     - Raw row: `supplier_products_raw.raw_payload` (via `combinedText` + `parseThicknessFromRaw`).
     - Fallback: `normalized_data.canonical_title` / `name` and `long_description` / `description`.
   - If a number in [2, 20] is found: updates `normalized_data` and `attributes` to that value (as string) and records audit.
   - If not found: adds anomaly flag `unresolved_thickness_7_plus` and records audit.

2. **product_attributes**
   - Finds rows where `attribute_key = 'thickness_mil'` and `value_text = '7_plus'`.
   - For each, derives numeric thickness from `products.name` and `products.description`.
   - If found in [2, 20]: updates `value_text` and records audit.
   - If not found: leaves value as `7_plus` and records audit (unresolved). The **storefront facet layer** excludes `7_plus` from thickness_mil counts so it does not surface.

3. **Auditability**
   - `migrateThickness7Plus()` returns an `audit` array with `source`, `source_id`, `previous_value`, `resolved_value`, `unresolved`, `created_at`. Persist this (e.g. write to file or insert into an audit table) for traceability.

4. **Storefront**
   - Facet counts for `thickness_mil` skip `value_text === '7_plus'`, so the legacy value never appears in filter UI after cleanup.

## How to run

- **Dry run (no writes):**
  ```ts
  import { migrateThickness7Plus } from "@/lib/migrations/thickness-7-plus";
  const result = await migrateThickness7Plus({ dryRun: true });
  console.log(JSON.stringify(result, null, 2));
  ```
- **Apply migration:**
  ```ts
  const result = await migrateThickness7Plus({ dryRun: false });
  // Persist result.audit if desired (e.g. audit table or JSON file).
  ```
- **SQL (after data migration):** Run migration `20260318000001_thickness_remove_7_plus.sql` to remove `7_plus` from `attribute_allowed_values` so new data cannot use it.

## Tests

```bash
cd catalogos && npx vitest run src/lib/migrations/thickness-7-plus.test.ts
```

Tests cover: `parseThicknessFromRaw`, `isCanonicalThickness`, `deriveThicknessFromRawPayload`, and dry-run result shape.
