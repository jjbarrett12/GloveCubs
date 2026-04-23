import type { PublishFailureStage } from "@/lib/publish/publish-result-stage";

/** Short operator guidance after classifyPublishErrorMessage. */
export function publishFailureOperatorNextStep(stage: PublishFailureStage): string {
  switch (stage) {
    case "attribute_sync":
    case "snapshot":
      return "Review required merchandising attributes and conflicting values.";
    case "supplier_offers":
    case "case_pricing":
      return "Check case pricing, supplier pricing, and offer inputs.";
    case "catalog_integrity":
    case "search_sync":
      return "Product may be partially updated. Refresh and retry publish.";
    case "preflight_attributes":
      return "Fix merchandising or validation issues shown above, save changes, then retry.";
    case "product_record":
      return "Verify the master product and category, then retry publish.";
    default:
      return "Review the error below, adjust staging if needed, then retry publish.";
  }
}
