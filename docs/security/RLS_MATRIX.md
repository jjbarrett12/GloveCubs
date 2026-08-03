# Phase 1 / 1A RLS Matrix

Policies in migrations `20261227120000`–`20261227120500`.

| Schema.Table | RLS | SELECT | INSERT | UPDATE | DELETE | Tenant rule |
|--------------|-----|--------|--------|--------|--------|-------------|
| gc_commerce.companies | on | member/admin | — (service) | owner/admin | — | `is_company_member(id)` |
| gc_commerce.company_members | on | same-company | — (service) | — | — | Phase 1A: customer SELECT only |
| gc_commerce.user_profiles | — | — | — | — | — | Dropped in `20260707120000` (merged into `public.users`). Not a Phase 1 RLS target. |
| gc_commerce.ship_to_addresses | on | member | owner/admin | owner/admin | — (service) | Phase 1A: no customer DELETE |
| gc_commerce.uploaded_invoices | on | member | owner/admin/member | — | — (service) | Phase 1A: no customer hard-delete |
| gc_commerce.rfqs | on | member or creator | owner/admin/member/billing | — | — | `company_id` |
| gc_commerce.orders | on | member | — (service) | — | — | Phase 1A: no customer INSERT |
| gc_commerce.order_lines | on | via order company | — | — | — | SELECT only |
| gc_commerce.saved_lists | on | own user | own | own | own | `user_id` |
| gc_commerce.company_quicklist_items | on | member | — | — | — | `company_id` |
| gc_commerce.customer_manufacturer_pricing | on | member | — | — | — | company-private commercial |
| gc_commerce.net_terms_applications | on | member | owner/admin/billing | — | — | submit only; no decision fields |
| gc_commerce.carts | on | no client policies | — | — | — | service_role only |
| gc_commerce.sellable_products | on | active (auth) | — | — | — | `unit_cost_minor` revoked |
| catalogos.quote_requests | on | company member | — (service) | — | — | `gc_company_id` |
| catalogos.quote_line_items | on | via quote company | — | — | — | join quote_requests |
| catalogos.quote_status_history | on | admin | admin | admin | admin | Phase 1A: no open policy |
| catalogos.supplier_offers | on | admin only | admin | admin | admin | no public/anon |
| catalogos.offer_trust_scores | on | admin only | — | — | — | no public/anon |
| catalogos.suppliers | on | admin only | — | — | — | no public/anon |
| catalogos.supplier_import_jobs | on | admin only | admin | admin | admin | admin-gated |
| catalog_v2.supplier_offers | on | no auth grants | — | — | — | service_role |
| catalog_v2.v_products_legacy_shape | view | auth (cost NULL) | — | — | — | Phase 1A |
| catalog_v2.v_products_legacy_shape_internal | view | service_role | — | — | — | supplier_unit_cost |
| public.password_reset_tokens | on | no anon/auth | — | — | — | service_role; hash + claim |

`service_role` bypasses RLS for authorized server paths.

**Intentionally broader than least-privilege pilot note:** billing may still INSERT RFQs; members may INSERT invoices.
