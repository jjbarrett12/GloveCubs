import type { AdminPurchaseOrderLine } from "@/lib/admin/admin-purchase-orders";

export type PoLineVariantCandidate = {
  catalog_variant_id: string;
  variant_sku: string;
  size_code: string | null;
};

export type ResolvedPoLineVariant = {
  line_index: number;
  line: AdminPurchaseOrderLine;
  catalog_variant_id: string | null;
  needs_sku_assignment: boolean;
  auto_assignable_variant_id: string | null;
  candidate_variants: PoLineVariantCandidate[];
};

/** Resolve PO lines: auto-map only when exactly one active purchasable variant exists. */
export function resolvePoLineVariants(
  lines: AdminPurchaseOrderLine[],
  variantsByProductId: Map<string, PoLineVariantCandidate[]>,
): ResolvedPoLineVariant[] {
  return (lines ?? []).map((line, line_index) => {
    if (line.catalog_variant_id) {
      return {
        line_index,
        line,
        catalog_variant_id: String(line.catalog_variant_id),
        needs_sku_assignment: false,
        auto_assignable_variant_id: null,
        candidate_variants: [],
      };
    }

    const productId = line.canonical_product_id || line.product_id;
    const candidates = productId ? variantsByProductId.get(String(productId)) ?? [] : [];
    const autoId = candidates.length === 1 ? candidates[0]!.catalog_variant_id : null;

    return {
      line_index,
      line,
      catalog_variant_id: autoId,
      needs_sku_assignment: candidates.length !== 1,
      auto_assignable_variant_id: autoId,
      candidate_variants: candidates,
    };
  });
}

export function poLinesReadyForWarehouseReceive(resolved: ResolvedPoLineVariant[]): boolean {
  return resolved.every((r) => !r.needs_sku_assignment && Boolean(r.catalog_variant_id));
}
