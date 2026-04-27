"use client";

import { useState } from "react";
import { useCompare } from "@/components/storefront/CompareContext";
import { BulkQuoteModal } from "@/components/storefront/BulkQuoteModal";
import type { PricePerGloveResult } from "@/lib/conversion";
import { trackConversionEvent } from "@/lib/conversion/analytics";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ProductPageActionsProps {
  productId: string;
  slug: string | null;
  name: string;
  bestPrice: number;
  pricePerGlove: PricePerGloveResult;
  /** Normalized attributes for compare table (subset of keys). */
  compareAttributes: Record<string, unknown>;
}

export function ProductPageActions({
  productId,
  slug,
  name,
  bestPrice,
  pricePerGlove,
  compareAttributes,
}: ProductPageActionsProps) {
  const { add, isInCompare, canAdd } = useCompare();

  useEffect(() => {
    trackConversionEvent("product_viewed", { product_id: productId, slug: slug ?? undefined });
  }, [productId, slug]);

  const handleCompare = () => {
    if (isInCompare(productId) || !canAdd) return;
    add({
      id: productId,
      slug,
      name,
      attributes: compareAttributes,
      best_price: bestPrice,
      pricePerGlove: {
        display_per_glove: pricePerGlove.display_per_glove,
        display_case: pricePerGlove.display_case,
        price_per_glove: pricePerGlove.price_per_glove,
        gloves_per_box: pricePerGlove.gloves_per_box,
      },
    });
    trackConversionEvent("product_compared", { product_id: productId });
  };

  const [bulkQuoteOpen, setBulkQuoteOpen] = useState(false);

  return (
    <div className="mt-3 flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 w-full sm:h-8 sm:w-auto"
        onClick={() => setBulkQuoteOpen(true)}
      >
        Request bulk pricing
      </Button>
      <button
        type="button"
        onClick={handleCompare}
        disabled={isInCompare(productId) || !canAdd}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 sm:h-8 sm:w-auto"
      >
        {isInCompare(productId) ? "In compare list" : "Compare"}
      </button>
      <BulkQuoteModal
        open={bulkQuoteOpen}
        onOpenChange={setBulkQuoteOpen}
        productId={productId}
        productName={name}
      />
    </div>
  );
}
