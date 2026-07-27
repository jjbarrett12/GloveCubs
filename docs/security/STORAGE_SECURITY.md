# Phase 1 Storage & Upload Security

| Bucket | Public/private | Allowed uploader | Allowed reader | Path convention | Signed URL TTL | Policies | Risk |
|--------|----------------|------------------|----------------|-----------------|----------------|----------|------|
| `catalog-import-images` | Public | service_role (CatalogOS ingest) | anon/authenticated SELECT | import pipeline keys | N/A (public URL) | `catalog_import_images_public_read` | Low — intentional product imagery |
| `supplier-onboarding` | Private | CatalogOS service role after admin auth | Signed URL after admin auth | `{request_id}/{file_id}_{name}` | Default 3600s in code | Bucket private; DB metadata RLS required | Medium — ensure CatalogOS auth (Phase 0) |
| Customer invoice files | N/A (no dedicated public bucket) | Authenticated intake → service_role insert | Company members via RLS on `uploaded_invoices` | Content/hash in DB payload | N/A | Table RLS Phase 1 | Residual: anonymous intake may create rows without company — monitor orphans |

## Decisions

- **Invoice files:** private; company-scoped DB rows; not path-guessable storage objects for customer invoices.
- **Product images:** may remain public (`catalog-import-images`).
- **Regulatory / compliance evidence:** **internal evidence only** until a product decision and gating exist (launch P0 remains).

## Gaps (documented)

- Malware scanning: **P1** — not implemented; document gap, do not block Phase 1 merge solely on AV.
- Live signed-URL expiry automated test: requires staging credentials — runbook manual step.
