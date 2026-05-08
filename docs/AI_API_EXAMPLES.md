# AI & procurement APIs — canonical (Next storefront)

**Customer and operator flows:** use the **Next storefront** origin (production: `https://glovecubs.com` or your Vercel URL). Local dev default: `http://localhost:3005` (`npm run dev` in `storefront/`).

**Browser entry points (preferred):**

- Glove Finder (prep-line / catalog-backed): `https://glovecubs.com/glove-finder`
- Invoice savings (multipart upload, canonical intake): `https://glovecubs.com/invoice-savings`

**Do not** point new integrations at the legacy Express HTML host for these journeys. The legacy SPA shows a **migration screen** only for `/glove-finder` and `/invoice-savings` if someone still loads it.

---

## 1) `POST /api/ai/glove-finder` (Next — prep-line)

JSON body must satisfy `GloveFinderRequestSchema` (see `storefront/src/lib/ai/schemas.ts`). Minimal example:

```json
{
  "useCaseLabel": "Restaurant prep line — frequent glove changes, food contact",
  "materialPreference": "Nitrile",
  "constraints": "Powder-free; need good wet grip"
}
```

```bash
curl -X POST "http://localhost:3005/api/ai/glove-finder" \
  -H "Content-Type: application/json" \
  -d "{\"useCaseLabel\":\"Restaurant prep line — nitrile, food contact\",\"materialPreference\":\"Nitrile\"}"
```

GET on the same path returns a small JSON health payload (no OpenAI call).

---

## 2) `POST /api/invoice/intake` (Next — **canonical** invoice pipeline)

Multipart file upload (not JSON `text`). See `storefront/src/lib/invoice/run-intake-from-request.ts`.

```bash
curl -X POST "http://localhost:3005/api/invoice/intake" \
  -F "file=@/path/to/invoice.pdf"
```

`POST /api/ai/invoice/extract` on the **Next** host rewrites to `/api/invoice/intake` for **multipart** callers only (legacy path compatibility). There is **no** supported public “paste text” intake on Next.

---

## 3) `POST /api/ai/invoice/recommend` (Next — savings from line items)

Request body: `{ "lines": [ ... ] }` per `invoiceRecommendRequestSchema` in `storefront/src/lib/ai/schemas.ts`.

```bash
curl -X POST "http://localhost:3005/api/ai/invoice/recommend" \
  -H "Content-Type: application/json" \
  -d "{\"lines\":[{\"description\":\"Nitrile exam gloves 100ct\",\"quantity\":10,\"unit_price\":12.5,\"total\":125,\"sku_or_code\":null}]}"
```

---

## Rate limits

- AI routes on Next use shared rate limiting (429 + `retryAfterMs` / `Retry-After` where applicable). See `storefront/src/lib/ai/middleware.ts`.

---

## Express `server.js` AI routes (deprecated)

`POST /api/ai/glove-finder`, `POST /api/ai/invoice/extract`, and `POST /api/ai/invoice/recommend` on the **Node/Express API** host remain for backward compatibility and emit structured logs (`category: express_ai_deprecation`) when hit. They are **not** documented here for new customer or public integrations. Remove usage in application code, then drive traffic to zero before deleting the routes.
