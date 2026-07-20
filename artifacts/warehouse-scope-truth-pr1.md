# Warehouse-module scope truth (PR #1)

**Tip context:** quote-first remediation includes inventory/fulfillment modules that were imported by `main` @ `32d039f` but not present as blobs on that commit (broken compile integrity).

## Classification

| File | Classification | Imported by (main) | Required for pilot | Keep/remove |
|------|----------------|--------------------|--------------------|-------------|
| `InventoryModuleClient.tsx` | Required for main compile integrity | `admin/inventory/page.tsx` | No (admin only) | **Keep** |
| `InventoryAdjustModal.tsx` | Required for InventoryModuleClient | Inventory UI | No | **Keep** |
| `inventory-module.policy.test.ts` | Test-only containment | — | No | **Keep** |
| `admin-variant-inventory.ts` | Required for main compile integrity | inventory page + adjust API | No | **Keep** |
| `VariantFulfillmentPanel.tsx` | Required for main compile integrity | `ProductEditorShell.tsx` | No | **Keep** |
| `variant-fulfillment-admin.ts` | Required by VariantFulfillmentPanel | product editor | No | **Keep** |
| `derive-product-impact-performance.ts` | Supporting admin product editor | ProductImpactPreviewPanel | No | **Keep** |
| `legacy-warehouse-write-policy.test.ts` | Test-only containment | — | No | **Keep** |
| `po-line-variant-resolution.ts` (+test) | Required by warehouse-launch containment tests / admin PO path | fulfillment helpers | No | **Keep** |
| `storefront-inventory-display.ts` (+test) | Containment: hide qty by default | storefront display | Soft | **Keep** |
| `variant-fulfillment-config.ts` (+test) | Containment helpers | inventory display | Soft | **Keep** |
| `lib/legacy-warehouse-deprecation.js` | Required for main compile integrity | `lib/inventory.js` (main already requires it; blob missing on main) | No — blocks legacy writes | **Keep** |

## Decision

**Keep** all listed modules. They restore `main` imports; they do **not** merge `release/warehouse-variant-inventory`, add warehouse migrations, or enable customer-facing warehouse promises. Storefront quantity remains hidden by default (`defaultStorefrontHidesQuantity`).

```text
WAREHOUSE RELEASE BRANCHES INCLUDED: NO
WAREHOUSE MIGRATIONS INCLUDED: NO
SUPPORTING ADMIN MODULES INCLUDED: YES (compile integrity)
CUSTOMER-FACING WAREHOUSE ENABLED: NO
GATE 7: NO-GO
```

Do **not** claim “warehouse excluded” for this PR. Claim: **warehouse release branches remain parked; supporting admin modules included for main compile integrity.**
