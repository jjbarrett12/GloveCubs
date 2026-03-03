# AI API – Example calls

Base URL: `http://localhost:3000` (or your deployment origin).

## 1. Glove Finder (SKU recommendations)

### Bash / WSL / Git Bash
```bash
curl -X POST http://localhost:3000/api/ai/glove-finder \
  -H "Content-Type: application/json" \
  -d '{
    "industry": "janitorial",
    "hazards": ["chemicals", "wet surfaces"],
    "latexAllergy": true,
    "budgetLevel": "medium"
  }'
```

### PowerShell (Windows)
In PowerShell, `curl` is an alias for `Invoke-WebRequest` and uses different syntax. Use **one** of these:

**Using real curl (if installed):**
```powershell
curl.exe -X POST http://localhost:3000/api/ai/glove-finder -H "Content-Type: application/json" -d '{\"industry\": \"janitorial\", \"hazards\": [\"chemicals\", \"wet surfaces\"], \"latexAllergy\": true, \"budgetLevel\": \"medium\"}'
```

**Using Invoke-RestMethod (no curl needed)** – use `http://localhost:3000` when running the storefront locally:
```powershell
$body = @{
  industry     = "janitorial"
  hazards      = @("chemicals", "wet surfaces")
  latexAllergy = $true
  budgetLevel  = "medium"
} | ConvertTo-Json
# -TimeoutSec 60: allow time for the AI call
Invoke-RestMethod -Uri "http://localhost:3000/api/ai/glove-finder" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 60
```

If you see **"The connection was closed unexpectedly"** (localhost or live site):

1. **Check that the route is reachable** – call with GET (no body). For local: `http://localhost:3000/api/ai/glove-finder`; for production: `https://glovecubs.com/api/ai/glove-finder`.
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/ai/glove-finder" -Method GET
   ```
   If you get `{ ok: true, service: "glove-finder", ... }`, the route is up; the failure is likely during the POST (e.g. OpenAI call or timeout).

2. **Use `-TimeoutSec 60`** so the client waits long enough for the AI response.

3. **Server/env**: In Vercel (or your host), check **Function logs** for the request (timeout, `OPENAI_API_KEY` missing, or model errors). Set **Environment Variables**: `OPENAI_API_KEY` required; optional `OPENAI_MODEL` (default `gpt-4o-mini`; use `gpt-4.1-mini` if your tier supports it).

4. **Proxy/CDN**: If something sits in front of the app (e.g. Cloudflare), increase timeout for `/api/*` or bypass cache for `/api/ai/glove-finder`.

Response (200):
```json
{
  "constraints": ["latex-free", "chemical-resistant"],
  "top_picks": [
    { "sku": "GC-NIT-6", "reason": "Nitrile 6mil fits janitorial and chemical exposure.", "tradeoffs": [] },
    { "sku": "GC-NIT-8", "reason": "Heavier duty for wet surfaces.", "tradeoffs": ["Higher price"] }
  ],
  "followup_questions": ["Do you need long cuffs?"]
}
```

## 2. Invoice extract (upload image/PDF)

```bash
curl -X POST http://localhost:3000/api/ai/invoice/extract \
  -F "file=@/path/to/invoice.png"
# or: -F "invoice=@/path/to/invoice.pdf"
```

Response (200):
```json
{
  "vendor_name": "Acme Supply",
  "invoice_number": "INV-001",
  "total_amount": 450.00,
  "lines": [
    { "description": "Nitrile gloves box", "quantity": 10, "unit_price": 18.50, "total": 185.00, "sku_or_code": null }
  ]
}
```

## 3. Invoice recommend (savings from extracted lines)

```bash
curl -X POST http://localhost:3000/api/ai/invoice/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "lines": [
      { "description": "Nitrile gloves box", "quantity": 10, "unit_price": 18.50, "total": 185.00, "sku_or_code": null }
    ]
  }'
```

Response (200):
```json
{
  "total_current_estimate": 185,
  "total_recommended_estimate": 142,
  "estimated_savings": 43,
  "swaps": [
    {
      "line_index": 0,
      "current_description": "Nitrile gloves box",
      "recommended_sku": "GC-NIT-6",
      "recommended_name": "Nitrile Exam Glove",
      "brand": null,
      "estimated_savings": 4.30,
      "reason": "Same spec, lower unit price.",
      "confidence": 0.92
    }
  ]
}
```

## Rate limiting

- 429 when exceeded. Response includes `retryAfterMs`. Use header `Retry-After` (seconds) when present.

## Errors

- 400: Invalid JSON or body (e.g. missing `lines` for recommend).
- 429: Too many requests.
- 500: AI or server error; body has `error` string.
