# Emergency catalog kill switch

## Purpose

Stop customer-facing catalog PostgREST / Supabase fan-out during cost or crawl emergencies without taking down quote, contact, or request-pricing workflows (unless the separate public-AI gate is also set).

## Flags

```bash
GC_EMERGENCY_DISABLE_CATALOG_SUPABASE=1
```

Exact string `"1"` enables the switch. Any other value (including unset) leaves catalog reads enabled (subject to normal Supabase configuration).

```bash
GC_EMERGENCY_DISABLE_PUBLIC_AI=1
```

Exact string `"1"` short-circuits anonymous AI / recommendation POSTs (`/api/gloves/recommend`, `/api/ai/glove-finder`, `/api/invoice/intake`, `/api/ai/invoice/recommend`). There is **no durable in-repo rate limiter** — pair this with **Vercel Firewall / Bot Protection** on those paths.

Server-only. Do not expose via `NEXT_PUBLIC_*`.

## Activation

1. Set `GC_EMERGENCY_DISABLE_CATALOG_SUPABASE=1` on the **storefront** Vercel project (Production / Preview as needed).
2. Optionally set `GC_EMERGENCY_DISABLE_PUBLIC_AI=1` if AI endpoints are under attack.
3. Redeploy or wait for env propagation.
4. Verify `/store` shows the temporary-update banner and **0** catalog listings.
5. Verify `/request-pricing`, `/quote-cart`, and `/contact` still load (invoice AI stays up unless public-AI gate is on).

## Expected customer behavior

- Store listing, compare wizard, education-hub catalog matches, PDP pages, gloves recommend/use-cases, and AI glove-finder catalog slices return honest **unavailable** states.
- No customer-facing catalog route should call `getSupabaseAdmin()` for catalog reads while the catalog flag is on.
- Quote / contact / lead paths remain functional (they may still use Supabase for non-catalog tables).

## Verification

```bash
cd storefront
npx vitest run src/lib/catalog/emergency-catalog-kill-switch.test.ts src/lib/middleware/matcher-scope.test.ts
```

Manual: with flag on, open `/store`, `/store/p/<any-slug>`, `/compare-wizard` — unavailable messaging, not empty “no products found” success.

## Rollback

Unset the variable (or set to anything other than `1`) and redeploy. Confirm listings return only after egress/cost root cause is controlled.

## Routes covered (customer-facing)

| Surface | Guard |
|---|---|
| `fetchStoreCatalogPage` | `isCatalogSupabaseEmergencyDisabled()` before client init |
| `fetchStoreProductRowsByIds` / commercial attrs | same |
| `fetchStoreProductDetail` / buyer pricing enrich | same |
| `fetchEducationHubCatalogCandidates` | same |
| `fetchCompareWizardProducts` | same |
| PDP `app/store/p/[slug]` | early unavailable UI |
| `POST /api/gloves/recommend` | catalog flag + optional `GC_EMERGENCY_DISABLE_PUBLIC_AI` |
| `GET /api/gloves/use-cases` | 503 + `catalogUnavailable` |
| `POST /api/ai/glove-finder` | catalog flag + optional public-AI gate |
| `POST /api/invoice/intake` | optional public-AI gate |
| `POST /api/ai/invoice/recommend` | catalog flag + optional public-AI gate |

Canonical helpers: `storefront/src/lib/catalog/emergency-catalog-kill-switch.ts`.

## Required Vercel WAF (manual)

Enable Bot Protection / Firewall rules for `/`, `/store`, `/store/*`, and public AI endpoints. In-memory `checkAiRateLimit` is **not** durable across Fluid instances.

## Routes intentionally not covered

| Surface | Reason |
|---|---|
| Admin `/admin/**` catalog CRUD / import | Operator tooling; separate auth; not the crawl cost surface |
| Quote-request / contact / leads APIs | Non-catalog lead capture (body-size / Content-Type guards only) |
| Account / procurement workspace | Authenticated buyer ops; not public catalog fan-out |
| CatalogOS app APIs | Separate project; use CatalogOS auth + its own rate limits |

## Related

Phase 0 containment does **not** re-enable the public catalog. Keep the catalog flag on until egress root cause is proven controlled.
