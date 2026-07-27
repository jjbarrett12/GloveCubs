# GloveCubs Tenant Security Model (Phase 1)

**Canonical customer tenant key:** `gc_commerce.companies.id`  
**Membership:** `gc_commerce.company_members` (`user_id` → `auth.users.id`, `company_id`, `role`)  
**Roles:** `owner` | `admin` | `member` | `viewer` | `billing`

## Applications

| App | Tenant usage |
|-----|----------------|
| Storefront (Next) | Company-scoped account/procurement via membership + active company |
| Express API | Legacy user-scoped + company-scoped paths; DB RLS is defense-in-depth |
| CatalogOS | Internal operators; supplier cost via service_role / admin_users |

## Membership helpers (RLS)

- `gc_commerce.is_company_member(company_id)` — `auth.uid()` only
- `gc_commerce.has_company_role(company_id, roles[])` — `auth.uid()` only
- `public.is_active_admin()` — `public.admin_users` where `is_active`

Callers cannot pass another user id. Helpers use `SECURITY DEFINER` with pinned `search_path`.

## Role permissions (intended)

| Capability | owner | admin | member | viewer | billing |
|------------|-------|-------|--------|--------|---------|
| Read company + own commerce rows | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage members (non-owner) | ✓ | ✓ | — | — | — |
| Create owner membership | service_role / admin_users only | | | | |
| Mutate ship-to / invoices | ✓ | ✓ | ✓ | — | — |
| Insert RFQ / order | ✓ | ✓ | ✓ | — | ✓ |
| Net-terms apply | ✓ | ✓ | — | — | ✓ |

Customers cannot change `company_id` / `gc_company_id` after insert (trigger).

## Internal administrators

- **Canonical:** `public.admin_users` (`is_active`)
- Transitional: `app_admins` may still exist; new policies use `is_active_admin()`
- CatalogOS: `CATALOGOS_ADMIN_SECRET` (Phase 0 fail-closed)

## Supplier-cost model

Accessible only to:

- `service_role` (server)
- Authenticated users where `public.is_active_admin()`

Not accessible to `anon`, company members, or company owners via PostgREST.

## Service-role

Server-only. Must authorize (session + membership or admin) before querying/signing.

## File-access model

| Asset | Model |
|-------|--------|
| Customer invoice uploads | Stored as DB payload / relational rows (`uploaded_invoices`); RLS by `company_id`. No public storage path for invoice bytes. |
| Product / catalog-import images | Public bucket `catalog-import-images` (intentional). |
| Supplier onboarding | Private bucket `supplier-onboarding`; signed URLs via CatalogOS service role after admin auth. |
| Regulatory evidence | Internal / operator only until product decides public gating (still a launch P0). |

## Password-reset tokens

Express custom table `public.password_reset_tokens`: store **SHA-256 hex** in `token_hash`, scrub plaintext, `consumed_at`, expiry. No anon/authenticated grants. Storefront reset uses Supabase Auth (no custom table).
