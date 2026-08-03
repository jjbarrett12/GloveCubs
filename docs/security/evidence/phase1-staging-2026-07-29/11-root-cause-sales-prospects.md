# Root cause — sales_prospects missing

## ROOT CAUSE

`MIGRATION ORDER ERROR`

## Exact failure

- File: `20260506120000_procurement_opportunities_spine.sql`
- Statement: `sales_prospect_id BIGINT REFERENCES public.sales_prospects (id)`
- Error: `relation "public.sales_prospects" does not exist (SQLSTATE 42P01)`

## Why

Create is in `20260704120000_growth_pipeline_prospects.sql`, which sorts after the procurement spine FK.

## Fix

`20260506110000_create_sales_prospects.sql` — same shape as deferred create + RLS enabled (deny-by-default).
