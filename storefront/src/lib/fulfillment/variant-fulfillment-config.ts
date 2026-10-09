export type FulfillmentMode = "dropship" | "stocked";
export type InventoryVisibility = "hidden" | "status" | "quantity";
export type PurchaseOrderType = "inbound_stock" | "dropship_fulfillment";

export type VariantFulfillmentConfig = {
  fulfillmentMode: FulfillmentMode;
  inventoryTracking: boolean;
  inventoryVisibility: InventoryVisibility;
  stockEnforcement: boolean;
  defaultLocationCode: string;
  defaultBinLocation: string | null;
  reorderPoint: number;
};

const MODES: FulfillmentMode[] = ["dropship", "stocked"];
const VISIBILITIES: InventoryVisibility[] = ["hidden", "status", "quantity"];

function parseMode(raw: unknown): FulfillmentMode {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "hybrid") return "dropship";
  if (MODES.includes(s as FulfillmentMode)) return s as FulfillmentMode;
  return "dropship";
}

function parseVisibility(raw: unknown): InventoryVisibility {
  const s = String(raw ?? "").trim().toLowerCase();
  if (VISIBILITIES.includes(s as InventoryVisibility)) return s as InventoryVisibility;
  return "hidden";
}

export function deriveInventoryTracking(mode: FulfillmentMode): boolean {
  return mode === "stocked";
}

export function fulfillmentConfigFromRow(row: Record<string, unknown> | null | undefined): VariantFulfillmentConfig {
  const mode = parseMode(row?.fulfillment_mode);
  return {
    fulfillmentMode: mode,
    inventoryTracking: deriveInventoryTracking(mode),
    inventoryVisibility: parseVisibility(row?.inventory_visibility),
    stockEnforcement: row?.stock_enforcement === true,
    defaultLocationCode:
      typeof row?.default_location_code === "string" && row.default_location_code.trim()
        ? row.default_location_code.trim()
        : "default",
    defaultBinLocation:
      typeof row?.default_bin_location === "string" && row.default_bin_location.trim()
        ? row.default_bin_location.trim()
        : null,
    reorderPoint: Math.max(0, Number(row?.reorder_point ?? 0) || 0),
  };
}

export function isVariantPurchasableAtZeroLocalStock(config: VariantFulfillmentConfig): boolean {
  if (config.stockEnforcement) return false;
  return config.fulfillmentMode === "dropship";
}

export function shouldReserveWarehouseStock(config: VariantFulfillmentConfig): boolean {
  if (config.fulfillmentMode !== "stocked") return false;
  return config.inventoryTracking;
}

export function isStorefrontQuantityVisible(config: VariantFulfillmentConfig): boolean {
  return config.inventoryVisibility === "quantity";
}

export function isStorefrontStatusVisible(config: VariantFulfillmentConfig): boolean {
  return config.inventoryVisibility === "status" || config.inventoryVisibility === "quantity";
}

export const INVENTORY_UOM_CASE = "case" as const;
