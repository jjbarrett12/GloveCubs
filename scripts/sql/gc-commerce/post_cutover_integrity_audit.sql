-- Post-cutover full integrity audit (Supabase SQL Editor)
-- Apply migrations through 20260626153000_gc_commerce_post_cutover_integrity_audit.sql first.

-- 1) One-row dashboard
SELECT * FROM gc_commerce.v_post_cutover_integrity_summary;

-- 2) RLS posture (gc_commerce: expect rls_enabled true before exposing via PostgREST to buyers)
SELECT * FROM gc_commerce.v_audit_rls_gc_commerce_tables;

-- 3) Tenant isolation failures
SELECT * FROM gc_commerce.v_audit_tenant_legacy_company_drift;
SELECT * FROM gc_commerce.v_audit_tenant_placer_not_member;
SELECT * FROM gc_commerce.v_audit_tenant_placer_null;

-- 4) Product mapping (detail)
SELECT * FROM gc_commerce.v_integrity_product_mapping_mismatches;
SELECT * FROM gc_commerce.v_integrity_missing_lines;

-- 5) Pricing + checkout (detail if summary non-zero)
SELECT * FROM gc_commerce.v_pricing_checkout_audit_summary;
SELECT * FROM gc_commerce.v_integrity_order_header_mismatches;
SELECT * FROM gc_commerce.v_checkout_guard_header_total;
SELECT * FROM gc_commerce.v_checkout_guard_lines_subtotal_vs_header;
