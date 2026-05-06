"use client";

import Link from "next/link";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

/** Desktop procurement entry — dense summary + review CTA. */
export function StickyQuoteTray() {
  const { lineCount, totalCount, hydrated } = useQuoteCart();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden md:block">
      <div className="pointer-events-auto mx-auto flex max-w-[1440px] justify-end px-6 pb-4 pt-1">
        <Link
          href="/quote-cart"
          className="flex items-center gap-2.5 rounded-lg border border-white/12 bg-[#141414]/95 px-3 py-2 text-[12px] text-white shadow-lg backdrop-blur-sm hover:border-[#FF7A00]/35"
        >
          <span className="tabular-nums text-white/65">
            {hydrated ? <span className="font-semibold text-white">{lineCount}</span> : "—"} lines
          </span>
          <span className="text-white/30">·</span>
          <span className="tabular-nums text-white/65">
            {hydrated ? <span className="font-semibold text-white">{totalCount}</span> : "—"} units
          </span>
          <span className="ml-1 font-bold text-[#FF7A00]">Review quote</span>
        </Link>
      </div>
    </div>
  );
}
