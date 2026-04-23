-- Pricing Engine Auditor + Checkout Calculation Guard (run in Supabase SQL Editor)
-- Requires migration: 20260626152000_gc_commerce_pricing_audit_and_checkout_guard_views.sql
-- Or paste the CREATE VIEW statements from that file first.

SELECT * FROM gc_commerce.v_pricing_checkout_audit_summary;

-- Pricing inconsistencies (detail)
SELECT * FROM gc_commerce.v_audit_line_internal_pricing;
SELECT * FROM gc_commerce.v_audit_line_vs_legacy_unit_price;

-- Calculation mismatches (detail)
SELECT * FROM gc_commerce.v_checkout_guard_header_total;
SELECT * FROM gc_commerce.v_checkout_guard_lines_subtotal_vs_header;
SELECT * FROM gc_commerce.v_checkout_guard_full_reconciliation;

-- Often non-zero after backfill: tax on header only
SELECT * FROM gc_commerce.v_checkout_guard_tax_allocation;

-- Margin risks
SELECT * FROM gc_commerce.v_audit_margin_risks_only
WHERE margin_status IN ('negative_goods_margin', 'invalid_negative_cost');

-- All lines missing cost (analytics gap)
SELECT * FROM gc_commerce.v_audit_line_margin WHERE margin_status = 'cost_unknown';
