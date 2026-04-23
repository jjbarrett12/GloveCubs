/**
 * Maps runPublish / variant-group publish error strings to operator-facing failure stages.
 * Keep in sync with messages in publish-service.ts and publish-variant-group.ts.
 */

export type PublishFailureStage =
  | "preflight_attributes"
  | "case_pricing"
  | "product_record"
  | "attribute_sync"
  | "snapshot"
  | "supplier_offers"
  | "catalog_integrity"
  | "search_sync"
  | "other";

export function classifyPublishErrorMessage(message: string | undefined): PublishFailureStage {
  if (!message || !message.trim()) return "other";
  const m = message;
  if (/missing required attributes|Cannot publish: missing required/i.test(m)) return "preflight_attributes";
  if (/GloveCubs sells by the case|normalized case cost|case cost could not be computed|pricingCaseCostUnavailable/i.test(m))
    return "case_pricing";
  if (/product_attributes sync failed/i.test(m)) return "attribute_sync";
  if (/refresh product attributes snapshot|product attributes snapshot/i.test(m)) return "snapshot";
  if (/Supplier offer:/i.test(m)) return "supplier_offers";
  if (/live_product_id|commerce bridge|Cart and checkout require|legacy_commerce|Publish blocked \(variant\):/i.test(m))
    return "catalog_integrity";
  if (/storefront search is NOT synced|search is NOT synced|searchPublishStatus|finalizePublishSearchSync/i.test(m))
    return "search_sync";
  if (
    /Master product not found|Product update:|Product insert|category_id missing|Either masterProductId or newProductPayload/i.test(m)
  )
    return "product_record";
  return "other";
}

const STAGE_LABELS: Record<PublishFailureStage, string> = {
  preflight_attributes: "Preflight: required merchandising attributes",
  case_pricing: "Case pricing / normalized case cost",
  product_record: "Product record (load, update, or insert)",
  attribute_sync: "Canonical product_attributes sync",
  snapshot: "products.attributes snapshot (mirror)",
  supplier_offers: "Supplier offer upsert",
  catalog_integrity: "Catalog integrity (legacy bridge errors; V2 = catalogos only)",
  search_sync: "Storefront search sync",
  other: "Publish pipeline",
};

export function publishFailureStageTitle(stage: PublishFailureStage): string {
  return STAGE_LABELS[stage];
}
