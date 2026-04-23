# Supplier Onboarding Agent — Architecture

## Goal

Structured, mostly automated onboarding: create onboarding records, capture company/contact/feed data, create supplier + supplier_feeds, trigger CatalogOS ingestion. Sources: discovery lead, inbound email, or manual entry.

## Workflow States

- **initiated** — Request created
- **waiting_for_supplier** — Awaiting info from supplier
- **ready_for_review** — Data complete, needs admin review
- **approved** — Admin approved; ready to create supplier
- **created_supplier** — Supplier record created
- **feed_created** — supplier_feed created
- **ingestion_triggered** — Pipeline run triggered
- **completed** — Onboarding done
- **rejected** — Rejected

## Data Model

- **supplier_onboarding_requests** — Main record: company name, website, contacts (JSONB or separate), feed_type, feed URL/config, pricing/packaging hints, categories, notes, status, source_lead_id, assigned_owner_id.
- **supplier_onboarding_steps** — Audit trail of state transitions and key events (e.g. "supplier_created", "feed_created").
- **supplier_onboarding_files** — File uploads (PDF catalog, CSV): storage_key, filename, content_type, request_id.

On completion: one row in **suppliers**, one in **supplier_feeds** (and optionally **supplier_contacts**), linked via **created_supplier_id** / **created_feed_id** on the request.

## File structure

```
catalogos/
  supabase/migrations/
    20260322000001_supplier_onboarding.sql
  src/lib/onboarding/
    types.ts
    schemas.ts          # zod create/update
    requests.ts         # CRUD, create supplier/feed, trigger ingestion
    validation.ts       # validateReadyForReview, validateCanCreateSupplier
    index.ts
    validation.test.ts
  src/app/(dashboard)/dashboard/onboarding/
    page.tsx            # list
    new/page.tsx
    new/OnboardingRequestForm.tsx
    [id]/page.tsx       # detail + steps + files
    [id]/OnboardingActions.tsx
  src/app/actions/
    onboarding.ts
```

## Integration

- **Suppliers**: Use existing `catalogos.suppliers` (name, slug, settings). Create via existing `createSupplier`.
- **Feeds**: Use existing `catalogos.supplier_feeds` (supplier_id, feed_type: url/csv/api, config with url/csv_url/feed_url). Ingest API expects POST with `feed_id` or `supplier_id` + `feed_url`.
- **Ingestion**: POST to `/api/ingest` with `{ feed_id }` after feed is created.
