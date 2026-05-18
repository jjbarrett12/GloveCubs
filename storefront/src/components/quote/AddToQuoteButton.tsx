"use client";

import type { StoreProductRow } from "@/lib/catalog/store-products";
import { Button } from "@/components/ui/button";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import { canAddProductRowToQuote, isQuoteVariantIdentityComplete } from "@/lib/catalog/store-quote-rules";
import { cn } from "@/lib/utils";

type Props = {
  product: StoreProductRow;
  className?: string;
};

export function AddToQuoteButton({ product, className }: Props) {
  const { addItem } = useQuoteCart();
  const allowed = canAddProductRowToQuote(product);
  const complete = isQuoteVariantIdentityComplete(product);
  const disabled = !allowed || !complete;

  const disabledReason = !allowed
    ? product.activeVariantCount > 1
      ? "Select a size on the product page before adding to quote."
      : "This product cannot be added to quote from the listing."
    : !complete
      ? "Variant SKU and catalog variant id are required for quote lines."
      : null;

  return (
    <Button
      type="button"
      disabled={disabled}
      title={disabledReason ?? undefined}
      className={cn("w-full bg-[hsl(var(--primary))] text-white hover:opacity-90 disabled:opacity-50", className)}
      onClick={() => {
        if (!allowed || !complete) return;
        addItem({
          product_id: product.id,
          name: product.name,
          slug: product.slug,
          brandName: product.brandName,
          catalog_variant_id: product.catalogVariantId ?? undefined,
          variant_sku: product.variantSku ?? undefined,
          size_code: product.sizeCode ?? undefined,
        });
      }}
    >
      Add to Quote
    </Button>
  );
}
