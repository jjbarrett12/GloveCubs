# GloveCubs isolated staging environment

**Certified (infrastructure):** 2026-07-20  
**Application SHA deployed:** `7e12aad9ac6c9f2930592d354ed26da8f96b3cef`  
**Topology:** Dedicated Supabase project + dedicated Vercel project + generated staging URL

---

## Identity (redacted)

| Concern | Staging | Production (forbidden for staging) |
| ------- | ------- | ---------------------------------- |
| Supabase name | GloveCubs Staging | GloveCubs V2 |
| Project reference | `fmrupehxifzkpfphiyvm` | `mnmagwsenzvetwngaszv` |
| Database host | `fmrupehxifzkpfphiyvm.supabase.co` | `mnmagwsenzvetwngaszv.supabase.co` |
| Region | us-east-1 | us-east-1 |
| Vercel team | jason-s-projects-920fb103 | same team (separate project) |
| Vercel project | `glovecubs-staging` | `glovecubs` |
| Public URL | https://glovecubs-staging.vercel.app | https://www.glovecubs.com |
| Created or existing | **Created** 2026-07-20 | existing |

**PRODUCTION REF DIFFERENT: YES**

---

## Why this topology is safe

- Staging Supabase is a **new empty** project with distinct ref, host, anon key, and service-role key.
- Staging Vercel project `glovecubs-staging` does **not** share Production env with `glovecubs`.
- Staging env vars point only at `fmrupehxifzkpfphiyvm` (verified via `vercel env pull` + JS bundle scan).
- Browser/network: staging JS embeds `fmrupehxifzkpfphiyvm`; **zero** references to `mnmagwsenzvetwngaszv`.
- No production customer data was copied.
- Stripe variables are **absent** on staging.
- Buyer-order feature flags are `0` on staging.

---

## Deployment truth

```text
VERCEL TEAM: jason-s-projects-920fb103
STAGING PROJECT: glovecubs-staging
ROOT DIRECTORY: monorepo root (CLI deploy from worktree at 7e12aad)
INSTALL: npm install && npm ci --prefix storefront
BUILD: npm run build --prefix storefront
OUTPUT: storefront/.next
DEPLOYED SHA: 7e12aad9ac6c9f2930592d354ed26da8f96b3cef
DEPLOYMENT ID: dpl_5Yc5QesVyJ5KQ3zUFceHxAwSFXjT
STAGING URL: https://glovecubs-staging.vercel.app
PRODUCTION DEPLOYMENT CHANGED: NO
PR #1 MERGED: NO
```

Deploy procedure (repeatable):

1. Worktree/checkout exact `7e12aad` (or later docs-only tip; **app** must remain proven equal for smoke).
2. Ensure root `vercel.json` uses storefront install/build/output (see `artifacts/glovecubs-staging-deploy.vercel.json`).
3. From that root: `npx vercel deploy --prod --yes` targeting project `glovecubs-staging`.
4. Do **not** deploy from dirty `C:/dev/Glovecubs` worktree.

Rollback / disable:

1. In Vercel → `glovecubs-staging` → unassign production alias or pause deployments.
2. Optionally delete staging deployment; keep Supabase project for forensics or wipe later.
3. Never point staging env at `mnmagwsenzvetwngaszv`.

---

## Auth (staging Supabase)

Pushed 2026-07-20 via `supabase config push` from `supabase/config.staging.toml`:

```text
AUTH SITE URL: https://glovecubs-staging.vercel.app
ALLOWED CALLBACK ORIGINS:
  - https://glovecubs-staging.vercel.app/**
  - https://glovecubs-staging-jason-s-projects-920fb103.vercel.app/**
  - http://localhost:3005/**
SIGNUP / PASSWORD RESET / INVITE: use Site URL + app paths under staging host
PRODUCTION URL PRESENT: NO
WILDCARD CALLBACKS: bounded Vercel staging hosts only (no *.vercel.app global)
```

Re-push:

```bash
npx supabase config push --project-ref fmrupehxifzkpfphiyvm
# using supabase/config.staging.toml contents as the linked project auth block
```

---

## Email strategy

```text
STAGING EMAIL READY: NO
```

- No staging SMTP / provider sandbox configured (`supabase secrets list` empty).
- Do **not** copy production SMTP credentials.
- Authenticated invitation / signup-email `/test` remains **blocked** until a staging-safe sender exists (sandbox, test domain, or allowlisted inboxes).
- Isolation still allows non-email DB/auth writes once schema baseline exists.

---

## Environment variables (names only)

Configured on `glovecubs-staging` **Production** target (staging app):

| Variable | Staging configured | Distinct from production | Required | Redacted verification |
| -------- | -----------------: | -----------------------: | -------: | --------------------- |
| NEXT_PUBLIC_SUPABASE_URL | YES | YES (`fmru…`) | YES | host ends with staging ref |
| SUPABASE_URL | YES | YES | YES | same ref |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | YES | YES | YES | present (not logged) |
| SUPABASE_ANON_KEY | YES | YES | YES | present |
| SUPABASE_SERVICE_ROLE_KEY | YES | YES | YES | present |
| NEXT_PUBLIC_SITE_URL | YES | YES (staging.vercel.app) | YES | contains `staging` |
| INTERNAL_API_SECRET | YES | YES (staging-unique) | YES | present ≥16 chars |
| FEATURE_GC_ORDER_HISTORY | YES=`0` | N/A (must stay off) | YES | `0` |
| FEATURE_GC_REORDER_TO_QUOTE | YES=`0` | N/A | YES | `0` |
| Stripe / payment vars | **absent** | N/A | must stay absent | none present |
| SMTP / email provider | **absent** | N/A | for invite smoke | STAGING EMAIL READY NO |

Validation:

```bash
GC_EXPECTED_ENV=staging \
NEXT_PUBLIC_SUPABASE_URL=https://fmrupehxifzkpfphiyvm.supabase.co \
NEXT_PUBLIC_SITE_URL=https://glovecubs-staging.vercel.app \
FEATURE_GC_ORDER_HISTORY=0 FEATURE_GC_REORDER_TO_QUOTE=0 \
node storefront/scripts/assert-env-isolation.mjs
```

Forbidden production ref hardcoded for comparison only: `mnmagwsenzvetwngaszv`.

---

## Feature containment (required)

```text
PAYMENT ENABLED: NO
STRIPE KEYS PRESENT: NO
BUYER ORDERS ENABLED: NO (FEATURE_GC_ORDER_HISTORY=0)
REORDER ENABLED: NO (FEATURE_GC_REORDER_TO_QUOTE=0)
WAREHOUSE ENABLED: NO (not configured)
EMERGENCY PUBLISH ENABLED: NO / unset
ORDER_FULFILLMENT_BRIDGE_ENABLED: unset/false
QUOTE-FIRST EXPERIENCE AVAILABLE: UI routes load; DB baseline not yet applied
```

---

## Schema baseline (not applied in this workstream)

Staging DB is **empty** (PostgREST 404 for commerce tables). **No migrations applied** here by design.

| Category | Examples | Required for quote-first baseline | Apply in this workstream |
| -------- | -------- | --------------------------------: | -----------------------: |
| Quote-first baseline | `gc_commerce` schema/prereq, companies, members, catalogos quote_requests, ship-to, quicklists, B2B pricing, catalog v2 foundations | YES (later) | **NO** |
| Invitation migration | `20261220120000_gc_commerce_company_invitations.sql` | for invite smoke only | **NO** (next `/test` workstream) |
| Warehouse | `20261224*` warehouse / receive / inventory RPCs | NO | **NO** |
| Payment | Stripe webhook / payment portal migrations | NO | **NO** |
| Legacy / unrelated | experimental or parked branches | NO | **NO** |

**Migration ambiguity:** ~200 SQL files; selective apply needs an explicit ordered baseline list before any `db push`. Do **not** apply everything blindly.

**Invitation migration applied:** NO  
**Payment migrations applied:** NO  
**Warehouse migrations applied:** NO  
**Required quote-first tables present:** NO (blocker for data smoke)

---

## Isolation evidence (2026-07-20)

| Verification | Expected | Actual | Pass |
| ------------ | -------- | ------ | ---: |
| Supabase host in staging JS | `fmrupehxifzkpfphiyvm` | same | YES |
| Production host requests | zero | zero in HTML/JS scan | YES |
| Production customer data | none | empty staging project | YES |
| `/login` `/signup` | load | load | YES |
| `/account` | protected | redirects to `/login?next=%2Faccount` | YES |
| `/pay/*` | unavailable | 404 | YES |
| Order flags | off | `0` | YES |
| Auth Site URL | staging | staging (config push) | YES |
| robots noindex | preferred | production `Allow: /` still served | NO* |
| Staging email | ready | not configured | NO |

\* Operator should enable Vercel Deployment Protection and/or project `X-Robots-Tag: noindex` without pointing DNS at production.

---

## Safety controls

- **Deployment protection:** enable Team-only / password on `glovecubs-staging` (operator).
- **Noindex:** residual gap on current SHA; fix via project headers or later robots route.
- **Staging indicator:** URL contains `staging`; optional banner later.
- **Test-data policy:** synthetic companies/users only; never copy production customers; wipe staging when done.
- **Secret handling:** keys only in Vercel env + local temp operator files; never commit.
- **Cleanup:** delete staging users/companies after smoke; optionally reset DB; never touch `mnmagwsenzvetwngaszv`.

---

## Operator ownership

- Vercel: team `jason-s-projects-920fb103`, project `glovecubs-staging`
- Supabase org: GLOVECUBS (`eciojrvfietqjznihaoc`), project `fmrupehxifzkpfphiyvm`
- Branch for docs/config: `remediate/quote-first-pilot` (PR #1 — do not merge for this workstream)

---

## Final declarations (infrastructure)

```text
STAGING SUPABASE CONFIRMED: YES
STAGING DEPLOYMENT TARGET CONFIRMED: YES
PRODUCTION ISOLATION CONFIRMED: YES
SAFE TO WRITE TEST DATA: YES
STAGING EMAIL READY: NO
PAYMENT ENABLED: NO
BUYER ORDER FEATURES ENABLED: NO
WAREHOUSE FEATURES ENABLED: NO
```

**Next workstream gates before authenticated invitation `/test`:**

1. Apply quote-first baseline migrations only (exclude invitation / payment / warehouse).
2. Configure staging-safe email → `STAGING EMAIL READY: YES`.
3. Then run invitation migration + onboarding smoke on staging only.
