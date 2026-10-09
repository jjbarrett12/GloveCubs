# Isolated security staging environment

## Proven staging Supabase project

| Field | Value |
|-------|-------|
| Name | GloveCubs Staging |
| Project ref | `fmrupehxifzkpfphiyvm` |
| Region | East US (North Virginia) |
| Purpose | Phase 0–1C security / Auth / RLS testing |
| Denylisted (do not use) | `mnmagwsenzvetwngaszv` (GloveCubs V2), `kfrizyygvcjbomxdrdal` (GLOVECUBS legacy) |

## Local env file

1. Copy `.env.staging.example` → `.env.staging.local` (gitignored).
2. Fill anon + service-role keys from the Supabase dashboard for **GloveCubs Staging** only.
3. Or regenerate via authenticated CLI (operator machine):

```bash
supabase projects api-keys --project-ref fmrupehxifzkpfphiyvm
```

4. Verify:

```bash
npm run verify:staging-environment
```

Expected: `"ok": true`, `"code": "STAGING_OK"`, `express_ref` / `storefront_ref` = `fmrupehxifzkpfphiyvm`.

## App targeting pattern (until dedicated staging hosts exist)

Run local Express + storefront against the **staging** Supabase project using `.env.staging.local`.

Do **not** point production Vercel (`glovecubs` / `www.glovecubs.com`) at this project.

## Blank-project prerequisite

Migration `20260422102000_enable_pg_trgm.sql` enables `pg_trgm` before storefront trigram indexes (`20260422103000`). Required for empty Supabase projects; production/V2 may already have had the extension enabled manually.


## Operator checklist for cloud app deploys (optional)

1. Create Vercel project `glovecubs-staging` (not production `glovecubs`).
2. Set staging Supabase URL/anon only; never production service role in the browser.
3. Deploy branch `remediate/glovecubs-phase1-tenant-security` @ `d7109a1`.
4. Create staging Express host with matching Supabase URL/anon/service-role + staging `JWT_SECRET`.
5. Disable SMTP (`GC_EMAIL_SANDBOX=1`, empty `SMTP_HOST`).
6. Keep `GC_EMERGENCY_DISABLE_CATALOG_SUPABASE=1`.
