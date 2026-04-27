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
    <div className="mt-4 flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      <AddToQuoteButton
        productId={productId}
        slug={slug}
        name={name}
        unitPrice={unitPrice}
        sku={sku}
        size="lg"
        goToQuote
        className="h-11 w-full sm:h-10 sm:w-auto"
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
        className="h-11 w-full sm:h-10 sm:w-auto"
      >
        Add to quote list
      </AddToQuoteButton>
    </div>
  );
}
