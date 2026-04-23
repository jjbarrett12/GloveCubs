# CatalogOS Admin Review Dashboard

## Route structure

| Route | Purpose |
|-------|--------|
| `/dashboard/batches` | Import batches list with summary cards and table; links to batch detail and review queue filtered by batch |
| `/dashboard/batches/[id]` | Batch detail: summary cards, staged products table, link to Review queue filtered by batch |
| `/dashboard/review` | Staging review queue: filters (supplier, batch, category, status, confidence, anomalies, missing attributes, unmatched), table of staged rows, row click opens detail sheet |
| `/dashboard/review?id=<uuid>` | Same as above with staged product detail sheet open (deep link) |
| `/dashboard/review/[id]` | Redirects to `/dashboard/review?id=<id>` for deep linking |
| `/dashboard/publish` | Publish-ready list: approved staged products |

## API

- `GET /api/review/staging/[id]` – Fetch single staged product with raw payload, master product, supplier (for detail sheet).

## Server data (lib/review/data.ts)

- `getBatchesList(limit)` – Batches with supplier names.
- `getBatchById(id)` – Single batch with supplier.
- `getStagingRows(filters)` – Staged rows with filters; enriches supplier, batch, master product.
- `getStagingById(id)` – Single staged row with raw, master, supplier.
- `getPublishReady(limit)` – Approved staged rows.
- `getSuppliersForFilter()`, `getCategoriesForFilter()` – For filter dropdowns.

## Server actions (app/actions/review.ts)

- `approveMatch(normalizedId, masterProductId)` – Set status approved, link master, log decision.
- `rejectStaged(normalizedId, notes?)` – Set status rejected, log decision.
- `createNewMasterProduct(normalizedId, { sku, name, category_id, ... })` – Insert master product, approve staged row, log.
- `mergeWithStaged(normalizedId, targetMasterProductId)` – Set status merged, log.
- `deferStaged(normalizedId)` – No-op (revalidate only).
- `updateNormalizedAttributes(normalizedId, attributes)` – Merge attributes into normalized row.
- `overridePricing(normalizedId, sellPrice)` – Set override_sell_price in normalized_data.
- `assignCategory(normalizedId, categoryId)` – Set category_id in normalized_data.
- `markForReprocessing(normalizedId)` – Reset status to pending, clear match.

## Filters (Review queue)

- Supplier, Batch ID, Category, Status (pending/approved/rejected/merged).
- Unmatched only, Has anomalies, Missing attributes.
- Confidence min/max (0–1).

## Staged row columns

Supplier, SKU, Raw title, Normalized name, Extracted attributes (material, color, size), Proposed master, Match confidence, Cost, Sell price, Anomaly count, Status.

## Detail sheet

- Supplier, SKU, Raw title, Normalized name, Extracted attributes, Cost / match confidence.
- Master product match preview (link to master catalog).
- Anomalies list.
- Primary actions: Approve match, Create new master, Merge with…, Reject.
- Quick actions: Override sell price, Assign category, Mark for reprocessing.

## Badge / status colors

- Batch: completed = success (green), failed = destructive (red), running = warning (amber).
- Staging status: approved = success, rejected = destructive, pending/merged = secondary.
- Confidence: ≥ 0.6 = emerald, &lt; 0.6 = amber.
