-- After 223: landed-case-cost provenance on catalogos.supplier_offers.
-- Additive only. Does not backfill, approve lists, rewrite sell_price, or map offers.

ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS cost_source_type text;

ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS cost_source_reference text;

ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS cost_updated_at timestamptz;

ALTER TABLE catalogos.supplier_offers
  ADD COLUMN IF NOT EXISTS cost_updated_by text;

ALTER TABLE catalogos.supplier_offers
  DROP CONSTRAINT IF EXISTS supplier_offers_cost_source_type_check;

ALTER TABLE catalogos.supplier_offers
  ADD CONSTRAINT supplier_offers_cost_source_type_check
  CHECK (
    cost_source_type IS NULL
    OR cost_source_type IN (
      'supplier_quote',
      'supplier_invoice',
      'supplier_price_sheet',
      'contract',
      'manual',
      'csv_import',
      'url_import',
      'other'
    )
  );

COMMENT ON COLUMN catalogos.supplier_offers.cost IS
  'LANDed CASE COST (USD). Operator-supplied or imported authoritative value for one case after inbound freight, duties, brokerage, or other landed-cost additions. Internal only. Never a published-list fallback. Not derived from import_auto_pricing.';

COMMENT ON COLUMN catalogos.supplier_offers.cost_source_type IS
  'How the landed case cost was obtained: supplier_quote, supplier_invoice, supplier_price_sheet, contract, manual, csv_import, url_import, other. Null on historical rows.';

COMMENT ON COLUMN catalogos.supplier_offers.cost_source_reference IS
  'Short operator/import reference (quote id, invoice number, price-sheet name, CSV filename, supplier URL). Not a document store.';

COMMENT ON COLUMN catalogos.supplier_offers.cost_updated_at IS
  'When landed case cost was last deliberately entered or updated.';

COMMENT ON COLUMN catalogos.supplier_offers.cost_updated_by IS
  'Authenticated operator identity when available; otherwise a system/source identity (csv_import, url_import, catalogos_system). Never a fabricated person.';
