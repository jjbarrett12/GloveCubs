# Staging environment verification — STOP (2026-07-20)

## Required declaration

```text
STAGING SUPABASE CONFIRMED: NO
STAGING DEPLOYMENT TARGET CONFIRMED: NO
PRODUCTION ISOLATION CONFIRMED: NO
SAFE TO WRITE TEST DATA: NO
```

## Why

| Concern | Finding |
|---------|---------|
| Supabase “staging” project | **Not found.** Org lists `GLOVECUBS` (`kfrizyygvcjbomxdrdal`) and `GloveCubs V2` (`mnmagwsenzvetwngaszv`). No project named/labeled GloveCubs Staging. |
| Production DB | `SUPABASE_URL` on Vercel **Production** = `https://mnmagwsenzvetwngaszv.supabase.co` (GloveCubs V2). |
| Preview DB | Vercel **Preview** env has **blank** `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` — not an isolated staging database. |
| Local agent env | `.env.local` pointed at `mnmagwsenzvetwngaszv` with `VERCEL_ENV=production` — same as production. |
| Preview feature flags | Preview has `FEATURE_GC_ORDER_HISTORY=1` and `FEATURE_GC_REORDER_TO_QUOTE=1` — incompatible with quote-first pilot containment if used as “staging”. |
| Migration write risk | Applying `20261220120000_…` against available credentials would risk **production** (`mnmag…`) or an **unidentified** secondary project without isolation proof. |

## Actions not taken (by design)

- No migration applied
- No staging deploy of `7e12aad`
- No test companies/users/quotes created
- No production catalog mutations
- No PR merge

## Redacted environment matrix

| Concern | Staging value/identifier | Production value/identifier | Clearly isolated |
| ------- | ------------------------ | --------------------------- | ---------------: |
| Supabase project | **UNCONFIRMED / MISSING** | GloveCubs V2 `mnmagwsenzvetwngaszv` | **NO** |
| Database host | unknown | `mnmagwsenzvetwngaszv.supabase.co` | **NO** |
| Public site URL | unknown (Preview URL exists but not proven staging) | `https://www.glovecubs.com` | **NO** |
| Auth callback | unknown | production site auth | **NO** |
| Vercel project | same `glovecubs` Preview env | `glovecubs` Production | **PARTIAL** (same project; Preview DB blank) |
| Email sender | unknown | unknown (not probed) | **NO** |
| Stripe configuration | not configured for this workstream | not changed | N/A |

## Production catalog read-only (Gate 1)

From `https://www.glovecubs.com/store` (browser):

- `GLV-LAUNCH` mentions: **13** (multiple cards)
- `SKU · UNKNOWN`: **1**
- Listings: **9**
- Gate 1 remains **NO-GO**
