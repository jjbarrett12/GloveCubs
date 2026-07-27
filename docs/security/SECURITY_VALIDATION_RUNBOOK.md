# Security Validation Runbook (Phase 1)

## Incident trigger — suspend pilot immediately if

- Cross-tenant access succeeds
- Anonymous access to private tables succeeds
- Supplier costs are exposed to customers/anon
- Customer files accessible without authorization
- Service-role credentials appear in client code
- Security Advisor reports a critical exposed-table finding

## 1. Orphan report (before migrate)

```bash
psql "$DATABASE_URL" -f scripts/sql/tenant-orphan-report.sql
```

Do not invent ownership for NULL/`orphan_fk` rows. Stop and escalate if counts are unexpected.

## 2. Apply migrations

```bash
# Prefer linked Supabase project / CI migration pipeline
npx supabase db push   # or project-approved migrate command
```

Migrations: `20261227120000` … `20261227120400`.

## 3. Policy / grant audit

```bash
psql "$DATABASE_URL" -f scripts/sql/security-advisor-audit.sql
psql "$DATABASE_URL" -f scripts/sql/tenant-isolation-policy-tests.sql
```

## 4. Supabase Security Advisor

1. Open Supabase Dashboard → Project → Advisors → Security
2. Export / screenshot findings for GloveCubs schemas
3. Resolve Phase 1–related items; re-run advisor
4. Store evidence under `artifacts/` (do not claim clean without evidence)

If no access: mark **UNVERIFIED** and rely on `security-advisor-audit.sql`.

## 5. Automated unit / source tests

```bash
node --test tests/password-reset-token.test.js tests/phase1-tenant-security-source.test.js
```

## 6. JWT cross-tenant fixtures (manual / staging)

Seed Company A/B users and rows (see `tenant-isolation-policy-tests.sql` header). For each role:

- Anon: SELECT protected tables → fail
- Owner A: read A ok; read B fail; insert with B `company_id` fail; update `company_id` fail
- Viewer A: SELECT ok; INSERT/UPDATE/DELETE fail where intended
- Removed member: SELECT fail
- Admin path: only via `admin_users` + server routes

## 7. Storage

- Invoice bytes: DB-backed; verify RLS on `uploaded_invoices`
- Onboarding: CatalogOS admin secret required before signed URL
- Public images: `catalog-import-images` only

## 8. Rollback

1. Prefer leave RLS enabled; drop only newly added policies if emergency
2. Password reset: keep `token_hash`; do not restore plaintext
3. Supplier policies: do not recreate `public read supplier_offers`
4. Redeploy prior app commit if Express hash lookup breaks before migration applied (order: migrate first, then app)

## 9. Exposure response

1. Suspend pilot / rotate keys if service_role leaked
2. Revoke anon/authenticated grants immediately via SQL
3. Force password resets if tokens exposed
4. Document timeline; do not silently scrub without incident record
