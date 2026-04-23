# Sync Lifecycle Tracking + Backlog Control

## Goal

One clear lifecycle from sync detection to live catalog application; prevent stale or duplicate review backlog. Track status, supersession, and audit; strengthen discontinued application; upgrade operations to a true work queue with aging and priority.

## Lifecycle status (catalog_sync_item_results)

- **pending**: Awaiting promotion (new/changed) or resolution (rejected/approved).
- **promoted**: Promoted to staging; staged row exists (promoted_normalized_id).
- **in_review**: Promoted and staged row status = pending (in review queue).
- **approved**: Staged row approved (master_product_id set).
- **published**: Staged row published to live catalog.
- **rejected**: Sync item rejected (no promotion).
- **superseded**: Replaced by a newer sync result for same supplier+external_id; superseded_by_sync_item_result_id points to the newer result.

Links: promoted_normalized_id, published_product_id (when published), superseded_by_sync_item_result_id (when superseded).

## Supersession logic

When the same (supplier_id, external_id) is detected again in a **later** sync run and there is already an **unresolved** item (lifecycle in pending, promoted, in_review):

- Mark the **older** sync item as **superseded** and set superseded_by_sync_item_result_id = the **new** sync item id.
- Insert the new result as usual (pending). No duplicate pending work; the latest run owns the current state.
- Preserve audit: old row keeps prior links; new row is the one to promote/review.

## Discontinued application (stronger)

Find supplier_offers to discontinue by, in order:

1. **normalized_id** = prior_normalized_id (primary).
2. **supplier_id + supplier_sku**: From prior raw/normalized (supplier_sku or external_id); match supplier_offers.supplier_id and supplier_offers.supplier_sku.
3. **product_id**: If prior_normalized_id’s row has master_product_id, offers for that product from this supplier (by supplier_id + product_id).

Apply is_active = false, discontinued_at, discontinued_reason; full audit.

## Operations command center v2

- Pending sync promotions (lifecycle = pending, new/changed).
- Promoted but unreviewed (lifecycle = promoted or in_review, staged row still pending).
- Items blocked by missing required attributes (staged rows with anomaly_flags containing missing_required).
- Pending duplicate master warnings.
- Failed import/sync/match runs.
- Stale items by age: 1d, 3d, 7d+ (by created_at or run started_at).
- Discontinued confirmations pending (pending_review).
- Direct action links and priority ordering (e.g. failed first, then stale 7d+, then pending promotions).

## Principles

- Single source of truth per (supplier_id, external_id) for unresolved work: the latest sync result.
- Lifecycle transitions are explicit (promotion, review actions, publish); status can be derived or updated on action.
- No silent overwrite; supersession is recorded.

## Audit notes

- **Lifecycle**: lifecycle_status and lifecycle_updated_at record current state; superseded_by_sync_item_result_id points to the newer result that replaced this one; published_product_id set when the promoted row is published.
- **Supersession**: When a new sync run produces a (new/changed) result for the same supplier+external_id, any older unresolved sync item (same feed/supplier, earlier run) is updated to lifecycle_status = superseded and superseded_by_sync_item_result_id = new item id. No duplicate pending work; the latest run owns the item.
- **Discontinued fallback**: Offers are found by (1) normalized_id, (2) supplier_id + supplier_sku from prior raw/normalized or external_id, (3) supplier_id + product_id from prior normalized’s master_product_id. All updated offers get discontinued_at and discontinued_reason for audit.
