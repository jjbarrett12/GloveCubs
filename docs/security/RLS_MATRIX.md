# Phase 1 RLS Matrix

Policies introduced/hardened in migrations `20261227120000`–`20261227120400`.

| Schema.Table | RLS | SELECT | INSERT | UPDATE | DELETE | Tenant rule |
|--------------|-----|--------|--------|--------|--------|-------------|
| gc_commerce.companies | on | member/admin | — (service) | owner/admin | — | `is_company_member(id)` |
| gc_commerce.company_members | on | same-company | owner/admin (no self-owner) | owner/admin (no promote to owner) | owner/admin | membership |
| gc_commerce.user_profiles | on | self | self | self | — | `user_id = auth.uid()` |
| gc_commerce.ship_to_addresses | on | member | owner/admin/member | owner/admin/member | owner/admin/member | `company_id` + immutable |
| gc_commerce.uploaded_invoices | on | member | owner/admin/member | — | owner/admin | `company_id` |
| gc_commerce.rfqs | on | member or creator | owner/admin/member/billing | — | — | `company_id` |
| gc_commerce.orders | on | member | owner/admin/member/billing | — | — | `company_id` |
| gc_commerce.order_lines | on | via order company | — | — | — | join orders |
| gc_commerce.saved_lists | on | own user | own | own | own | `user_id` |
| gc_commerce.company_quicklist_items | on | member | — | — | — | `company_id` |
| gc_commerce.customer_manufacturer_pricing | on | member | — | — | — | company-private commercial |
| gc_commerce.net_terms_applications | on | member | owner/admin/billing | — | — | `company_id` |
| gc_commerce.carts | on | no client policies | — | — | — | service_role only |
| gc_commerce.sellable_products | on | active (auth) | — | — | — | `unit_cost_minor` column revoked from authenticated |
| catalogos.quote_requests | on | company member | — (service) | — | — | `gc_company_id` |
| catalogos.quote_line_items | on | via quote company | — | — | — | join quote_requests |
| catalogos.supplier_offers | on | admin only | admin | admin | admin | no public/anon |
| catalogos.offer_trust_scores | on | admin only | — | — | — | no public/anon |
| catalogos.suppliers | on | admin only | — | — | — | no public/anon |
| catalogos.supplier_import_jobs | on | admin only | admin | admin | admin | was USING(true) |
| catalog_v2.supplier_offers | on | no auth grants | — | — | — | service_role |
| public.password_reset_tokens | on | no anon/auth | — | — | — | service_role; hashed tokens |

`service_role` bypasses RLS for authorized server paths.
