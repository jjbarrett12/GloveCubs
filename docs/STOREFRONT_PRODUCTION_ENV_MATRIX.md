# Storefront public funnel — production environment matrix

Next.js app (`storefront/`). Values are **server** unless prefixed with `NEXT_PUBLIC_`.

| Variable | Required | Fatal if missing (route behavior) | Degraded behavior |
|----------|----------|-------------------------------------|-------------------|
| `SUPABASE_URL` | Yes (leads, intake, AI telemetry) | `503` on `/api/leads/request-pricing`; `500` on invoice intake if admin client unavailable | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (same) | Same as above | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | — | Invoice intake identity = anonymous-only (no logged-in company link) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | — | Same |
| `OPENAI_API_KEY` | Yes for invoice extract + glove finder | Extract routes fail; intake row may end `extracted_failed` | Intake still creates row; contract shows extraction failure |
| `AI_PROVIDER` | Optional | — | Defaults per `src/lib/ai/provider` |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, … | Optional | — | Leads still **insert**; response `emailDelivered: false` + user-visible warning |
| `SMTP_FROM` | Optional | — | Nodemailer may still send depending on host |
| `ADMIN_EMAIL` | Optional | — | Falls back to `SMTP_USER` / sales address per `getAdminNotificationEmail` |
| `CATALOGOS_INTERNAL_URL` or `NEXT_PUBLIC_CATALOGOS_URL` | Optional for CatalogOS match | — | Matching **skipped**; lines stay `review_required`; intake **still 200** when extract succeeded |
| `INTERNAL_API_KEY` | **Required in production** (CatalogOS) | — | If missing or left as `dev-internal-key` in production/ Vercel production: CatalogOS call **skipped** (no silent dev key) |
| `CATALOGOS_RESOLVE_TIMEOUT_MS` | Optional | — | Default 25_000 ms; clamped 1_000–120_000 |
| `ADMIN_LEADS_SECRET` | For `/admin/*` gate in prod | — | Unrelated to public POST APIs |
| `NEXT_PUBLIC_GLOVECUBS_API` | **Yes** (browser/server calls to Express `server.js` `/api/*`) | — | Relative `/api/...` hits **Next**, not Express — wrong host for cart/checkout |
| `INTERNAL_API_SECRET` | Optional | — | Internal routes only |

## Logging categories (stdout / Vercel logs)

- `catalogos_resolve` — duration, HTTP status, skipped vs failed, line count, opportunity/intake ids (no payloads).
- `invoice_intake` — stages, outcomes, ids, sizes (no file contents).
- `lead_request_pricing` — DB/SMTP/spine outcomes, `correlation_id` + optional `client_trace_id`.

## Operational notes

- **Leads:** DB insert failure → `500` (lead not saved). SMTP failure → `200` + `emailDelivered: false` (lead saved).
- **CatalogOS:** Misconfiguration is **logged** and treated as **skipped** or HTTP error path so invoice upload does not hard-crash.
- **Express** checkout and legacy APIs use the **root** `.env.example`; this matrix covers the **Next storefront** public funnel only.
