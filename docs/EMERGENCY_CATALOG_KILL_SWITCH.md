# Emergency catalog kill switch

## Purpose

Stop customer-facing catalog PostgREST / Supabase fan-out during cost or crawl emergencies without taking down quote, contact, invoice-upload, or request-pricing workflows.

## Flag

```bash
GC_EMERGENCY_DISABLE_CATALOG_SUPABASE=1
```

Exact string `"1"` enables the switch. Any other value (including unset) leaves catalog reads enabled (subject to normal Supabase configuration).

Server-only. Do not expose via `NEXT_PUBLIC_*`.

## Activation

1. Set `GC_EMERGENCY_DISABLE_CATALOG_SUPABASE=1` on the **storefront** Vercel project (Production / Preview as needed).
2. Redeploy or wait for env propagation.
3. Verify `/store` shows the temporary-unavailability banner and **0** catalog listings.
4. Verify `/request-pricing`, `/quote-cart`, `/contact`, and `/invoice-savings` still load.

## Expected customer behavior

- Store listing, compare wizard, education-hub catalog matches, PDP pages, gloves recommend/use-cases, and AI glove-finder catalog slices return honest **unavailable** states.
- No customer-facing catalog route should call `getSupabaseAdmin()` for catalog reads while the flag is on.
- Quote / contact / invoice / lead paths remain functional (they may still use Supabase for non-catalog tables).

## Verification

```bash
cd storefront
npx vitest run src/lib/catalog/emergency-catalog-kill-switch.test.ts
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
| `POST /api/gloves/recommend` | 503 + `catalogUnavailable` |
| `GET /api/gloves/use-cases` | 503 + `catalogUnavailable` |
| `POST /api/ai/glove-finder` | 503 + `catalogUnavailable` |

Canonical helper: `storefront/src/lib/catalog/emergency-catalog-kill-switch.ts` → `isCatalogSupabaseEmergencyDisabled()`.

## Routes intentionally not covered

| Surface | Reason |
|---|---|
| Admin `/admin/**` catalog CRUD / import | Operator tooling; separate auth; not the crawl cost surface |
| Invoice extract / recommend | Lead workflow must stay up; matching may still query catalog for ops — monitor separately |
| Quote-request / contact / leads APIs | Non-catalog lead capture |
| Account / procurement workspace | Authenticated buyer ops; not public catalog fan-out |
| CatalogOS app APIs | Separate project; use CatalogOS auth + its own rate limits |

## Related

Phase 0 containment does **not** re-enable the public catalog. Keep the flag on until egress root cause is proven controlled.
