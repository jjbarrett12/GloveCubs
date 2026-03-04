# Supabase health and Save product API

Set **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** in `.env` (local) or host env (Vercel/Railway). The service role key may be JWT (`eyJ...`) or `sb_secret_...` — never commit the real key.

## Health check

Confirms Supabase env vars are set and a minimal query works. **Requires admin auth.**

```bash
# Replace YOUR_JWT with a token from POST /api/auth/login (admin user)
curl -s -X GET "http://localhost:3004/api/admin/supabase/health" \
  -H "Authorization: Bearer YOUR_JWT"
```

**Success:** `{"ok":true}`  
**Not configured:** `{"ok":false,"error":"SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set"}`  
**DB error:** `{"ok":false,"error":"..."}`

## Save product (URL-fetched draft)

**Requires admin auth.** Uses server-only Supabase admin client (service role). Always returns JSON.

```bash
# Replace YOUR_JWT with admin token
curl -s -X POST "http://localhost:3004/api/admin/products/save" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "TEST-SKU-001",
    "name": "Test Nitrile Gloves",
    "brand": "Test Brand",
    "description": "Optional description",
    "image_urls": ["https://example.com/img1.jpg"],
    "category": "Disposable Gloves",
    "subcategory": "Exam"
  }'
```

**Success:** `{"success":true,"action":"created","sku":"TEST-SKU-001"}` or `"action":"updated"`  
**Validation:** `400` + `{"error":"sku and name are required"}`  
**Supabase not configured:** `500` + `{"error":"Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Configure .env (local) or host env vars (prod)."}`

## PowerShell (Windows)

```powershell
$token = "YOUR_JWT"
Invoke-RestMethod -Uri "http://localhost:3004/api/admin/supabase/health" -Headers @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method POST -Uri "http://localhost:3004/api/admin/products/save" -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body '{"sku":"TEST-001","name":"Test Product"}' -ContentType "application/json"
```
