import type { StoreProductRow } from "@/lib/catalog/store-products";

/** Single catalog-backed line for prep-line cards / comparison matrix — no inference. */
export type PrepLineCardFact = { label: string; value: string };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/**
 * Deterministic projection from listing row only. Omits absent facts (no N/A walls).
 * Mil / texture / powder / case qty are omitted unless present on future row shapes.
 */
export function projectPrepLineCardFacts(row: StoreProductRow): PrepLineCardFact[] {
  const out: PrepLineCardFact[] = [];

  if (row.materialHint?.trim()) {
    out.push({ label: "Material (listing)", value: row.materialHint.trim() });
  }
  if (row.commercialUseSummary?.trim()) {
    out.push({ label: "Uses (catalog listing)", value: row.commercialUseSummary.trim() });
  }
  const certs = [...row.certificationHints].map((c) => String(c).trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  for (const c of certs) {
    out.push({ label: "Certification (listing)", value: c });
  }
  if (row.protectionHint?.trim()) {
    out.push({ label: "Protection tag (listing)", value: row.protectionHint.trim() });
  }
  if (row.variantSku?.trim()) {
    out.push({ label: "Variant SKU", value: row.variantSku.trim() });
  } else if (row.internalSku?.trim()) {
    out.push({ label: "Internal SKU", value: row.internalSku.trim() });
  }
  if (row.sizeCode?.trim()) {
    out.push({ label: "Default size on listing", value: row.sizeCode.trim() });
  }
  if (row.brandName?.trim()) {
    out.push({ label: "Brand", value: row.brandName.trim() });
  }
  if (row.bestPrice != null && Number.isFinite(row.bestPrice) && row.bestPrice > 0) {
    out.push({ label: "List-style price (when published)", value: usd.format(row.bestPrice) });
  }

  return out;
}
