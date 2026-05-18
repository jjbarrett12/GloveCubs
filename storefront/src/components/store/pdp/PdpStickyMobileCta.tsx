"use client";

import Link from "next/link";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import type { StoreProductRow } from "@/lib/catalog/store-products";

export function PdpStickyMobileCta({
  product,
  showRequestPricingPrimary,
}: {
  product: StoreProductRow | null;
  showRequestPricingPrimary?: boolean;
}) {
  const quotePrimary = product && !showRequestPricingPrimary;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-[1440px] flex-col gap-2 border-t border-white/10 bg-[#0a0a0a]/98 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        {product?.variantSku ? (
          <p className="truncate font-mono text-[10px] text-white/50">
            SKU <span className="text-white/75">{product.variantSku}</span>
            {product.sizeCode ? <span className="text-white/40"> · {product.sizeCode}</span> : null}
          </p>
        ) : null}
        <div className="flex gap-2">
          {quotePrimary ? (
            <div className="min-w-0 flex-1">
              <AddToQuoteButton product={product} className="h-11 text-sm font-bold" />
            </div>
          ) : showRequestPricingPrimary ? (
            <Link
              href="/request-pricing"
              className="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-md border border-[#f06232] bg-[#f06232]/15 px-4 text-sm font-bold text-white"
            >
              Request pricing
            </Link>
          ) : null}
          {quotePrimary ? (
            <Link
              href="/request-pricing"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-[#f06232]/50 px-4 text-xs font-semibold text-white hover:bg-[#f06232]/10"
            >
              RFQ
            </Link>
          ) : product ? (
            <div className="min-w-0 flex-1">
              <AddToQuoteButton product={product} className="h-11 text-sm font-bold" />
            </div>
          ) : (
            <Link
              href="/request-pricing"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-[#f06232]/50 px-4 text-xs font-semibold text-white hover:bg-[#f06232]/10"
            >
              RFQ
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
