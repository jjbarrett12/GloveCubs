import {
  fulfillmentConfigFromRow,
  isStorefrontQuantityVisible,
  isStorefrontStatusVisible,
  isVariantPurchasableAtZeroLocalStock,
  type VariantFulfillmentConfig,
} from "@/lib/fulfillment/variant-fulfillment-config";

export type StorefrontInventoryDisplay = {
  showQuantity: boolean;
  showStatus: boolean;
  purchasableAtZeroStock: boolean;
};

export function resolveStorefrontInventoryDisplay(
  variantRow: Record<string, unknown> | null | undefined,
  localAvailable: number | null | undefined,
): StorefrontInventoryDisplay {
  const config = fulfillmentConfigFromRow(variantRow);
  return resolveStorefrontInventoryDisplayFromConfig(config, localAvailable);
}

export function resolveStorefrontInventoryDisplayFromConfig(
  config: VariantFulfillmentConfig,
  localAvailable: number | null | undefined,
): StorefrontInventoryDisplay {
  const available = Math.max(0, Number(localAvailable ?? 0) || 0);
  const purchasableAtZeroStock = isVariantPurchasableAtZeroLocalStock(config);
  const showQuantity = isStorefrontQuantityVisible(config);
  const showStatus =
    isStorefrontStatusVisible(config) &&
    (purchasableAtZeroStock || available > 0 || config.fulfillmentMode === "stocked");

  return {
    showQuantity: showQuantity && available > 0,
    showStatus,
    purchasableAtZeroStock,
  };
}

/** Default storefront policy: never expose quantity unless explicitly configured. */
export function defaultStorefrontHidesQuantity(): boolean {
  return true;
}
