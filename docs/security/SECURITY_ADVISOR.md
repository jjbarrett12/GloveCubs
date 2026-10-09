# Phase 1 — Supabase Security Advisor

**Status: UNVERIFIED** (no dashboard/API access from this remediation session)

## Operator steps

1. Supabase Dashboard → Project → **Advisors** → **Security**
2. Filter findings for schemas: `gc_commerce`, `catalogos`, `catalog_v2`, `public`, `storage`
3. After applying migrations `20261227120000`–`20261227120400`, re-run Advisor
4. Save export/screenshot under `artifacts/security-advisor-phase1.*`

## Local substitute

```bash
psql "$DATABASE_URL" -f scripts/sql/security-advisor-audit.sql
```

## Expected Phase 1 resolutions (confirm in Advisor)

| Finding class | Expected after migrate |
|---------------|------------------------|
| Public read on `supplier_offers` / trust scores / suppliers | Gone |
| RLS disabled on customer commerce tables | Enabled |
| `password_reset_tokens` exposed to anon/authenticated | Revoked |
| `supplier_import_jobs` USING (true) | Admin-only |

Do not claim Advisor is clean until evidence is attached.
