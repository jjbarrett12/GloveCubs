# Phase 1 Storage & Upload Security

| Bucket | Public/private | Allowed uploader | Allowed reader | Path convention | Signed URL TTL | Policies | Risk |
|--------|----------------|------------------|----------------|-----------------|----------------|----------|------|
| `catalog-import-images` | Public | service_role (CatalogOS ingest) | anon/authenticated SELECT | import pipeline keys | N/A (public URL) | `catalog_import_images_public_read` | Low — intentional product imagery |
| `supplier-onboarding` | Private | CatalogOS service role after admin auth | Signed URL after admin auth | `{request_id}/{file_id}_{name}` | Default 3600s in code | Bucket private; DB metadata RLS required | Medium — ensure CatalogOS auth (Phase 0) |
| `invoice-originals` | Private | Intake service_role upload | None (no anon/authenticated SELECT) | `{company_id\|anonymous}/{intake_id}/{sha256}.{ext}` | N/A (no public URL) | Bucket `public=false`; no SELECT policies | Low if service_role stays server-only |
| Customer invoice metadata | N/A (table) | Authenticated intake → service_role insert | Company members via RLS on `uploaded_invoices` | Hash/filename/mime/size + private object path | N/A | Table RLS Phase 1 | Residual: anonymous intake may create rows without company — monitor orphans |

## Decisions

- **Invoice files:** private `invoice-originals` bucket (service_role write only; no public URL). Company-scoped DB rows on `uploaded_invoices` hold hash, filename, MIME, size, and object path.
- **Product images:** may remain public (`catalog-import-images`).
- **Regulatory / compliance evidence:** **internal evidence only** until a product decision and gating exist (launch P0 remains).

## Gaps (documented)

- Malware scanning: **P1** — not implemented; document gap, do not block Phase 1 merge solely on AV.
- Live signed-URL expiry automated test: requires staging credentials — runbook manual step.
