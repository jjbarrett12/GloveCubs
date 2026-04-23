/**
 * Map createNewMasterProduct / catalogos.products insert failures to operator-facing copy.
 */

const DUPLICATE_SKU_PRIMARY =
  "That SKU already exists on another product record. Use a different SKU or merge with the existing product.";

export function formatMasterProductCreateError(raw: string | undefined): { primary: string; secondary?: string } {
  if (!raw?.trim()) return { primary: "Create product record failed." };
  const m = raw.trim();
  const lower = m.toLowerCase();
  const looksLikeSkuUnique =
    (/duplicate key|unique constraint|violates unique|already exists/.test(lower) && /sku|\(sku\)/i.test(m)) ||
    /products?_sku|uq_.*sku|unique.*sku|key \(sku\)/i.test(m);
  if (looksLikeSkuUnique) {
    return { primary: DUPLICATE_SKU_PRIMARY, secondary: m };
  }
  return { primary: m };
}
