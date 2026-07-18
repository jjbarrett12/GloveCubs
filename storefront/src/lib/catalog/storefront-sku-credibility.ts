/**
 * Customer-facing SKU credibility gates for quote-first pilot.
 * Hide launch/demo/unknown identity from the public catalog until operators republish clean SKUs.
 */

const LAUNCH_SKU_RE = /^GLV-LAUNCH/i;
const UNKNOWN_SKU_RE = /^(UNKNOWN|N\/?A|-|TBD|TEMP|TEST)$/i;

export function isCustomerCredibleSku(sku: string | null | undefined): boolean {
  const s = typeof sku === "string" ? sku.trim() : "";
  if (!s) return false;
  if (UNKNOWN_SKU_RE.test(s)) return false;
  if (LAUNCH_SKU_RE.test(s)) return false;
  return true;
}

/** Product is storefront-credible when parent or default variant SKU is customer-safe. */
export function isStorefrontCredibleProduct(input: {
  internalSku?: string | null;
  variantSku?: string | null;
}): boolean {
  const variantOk = isCustomerCredibleSku(input.variantSku);
  const parentOk = isCustomerCredibleSku(input.internalSku);
  // Prefer variant identity when present; allow parent-only when no variant SKU yet.
  if (input.variantSku != null && String(input.variantSku).trim() !== "") {
    return variantOk;
  }
  return parentOk;
}

export function storefrontCredibilityBlockReason(input: {
  internalSku?: string | null;
  variantSku?: string | null;
}): string | null {
  if (isStorefrontCredibleProduct(input)) return null;
  const sku = (input.variantSku || input.internalSku || "").trim();
  if (!sku) return "missing_sku";
  if (LAUNCH_SKU_RE.test(sku)) return "launch_sku";
  if (UNKNOWN_SKU_RE.test(sku)) return "unknown_sku";
  return "invalid_sku";
}
