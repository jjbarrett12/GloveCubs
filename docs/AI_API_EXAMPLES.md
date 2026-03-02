# AI API – Example requests

Base URL: `http://localhost:3004` (or your `DOMAIN`).  
For authenticated requests, set header: `Authorization: Bearer <JWT>`.

---

## 1) POST /api/ai/glove-finder

**Request (JSON):**

```json
{
  "industry": "Healthcare",
  "use_case": "Exam gloves, high volume",
  "material_preference": "Nitrile",
  "quantity_per_month": 5000,
  "constraints": "Powder-free, FDA compliant"
}
```

**Example curl:**

```bash
curl -X POST http://localhost:3004/api/ai/glove-finder \
  -H "Content-Type: application/json" \
  -d '{"industry":"Healthcare","use_case":"Exam gloves","material_preference":"Nitrile"}'
```

**Response (200):**

```json
{
  "recommendations": [
    {
      "sku": null,
      "name": "Nitrile Exam Gloves, Powder-Free",
      "brand": "Hospeco",
      "reason": "Fits healthcare exam use, nitrile, powder-free."
    }
  ],
  "summary": "Recommendations for healthcare nitrile exam gloves."
}
```

---

## 2) POST /api/ai/invoice/extract

**Request (JSON):** Send invoice text only (no raw PII stored in logs by default).

```json
{
  "text": "Invoice #INV-001\nVendor: Acme Gloves\nDate: 2024-01-15\n\nNitrile Gloves 100ct x 50 boxes @ 12.99 = 649.50\nVinyl Gloves 100ct x 20 boxes @ 4.99 = 99.80\nTotal: 749.30",
  "file_name": "invoice_jan.pdf"
}
```

**Example curl:**

```bash
curl -X POST http://localhost:3004/api/ai/invoice/extract \
  -H "Content-Type: application/json" \
  -d '{"text":"Invoice #INV-001\nVendor: Acme\nNitrile Gloves 100ct x 50 @ 12.99 = 649.50\nTotal: 649.50"}'
```

**Response (200):**

```json
{
  "vendor_name": "Acme",
  "invoice_number": "INV-001",
  "date": "2024-01-15",
  "total_amount": 749.3,
  "lines": [
    { "description": "Nitrile Gloves 100ct", "quantity": 50, "unit_price": 12.99, "total": 649.5, "sku_or_code": null },
    { "description": "Vinyl Gloves 100ct", "quantity": 20, "unit_price": 4.99, "total": 99.8, "sku_or_code": null }
  ],
  "upload_id": 1
}
```

---

## 3) POST /api/ai/invoice/recommend

**Request (JSON):** Pass the `extract` object from step 2.

```json
{
  "extract": {
    "vendor_name": "Acme",
    "invoice_number": "INV-001",
    "lines": [
      { "description": "Nitrile Gloves 100ct", "quantity": 50, "unit_price": 12.99, "total": 649.5 }
    ]
  },
  "upload_id": 1,
  "product_catalog_summary": "Nitrile exam gloves, vinyl gloves, reusable work gloves."
}
```

**Example curl:**

```bash
curl -X POST http://localhost:3004/api/ai/invoice/recommend \
  -H "Content-Type: application/json" \
  -d '{"extract":{"vendor_name":"Acme","lines":[{"description":"Nitrile Gloves 100ct","quantity":50,"unit_price":12.99,"total":649.5}]}}'
```

**Response (200):**

```json
{
  "recommendations": [
    {
      "line_index": 0,
      "current_product": "Nitrile Gloves 100ct",
      "recommended_sku": "GLV-500G",
      "recommended_name": "Nitrile Exam Gloves Powder-Free",
      "brand": "Hospeco",
      "estimated_savings": 50,
      "reason": "Same spec, lower cost in bulk."
    }
  ],
  "total_estimated_savings": 50,
  "summary": "One swap recommended."
}
```

---

## Rate limits

- **30 requests per 15 minutes** per IP (or per user when `Authorization: Bearer <JWT>` is sent).
- 429 response: `{ "error": "Too many AI requests. Please try again later." }`.

## Env (server)

- `AI_PROVIDER=openai` (default) or `gemini`
- `OPENAI_API_KEY=sk-...` (required for OpenAI)
- `OPENAI_MODEL=gpt-4o-mini` (optional)
- `GEMINI_API_KEY=...` (when using Gemini; provider not implemented yet)
