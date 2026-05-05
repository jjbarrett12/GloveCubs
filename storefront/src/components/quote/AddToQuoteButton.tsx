"use client";

import type { StoreProductRow } from "@/lib/catalog/store-products";
import { Button } from "@/components/ui/button";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

export function AddToQuoteButton({ product }: { product: StoreProductRow }) {
  const { addItem } = useQuoteCart();

  return (
    <Button
      type="button"
      className="w-full bg-[hsl(var(--primary))] text-white hover:opacity-90"
      onClick={() =>
        addItem({
          product_id: product.id,
          name: product.name,
          slug: product.slug,
          brandName: product.brandName,
        })
      }
    >
      Add to Quote
    </Button>
  );
}
