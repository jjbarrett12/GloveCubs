/**
 * Strip pricing / money fields from objects merged into catalog_v2.catalog_products.metadata on ingest publish.
 * Pricing lives only on gc_commerce.sellable_products.
 */

const TOP_LEVEL_PRICING_KEYS = new Set([
  "list_price",
  "bulk_price",
  "unit_cost",
  "cost",
  "retail_price",
  "price",
  "supplier_cost",
  "normalized_case_cost",
  "override_sell_price",
  "sell_price",
  "case_price",
  "unit_price",
  "msrp",
  "map",
  "landed_cost",
  "tier_a_price",
  "tier_b_price",
  "tier_c_price",
  "tier_d_price",
  "import_auto_pricing",
  "pricing_manual_override",
  "pricing",
  "computed_sell_price",
  "display_tier_price",
]);

/**
 * Shallow clone omitting top-level pricing keys (and nested pricing blobs).
 */
export function stripPricingKeysForV2ProductMetadata(
  attrs: Record<string, unknown>,
  norm: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries({ ...attrs, ...norm })) {
    if (TOP_LEVEL_PRICING_KEYS.has(k)) continue;
    out[k] = v;
  }
  const facet = out.facet_attributes;
  if (facet && typeof facet === "object" && !Array.isArray(facet)) {
    const f = { ...(facet as Record<string, unknown>) };
    for (const pk of TOP_LEVEL_PRICING_KEYS) delete f[pk];
    out.facet_attributes = f;
  }
  for (const pk of TOP_LEVEL_PRICING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(out, pk)) {
      throw new Error(`v2 product metadata must not contain pricing key "${pk}"`);
    }
  }
  return out;
}
