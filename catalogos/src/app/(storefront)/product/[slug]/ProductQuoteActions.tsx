"use client";

import { AddToQuoteButton } from "@/components/storefront/AddToQuoteButton";

interface ProductQuoteActionsProps {
  productId: string;
  slug: string;
  name: string;
  unitPrice?: number | null;
  sku?: string | null;
}

export function ProductQuoteActions({ productId, slug, name, unitPrice, sku }: ProductQuoteActionsProps) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <AddToQuoteButton
        productId={productId}
        slug={slug}
        name={name}
        unitPrice={unitPrice}
        sku={sku}
        size="lg"
        goToQuote
      >
        Request quote
      </AddToQuoteButton>
      <AddToQuoteButton
        productId={productId}
        slug={slug}
        name={name}
        unitPrice={unitPrice}
        sku={sku}
        variant="outline"
        size="lg"
      >
        Add to quote list
      </AddToQuoteButton>
    </div>
  );
}
