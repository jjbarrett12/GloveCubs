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
