"use client";

import Link from "next/link";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import type { StoreProductRow } from "@/lib/catalog/store-products";

export function PdpStickyMobileCta({ product }: { product: StoreProductRow | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-[1440px] gap-2 border-t border-white/10 bg-[#0a0a0a]/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {product ? (
          <div className="min-w-0 flex-1">
            <AddToQuoteButton product={product} />
          </div>
        ) : null}
        <Link
          href="/request-pricing"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-[#FF7A00]/50 px-3 text-xs font-semibold text-white hover:bg-[#FF7A00]/10"
        >
          Request pricing
        </Link>
      </div>
    </div>
  );
}
