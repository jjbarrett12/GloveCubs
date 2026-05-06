"use client";

import { Button } from "@/components/ui/button";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import type { StoreProductRow } from "@/lib/catalog/store-products";

export function AddVisiblePageToQuote({ products }: { products: StoreProductRow[] }) {
  const { addItems } = useQuoteCart();
  if (products.length === 0) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 border-white/20 text-[11px] text-white hover:bg-white/10"
      onClick={() => {
        addItems(
          products.map((p) => ({
            product_id: p.id,
            name: p.name,
            slug: p.slug,
            brandName: p.brandName,
            catalog_variant_id: p.catalogVariantId ?? undefined,
            variant_sku: p.variantSku ?? undefined,
            size_code: p.sizeCode ?? undefined,
          })),
          1
        );
      }}
    >
      Add page to quote ({products.length})
    </Button>
  );
}
