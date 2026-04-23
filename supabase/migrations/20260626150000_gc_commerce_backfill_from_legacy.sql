-- =============================================================================
-- Backfill gc_commerce.* from legacy public schema (additive only).
--
-- Migration order: must run AFTER 20260626100000 (order_items.canonical_product_id backfill).
--
-- Prerequisites:
--   - 20260331210000_gc_commerce_canonical_schema.sql applied
--   - auth.users populated (Supabase Auth); matched to public.users by LOWER(email)
--   - public.order_items.canonical_product_id populated where possible
--     (see 20260626100000_order_inventory_catalog_product_uuid.sql)
--
-- Does NOT drop or truncate legacy tables.
-- Money: NUMERIC dollars -> *_minor BIGINT (cents) via ROUND(amount * 100).
--
-- Reconciliation: gc_commerce.backfill_log + gc_commerce.v_backfill_reconciliation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: append-only log for unmapped / ambiguous / skipped rows
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.backfill_log (
  id BIGSERIAL PRIMARY KEY,
  phase TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  legacy_table TEXT,
  legacy_id TEXT,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gc_commerce.backfill_log IS
  'One-off and incremental legacy->gc_commerce backfill diagnostics; safe to truncate between full replays if needed.';

CREATE INDEX IF NOT EXISTS idx_gc_backfill_log_phase ON gc_commerce.backfill_log (phase, created_at DESC);

-- -----------------------------------------------------------------------------
-- Stable mapping tables (idempotent re-runs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gc_commerce.legacy_company_map (
  legacy_company_id BIGINT PRIMARY KEY,
  gc_company_id UUID NOT NULL REFERENCES gc_commerce.companies (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_legacy_company_map_gc UNIQUE (gc_company_id)
);

CREATE TABLE IF NOT EXISTS gc_commerce.legacy_order_map (
  legacy_order_id BIGINT PRIMARY KEY,
  gc_order_id UUID NOT NULL REFERENCES gc_commerce.orders (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gc_legacy_order_map_gc UNIQUE (gc_order_id)
);

CREATE TABLE IF NOT EXISTS gc_commerce.legacy_sellable_map (
  catalog_product_id UUID PRIMARY KEY,
  sellable_product_id UUID NOT NULL REFERENCES gc_commerce.sellable_products (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gc_commerce.legacy_company_map IS 'public.companies.id -> gc_commerce.companies.id';
COMMENT ON TABLE gc_commerce.legacy_order_map IS 'public.orders.id -> gc_commerce.orders.id';
COMMENT ON TABLE gc_commerce.legacy_sellable_map IS 'catalog UUID -> gc_commerce.sellable_products.id';

-- -----------------------------------------------------------------------------
-- 1) Sentinel company for orders with no legacy company_id
-- -----------------------------------------------------------------------------
INSERT INTO gc_commerce.companies (trade_name, legal_name, slug, status)
SELECT 'Legacy orders (no company)', NULL, 'legacy-no-company-backfill', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM gc_commerce.companies c WHERE lower(c.slug) = 'legacy-no-company-backfill'
);

-- -----------------------------------------------------------------------------
-- 2) public.companies -> gc_commerce.companies (+ map)
-- -----------------------------------------------------------------------------
INSERT INTO gc_commerce.companies (trade_name, legal_name, slug, status, created_at, updated_at)
SELECT
  trim(c.name),
  NULL,
  'legacy-co-' || c.id::TEXT,
  'active',
  COALESCE(c.created_at, NOW()),
  COALESCE(c.updated_at, NOW())
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM gc_commerce.legacy_company_map m WHERE m.legacy_company_id = c.id
)
AND trim(c.name) IS NOT NULL
AND trim(c.name) <> ''
AND char_length('legacy-co-' || c.id::TEXT) <= 64;

INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'companies',
  'warning',
  'public.companies',
  c.id::TEXT,
  'company not copied to gc_commerce: empty or whitespace name',
  '{}'::JSONB
FROM public.companies c
WHERE (c.name IS NULL OR trim(c.name) = '')
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.backfill_log bl
    WHERE bl.phase = 'companies'
      AND bl.legacy_id = c.id::TEXT
      AND bl.message = 'company not copied to gc_commerce: empty or whitespace name'
  );

INSERT INTO gc_commerce.legacy_company_map (legacy_company_id, gc_company_id)
SELECT c.id, co.id
FROM public.companies c
INNER JOIN gc_commerce.companies co ON lower(co.slug) = lower('legacy-co-' || c.id::TEXT)
WHERE NOT EXISTS (
  SELECT 1 FROM gc_commerce.legacy_company_map m WHERE m.legacy_company_id = c.id
);

-- -----------------------------------------------------------------------------
-- 3) Log: duplicate auth.users emails (ambiguous match target)
-- -----------------------------------------------------------------------------
INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'user_profiles',
  'warning',
  'auth.users',
  t.em,
  'multiple auth.users rows share the same normalized email; profile backfill uses earliest-created row only',
  jsonb_build_object('auth_user_count', t.cnt)
FROM (
  SELECT lower(trim(email)) AS em, COUNT(*)::INT AS cnt
  FROM auth.users
  WHERE email IS NOT NULL AND trim(email) <> ''
  GROUP BY lower(trim(email))
  HAVING COUNT(*) > 1
) t
WHERE NOT EXISTS (
  SELECT 1 FROM gc_commerce.backfill_log bl
  WHERE bl.phase = 'user_profiles'
    AND bl.legacy_id = t.em
    AND bl.message LIKE 'multiple auth.users rows share%'
);

-- -----------------------------------------------------------------------------
-- 4) Log: legacy public.users with no auth.users match (email)
-- -----------------------------------------------------------------------------
INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'user_profiles',
  'warning',
  'public.users',
  u.id::TEXT,
  'no auth.users row with matching email - user_profiles row not created',
  jsonb_build_object('email', u.email)
FROM public.users u
WHERE u.email IS NOT NULL
  AND trim(u.email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM auth.users au WHERE lower(trim(au.email)) = lower(trim(u.email))
  )
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.backfill_log bl
    WHERE bl.phase = 'user_profiles'
      AND bl.legacy_table = 'public.users'
      AND bl.legacy_id = u.id::TEXT
      AND bl.message = 'no auth.users row with matching email - user_profiles row not created'
  );

-- -----------------------------------------------------------------------------
-- 5) user_profiles (auth.users chosen as earliest per normalized email)
-- -----------------------------------------------------------------------------
WITH auth_pick AS (
  SELECT DISTINCT ON (lower(trim(email)))
    id AS auth_user_id,
    lower(trim(email)) AS em,
    created_at
  FROM auth.users
  WHERE email IS NOT NULL AND trim(email) <> ''
  ORDER BY lower(trim(email)), created_at ASC
)
INSERT INTO gc_commerce.user_profiles (
  user_id,
  full_name,
  default_company_id,
  phone_e164,
  created_at,
  updated_at
)
SELECT
  ap.auth_user_id,
  NULLIF(trim(u.contact_name), ''),
  lcm.gc_company_id,
  NULL,
  u.created_at,
  u.updated_at
FROM public.users u
INNER JOIN auth_pick ap ON ap.em = lower(trim(u.email))
LEFT JOIN gc_commerce.legacy_company_map lcm ON lcm.legacy_company_id = u.company_id
ON CONFLICT (user_id) DO UPDATE SET
  full_name = COALESCE(EXCLUDED.full_name, gc_commerce.user_profiles.full_name),
  default_company_id = COALESCE(EXCLUDED.default_company_id, gc_commerce.user_profiles.default_company_id),
  updated_at = EXCLUDED.updated_at;

-- -----------------------------------------------------------------------------
-- 6) company_members (public.company_members -> gc), when table exists
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.company_members') IS NULL THEN
    INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
    SELECT
      'company_members',
      'info',
      'public.company_members',
      NULL,
      'public.company_members does not exist - skipped',
      '{}'::JSONB
    WHERE NOT EXISTS (
      SELECT 1 FROM gc_commerce.backfill_log bl
      WHERE bl.phase = 'company_members'
        AND bl.message = 'public.company_members does not exist - skipped'
    );
    RETURN;
  END IF;

  INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
  SELECT
    'company_members',
    'warning',
    'public.company_members',
    cm.id::TEXT,
    'no auth.users match for user_id - membership not copied',
    jsonb_build_object('company_id', cm.company_id, 'user_id', cm.user_id)
  FROM public.company_members cm
  INNER JOIN public.users u ON u.id = cm.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users au WHERE lower(trim(au.email)) = lower(trim(u.email))
  )
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.backfill_log bl
    WHERE bl.phase = 'company_members'
      AND bl.legacy_table = 'public.company_members'
      AND bl.legacy_id = cm.id::TEXT
      AND bl.message = 'no auth.users match for user_id - membership not copied'
  );

  WITH auth_pick AS (
    SELECT DISTINCT ON (lower(trim(email)))
      id AS auth_user_id,
      lower(trim(email)) AS em
    FROM auth.users
    WHERE email IS NOT NULL AND trim(email) <> ''
    ORDER BY lower(trim(email)), created_at ASC
  )
  INSERT INTO gc_commerce.company_members (
    company_id,
    user_id,
    role,
    joined_at,
    created_at
  )
  SELECT
    lcm.gc_company_id,
    ap.auth_user_id,
    CASE
      WHEN lower(trim(cm.role)) IN ('owner', 'admin', 'member', 'viewer', 'billing') THEN lower(trim(cm.role))
      ELSE 'member'
    END,
    COALESCE(cm.created_at, NOW()),
    COALESCE(cm.created_at, NOW())
  FROM public.company_members cm
  INNER JOIN gc_commerce.legacy_company_map lcm ON lcm.legacy_company_id = cm.company_id
  INNER JOIN public.users u ON u.id = cm.user_id
  INNER JOIN auth_pick ap ON ap.em = lower(trim(u.email))
  ON CONFLICT (company_id, user_id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- 7) sellable_products from distinct order_items.canonical_product_id (+ DO block for catalogos)
-- -----------------------------------------------------------------------------
WITH catalog_ids AS (
  SELECT DISTINCT canonical_product_id AS cid
  FROM public.order_items
  WHERE canonical_product_id IS NOT NULL
)
INSERT INTO gc_commerce.sellable_products (
  id,
  catalog_product_id,
  sku,
  display_name,
  currency_code,
  list_price_minor,
  is_active,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  c.cid,
  'cat-' || replace(c.cid::TEXT, '-', ''),
  COALESCE(
    NULLIF(trim(cp.title), ''),
    NULLIF(trim(cp.name), ''),
    'Product ' || c.cid::TEXT
  ),
  'USD',
  NULL,
  TRUE,
  NOW(),
  NOW()
FROM catalog_ids c
LEFT JOIN public.canonical_products cp ON cp.id = c.cid
WHERE NOT EXISTS (
  SELECT 1
  FROM gc_commerce.sellable_products sp
  WHERE sp.catalog_product_id = c.cid AND sp.is_active = TRUE
);

-- Products bridged by catalogos.products.live_product_id -> catalog UUID (optional schema)
DO $$
BEGIN
  IF to_regclass('catalogos.products') IS NULL THEN
    INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
    SELECT
      'sellable_products',
      'info',
      'catalogos.products',
      NULL,
      'catalogos.products not present - sellable backfill used order_items.canonical_product_id only',
      '{}'::JSONB
    WHERE NOT EXISTS (
      SELECT 1 FROM gc_commerce.backfill_log bl
      WHERE bl.phase = 'sellable_products'
        AND bl.message = 'catalogos.products not present - sellable backfill used order_items.canonical_product_id only'
    );
    RETURN;
  END IF;

  INSERT INTO gc_commerce.sellable_products (
    id,
    catalog_product_id,
    sku,
    display_name,
    currency_code,
    list_price_minor,
    is_active,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    cat.id,
    'cat-' || replace(cat.id::TEXT, '-', ''),
    COALESCE(
      NULLIF(trim(cp.title), ''),
      NULLIF(trim(cp.name), ''),
      'Product ' || cat.id::TEXT
    ),
    'USD',
    NULL,
    TRUE,
    NOW(),
    NOW()
  FROM public.products pr
  INNER JOIN catalogos.products cat ON cat.live_product_id = pr.id
  LEFT JOIN public.canonical_products cp ON cp.id = cat.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM gc_commerce.sellable_products sp
    WHERE sp.catalog_product_id = cat.id AND sp.is_active = TRUE
  );
END $$;

INSERT INTO gc_commerce.legacy_sellable_map (catalog_product_id, sellable_product_id)
SELECT sp.catalog_product_id, sp.id
FROM gc_commerce.sellable_products sp
WHERE sp.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.legacy_sellable_map m WHERE m.catalog_product_id = sp.catalog_product_id
  );

INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'sellable_products',
  'warning',
  'public.order_items',
  oi.id::TEXT,
  'order line has no canonical_product_id - needs catalogos.products live_product_id mapping or manual UUID',
  jsonb_build_object('order_id', oi.order_id, 'legacy_product_id', oi.product_id)
FROM public.order_items oi
WHERE oi.canonical_product_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.backfill_log bl
    WHERE bl.phase = 'sellable_products'
      AND bl.legacy_table = 'public.order_items'
      AND bl.legacy_id = oi.id::TEXT
      AND bl.message LIKE 'order line has no canonical_product_id%'
  );

-- -----------------------------------------------------------------------------
-- 8) Log orders that cannot be fully line-mapped
-- -----------------------------------------------------------------------------
INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'orders',
  'warning',
  'public.orders',
  o.id::TEXT,
  'order skipped: one or more order_items lack canonical_product_id (no sellable_product mapping)',
  jsonb_build_object(
    'unmapped_line_count',
    (SELECT COUNT(*) FROM public.order_items x WHERE x.order_id = o.id AND x.canonical_product_id IS NULL)
  )
FROM public.orders o
WHERE EXISTS (
  SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id AND oi.canonical_product_id IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM gc_commerce.backfill_log bl
  WHERE bl.phase = 'orders'
    AND bl.legacy_table = 'public.orders'
    AND bl.legacy_id = o.id::TEXT
    AND bl.message LIKE 'order skipped: one or more order_items lack canonical_product_id%'
);

-- -----------------------------------------------------------------------------
-- 9) orders (USD cents; cap discount to subtotal for CHECK constraints)
-- -----------------------------------------------------------------------------
WITH no_company AS (
  SELECT id FROM gc_commerce.companies WHERE lower(slug) = 'legacy-no-company-backfill' LIMIT 1
),
eligible AS (
  SELECT o.*
  FROM public.orders o
  WHERE NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = o.id AND oi.canonical_product_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.legacy_order_map m WHERE m.legacy_order_id = o.id
  )
)
INSERT INTO gc_commerce.orders (
  id,
  company_id,
  created_by_user_id,
  order_number,
  status,
  currency_code,
  subtotal_minor,
  discount_minor,
  shipping_minor,
  tax_minor,
  total_minor,
  shipping_address,
  metadata,
  idempotency_key,
  placed_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  COALESCE(lcm.gc_company_id, (SELECT id FROM no_company)),
  (
    SELECT ap.auth_user_id
    FROM public.users u
    INNER JOIN LATERAL (
      SELECT DISTINCT ON (lower(trim(email)))
        id AS auth_user_id
      FROM auth.users
      WHERE email IS NOT NULL AND trim(email) <> '' AND lower(trim(email)) = lower(trim(u.email))
      ORDER BY lower(trim(email)), created_at ASC
    ) ap ON TRUE
    WHERE u.id = COALESCE(e.created_by_user_id, e.user_id)
    LIMIT 1
  ),
  e.order_number,
  CASE lower(trim(e.status))
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'canceled' THEN 'cancelled'
    WHEN 'refunded' THEN 'refunded'
    WHEN 'delivered' THEN 'fulfilled'
    WHEN 'completed' THEN 'fulfilled'
    WHEN 'shipped' THEN 'fulfilled'
    WHEN 'paid' THEN 'paid'
    WHEN 'processing' THEN 'confirmed'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'draft' THEN 'draft'
    ELSE 'pending'
  END,
  'USD',
  GREATEST(0, ROUND(COALESCE(e.subtotal, 0) * 100)::BIGINT),
  LEAST(
    GREATEST(0, ROUND(COALESCE(e.subtotal, 0) * 100)::BIGINT),
    GREATEST(0, ROUND(COALESCE(e.discount, 0) * 100)::BIGINT)
  ),
  GREATEST(0, ROUND(COALESCE(e.shipping, 0) * 100)::BIGINT),
  GREATEST(0, ROUND(COALESCE(e.tax, 0) * 100)::BIGINT),
  GREATEST(0, ROUND(COALESCE(e.total, 0) * 100)::BIGINT),
  e.shipping_address,
  jsonb_build_object(
    'legacy_order_id', e.id,
    'legacy_user_id', e.user_id,
    'legacy_company_id', e.company_id,
    'legacy_status', e.status
  ),
  'legacy-order-' || e.id::TEXT,
  e.created_at,
  e.created_at,
  e.updated_at
FROM eligible e
LEFT JOIN gc_commerce.legacy_company_map lcm ON lcm.legacy_company_id = e.company_id
ON CONFLICT (order_number) DO NOTHING;

-- Map only rows we inserted (by idempotency_key)
INSERT INTO gc_commerce.legacy_order_map (legacy_order_id, gc_order_id)
SELECT
  (regexp_replace(o.idempotency_key, '^legacy-order-', ''))::BIGINT,
  o.id
FROM gc_commerce.orders o
WHERE o.idempotency_key LIKE 'legacy-order-%'
  AND o.idempotency_key ~ '^legacy-order-[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.legacy_order_map m
    WHERE m.legacy_order_id = (regexp_replace(o.idempotency_key, '^legacy-order-', ''))::BIGINT
  );

-- Map legacy orders to existing gc rows when a previous run inserted by order_number but map was missing
INSERT INTO gc_commerce.legacy_order_map (legacy_order_id, gc_order_id)
SELECT po.id, go.id
FROM public.orders po
INNER JOIN gc_commerce.orders go ON go.idempotency_key = 'legacy-order-' || po.id::TEXT
WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_order_map m WHERE m.legacy_order_id = po.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = po.id AND oi.canonical_product_id IS NULL
  );

-- If ON CONFLICT (order_number) skipped insert, legacy_order_map won't get row - log once
INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'orders',
  'warning',
  'public.orders',
  po.id::TEXT,
  'order not inserted: gc_commerce.orders.order_number conflict (duplicate or re-run partial state)',
  jsonb_build_object('order_number', po.order_number)
FROM public.orders po
WHERE NOT EXISTS (SELECT 1 FROM gc_commerce.legacy_order_map m WHERE m.legacy_order_id = po.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = po.id AND oi.canonical_product_id IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM gc_commerce.orders go WHERE go.order_number = po.order_number
  )
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.backfill_log bl
    WHERE bl.legacy_id = po.id::TEXT
      AND bl.message LIKE 'order not inserted: gc_commerce.orders.order_number conflict%'
  );

-- -----------------------------------------------------------------------------
-- 10) order_lines
-- -----------------------------------------------------------------------------
INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'order_lines',
  'warning',
  'public.order_items',
  oi.id::TEXT,
  'order line skipped: quantity <= 0',
  jsonb_build_object('order_id', oi.order_id, 'quantity', oi.quantity)
FROM public.order_items oi
INNER JOIN gc_commerce.legacy_order_map lom ON lom.legacy_order_id = oi.order_id
WHERE COALESCE(oi.quantity, 0) <= 0
  AND NOT EXISTS (
    SELECT 1 FROM gc_commerce.backfill_log bl
    WHERE bl.phase = 'order_lines'
      AND bl.legacy_id = oi.id::TEXT
      AND bl.message = 'order line skipped: quantity <= 0'
  );

WITH numbered_lines AS (
  SELECT
    oi.id AS legacy_order_item_id,
    oi.product_id AS legacy_product_id,
    oi.quantity,
    oi.unit_price,
    oi.size,
    oi.canonical_product_id,
    oi.created_at AS line_created_at,
    lom.gc_order_id,
    lsm.sellable_product_id,
    ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.id) AS line_number
  FROM public.order_items oi
  INNER JOIN gc_commerce.legacy_order_map lom ON lom.legacy_order_id = oi.order_id
  INNER JOIN gc_commerce.legacy_sellable_map lsm ON lsm.catalog_product_id = oi.canonical_product_id
  WHERE COALESCE(oi.quantity, 0) > 0
)
INSERT INTO gc_commerce.order_lines (
  id,
  order_id,
  sellable_product_id,
  line_number,
  quantity,
  unit_price_minor,
  line_subtotal_minor,
  discount_minor,
  tax_minor,
  total_minor,
  product_snapshot,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  n.gc_order_id,
  n.sellable_product_id,
  n.line_number::INT,
  n.quantity,
  GREATEST(0, ROUND(COALESCE(n.unit_price, 0) * 100)::BIGINT),
  GREATEST(0, ROUND((COALESCE(n.unit_price, 0) * n.quantity::NUMERIC) * 100)::BIGINT),
  0,
  0,
  GREATEST(0, ROUND((COALESCE(n.unit_price, 0) * n.quantity::NUMERIC) * 100)::BIGINT),
  jsonb_build_object(
    'legacy_order_item_id', n.legacy_order_item_id,
    'legacy_product_id', n.legacy_product_id,
    'size', n.size,
    'catalog_product_id', n.canonical_product_id
  ),
  n.line_created_at,
  n.line_created_at
FROM numbered_lines n
WHERE NOT EXISTS (
  SELECT 1
  FROM gc_commerce.order_lines ol
  WHERE ol.order_id = n.gc_order_id
    AND (ol.product_snapshot->>'legacy_order_item_id')::BIGINT = n.legacy_order_item_id
);

-- -----------------------------------------------------------------------------
-- 11) Summary row in backfill_log
-- -----------------------------------------------------------------------------
INSERT INTO gc_commerce.backfill_log (phase, severity, legacy_table, legacy_id, message, details)
SELECT
  'summary',
  'info',
  NULL,
  NULL,
  'gc_commerce backfill reconciliation snapshot',
  jsonb_build_object(
    'legacy_public_users', (SELECT COUNT(*) FROM public.users),
    'auth_users', (SELECT COUNT(*) FROM auth.users),
    'gc_user_profiles', (SELECT COUNT(*) FROM gc_commerce.user_profiles),
    'legacy_companies', (SELECT COUNT(*) FROM public.companies),
    'gc_companies_total', (SELECT COUNT(*) FROM gc_commerce.companies),
    'mapped_legacy_companies', (SELECT COUNT(*) FROM gc_commerce.legacy_company_map),
    'legacy_orders', (SELECT COUNT(*) FROM public.orders),
    'mapped_legacy_orders', (SELECT COUNT(*) FROM gc_commerce.legacy_order_map),
    'legacy_order_items', (SELECT COUNT(*) FROM public.order_items),
    'gc_order_lines', (SELECT COUNT(*) FROM gc_commerce.order_lines),
    'gc_sellable_products_active', (SELECT COUNT(*) FROM gc_commerce.sellable_products WHERE is_active),
    'order_items_missing_canonical', (SELECT COUNT(*) FROM public.order_items WHERE canonical_product_id IS NULL),
    'backfill_warnings', (SELECT COUNT(*) FROM gc_commerce.backfill_log WHERE severity = 'warning' AND phase <> 'summary'),
    'note', 'backfill_warnings is count of warning rows in log before this summary row (cumulative if migration re-run).'
  );

-- -----------------------------------------------------------------------------
-- 12) Reconciliation view
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gc_commerce.v_backfill_reconciliation AS
SELECT
  (
    SELECT bl.details
    FROM gc_commerce.backfill_log bl
    WHERE bl.phase = 'summary'
      AND bl.message = 'gc_commerce backfill reconciliation snapshot'
    ORDER BY bl.id DESC
    LIMIT 1
  ) AS last_run_summary,
  (SELECT COUNT(*) FROM public.users) AS live_legacy_public_users,
  (SELECT COUNT(*) FROM gc_commerce.user_profiles) AS live_gc_user_profiles,
  (SELECT COUNT(*) FROM public.orders) AS live_legacy_orders,
  (SELECT COUNT(*) FROM gc_commerce.legacy_order_map) AS live_mapped_orders,
  (SELECT COUNT(*) FROM public.order_items WHERE canonical_product_id IS NULL) AS live_order_items_missing_canonical,
  (SELECT COUNT(*) FROM gc_commerce.backfill_log WHERE severity = 'warning') AS total_backfill_warnings;

COMMENT ON VIEW gc_commerce.v_backfill_reconciliation IS
  'last_run_summary.details mirrors the latest summary backfill_log row; other columns are live counts.';

GRANT SELECT ON gc_commerce.v_backfill_reconciliation TO postgres, service_role;

GRANT SELECT, INSERT ON gc_commerce.backfill_log TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_company_map TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_order_map TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gc_commerce.legacy_sellable_map TO postgres, service_role;
