# AI API – Example calls (Next storefront)

**Base URL (local):** `http://localhost:3005` — run `npm run dev` from the `storefront/` directory (see repo root `package.json` script `dev:storefront`).

**Production:** your deployed storefront origin (e.g. `https://glovecubs.com`).

---

## 1. Glove Finder (`POST /api/ai/glove-finder`)

Prep-line / catalog-backed flow. Request shape: `storefront/src/lib/ai/schemas.ts` → `GloveFinderRequestSchema`.

### Bash

```bash
curl -X POST "http://localhost:3005/api/ai/glove-finder" \
  -H "Content-Type: application/json" \
  -d '{"useCaseLabel":"Restaurant prep line — food contact, frequent changes","materialPreference":"Nitrile","constraints":"Powder-free"}'
```

### PowerShell (`Invoke-RestMethod`)

```powershell
$body = @{
  useCaseLabel = "Restaurant prep line — food contact, frequent changes"
  materialPreference = "Nitrile"
  constraints = "Powder-free"
} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3005/api/ai/glove-finder" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 60
```

### GET (health, no OpenAI)

```powershell
Invoke-RestMethod -Uri "http://localhost:3005/api/ai/glove-finder" -Method GET
```

If POST fails: check function logs for `OPENAI_API_KEY`, Supabase catalog availability, and timeouts.

---

## 2. Invoice intake — **canonical** (`POST /api/invoice/intake`)

Multipart upload only.

```bash
curl -X POST "http://localhost:3005/api/invoice/intake" \
  -F "file=@/path/to/invoice.png"
```

`POST /api/ai/invoice/extract` on the **same Next host** rewrites to this route for **multipart** legacy callers only (not JSON `{ text }`).

---

## 3. Invoice recommend (`POST /api/ai/invoice/recommend`)

Body: `{ "lines": [ ... ] }` per `invoiceRecommendRequestSchema`.

```bash
curl -X POST "http://localhost:3005/api/ai/invoice/recommend" \
  -H "Content-Type: application/json" \
  -d '{"lines":[{"description":"Nitrile gloves box","quantity":10,"unit_price":18.5,"total":185,"sku_or_code":null}]}'
```

---

## Rate limiting

- 429 when exceeded; JSON may include `retryAfterMs`. Use `Retry-After` (seconds) when present.

## Errors

- 400: validation / invalid JSON.
- 429: rate limited.
- 500: server or upstream failure; body usually includes `error` (string or object).

---

## Express API host (deprecated for these flows)

The monolith `server.js` still defines legacy AI routes for internal migration only. New work must call the **Next** URLs above. Express hits are logged with `category: express_ai_deprecation`.
