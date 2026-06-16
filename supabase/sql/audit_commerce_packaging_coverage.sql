-- Read-only audit: commerce_packaging coverage on catalog_v2.catalog_products
-- No INSERT/UPDATE/DELETE/TRUNCATE/DROP/ALTER

-- 1) Products missing commerce_packaging
SELECT
  p.id,
  p.internal_sku,
  p.name,
  p.status,
  (p.metadata->>'units_per_case') AS legacy_units_per_case,
  (p.metadata->>'case_pack') AS legacy_case_pack,
  (p.metadata->>'packaging_summary') AS packaging_summary
FROM catalog_v2.catalog_products p
WHERE p.metadata->'commerce_packaging' IS NULL
   OR p.metadata->'commerce_packaging' = 'null'::jsonb
ORDER BY p.name
LIMIT 500;

-- 2) Legacy units_per_case but no commerce_packaging
SELECT
  p.id,
  p.internal_sku,
  p.name,
  (p.metadata->>'units_per_case') AS legacy_units_per_case
FROM catalog_v2.catalog_products p
WHERE (p.metadata->'commerce_packaging' IS NULL OR p.metadata->'commerce_packaging' = 'null'::jsonb)
  AND (p.metadata->>'units_per_case') IS NOT NULL
ORDER BY p.name
LIMIT 500;

-- 3) commerce_packaging present but units_per_case missing inside object
SELECT
  p.id,
  p.internal_sku,
  p.name,
  p.metadata->'commerce_packaging'->>'units_per_case' AS cp_units_per_case
FROM catalog_v2.catalog_products p
WHERE p.metadata->'commerce_packaging' IS NOT NULL
  AND (
    p.metadata->'commerce_packaging'->>'units_per_case' IS NULL
    OR (p.metadata->'commerce_packaging'->>'units_per_case')::numeric <= 0
  )
ORDER BY p.name
LIMIT 500;

-- 4) Pallet enabled but no pallet price
SELECT
  p.id,
  p.internal_sku,
  p.name,
  p.metadata->'commerce_packaging'->>'sell_by_pallet_enabled' AS sell_by_pallet,
  p.metadata->'commerce_packaging'->>'pallet_price' AS pallet_price
FROM catalog_v2.catalog_products p
WHERE (p.metadata->'commerce_packaging'->>'sell_by_pallet_enabled')::boolean IS TRUE
  AND (
    p.metadata->'commerce_packaging'->>'pallet_price' IS NULL
    OR (p.metadata->'commerce_packaging'->>'pallet_price')::numeric <= 0
  )
ORDER BY p.name
LIMIT 500;

-- 5) Pallet enabled but no cases_per_pallet
SELECT
  p.id,
  p.internal_sku,
  p.name,
  p.metadata->'commerce_packaging'->>'sell_by_pallet_enabled' AS sell_by_pallet,
  p.metadata->'commerce_packaging'->>'cases_per_pallet' AS cases_per_pallet
FROM catalog_v2.catalog_products p
WHERE (p.metadata->'commerce_packaging'->>'sell_by_pallet_enabled')::boolean IS TRUE
  AND (
    p.metadata->'commerce_packaging'->>'cases_per_pallet' IS NULL
    OR (p.metadata->'commerce_packaging'->>'cases_per_pallet')::numeric <= 0
  )
ORDER BY p.name
LIMIT 500;
