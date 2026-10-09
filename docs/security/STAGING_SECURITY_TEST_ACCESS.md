# Staging security test access (operator)

## SQL access

1. In Supabase Dashboard → project **GloveCubs Staging** (`fmrupehxifzkpfphiyvm`) → **Settings → Database**.
2. Copy the Postgres connection URI (session or transaction pooler is fine).
3. Add to **local only** `.env.staging.local` (gitignored):

```bash
STAGING_DATABASE_URL=postgresql://...
```

4. Do **not** commit the value. Do **not** paste it into chat. Do **not** use `NEXT_PUBLIC_*`.

Verify:

```bash
npm run verify:staging-environment
npm run verify:staging-db
npm run verify:private-schemas-unexposed
```

Expected: `STAGING_DB_OK` and `PRIVATE_SCHEMAS_UNEXPOSED`.

Read-only audits:

```bash
npm run staging:orphan-report
npm run staging:security-audit
```

Artifacts land in `.artifacts/staging-security/` (gitignored).

## JWT / RLS model

Private schemas stay **unexposed** to PostgREST. Live RLS tests use direct SQL:

```sql
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '<auth-user-uuid>', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"..."}', true);
SET LOCAL ROLE authenticated;
-- then SELECT/INSERT against gc_commerce / catalogos
```

Helpers: `lib/stagingSqlAccess.js` → `setRequestJwt`.

## CatalogOS server database

CatalogOS reads and writes `catalogos`, `catalog_v2`, and `gc_commerce` through a server-only Postgres connection. Those schemas stay off PostgREST (`npm run verify:private-schemas-unexposed`).

Set `SUPABASE_DB_URL` on the CatalogOS server to the session or direct URI for the same Supabase project as that deployment. Do not commit it, do not prefix it with `NEXT_PUBLIC_`, and do not point it at a different project. Production fails closed when it is missing. Production cannot use the staging SQL API, the Supabase CLI, or service-role PostgREST against those schemas.

Local staging can use `STAGING_DATABASE_URL` in `.env.staging.local`. The staging SQL API is a fallback only when `GC_ENVIRONMENT=staging` (or `CATALOGOS_ALLOW_STAGING_SQL_API=1`) and the app URL is the staging project. It does not run when `VERCEL_ENV=production`.

## Application target

Preferred: local Express + storefront against staging env vars in `.env.staging.local`.

```bash
# API_BASE=http://localhost:3004
# STOREFRONT_PUBLIC_ORIGIN=http://localhost:3005
npm run verify:staging-environment
# then start local API/storefront with staging env loaded
```

## Password-reset fault injection

No public debug endpoint. For `/test`, prefer:

- Process-local dependency injection / mocked Auth client in an isolated Node test runner with `GC_ENVIRONMENT=staging` + staging guards, or
- Controlled failure by temporarily pointing a **server-only** test hook behind an explicit local flag that is denied unless staging identity verifies.

Do not ship HTTP-callable fault injection.

## Security Advisor

- Automated: `npm run staging:security-audit` (SQL).
- Dashboard: operator opens Staging → Advisors → Security, records redacted findings under `.artifacts/staging-security/`.
