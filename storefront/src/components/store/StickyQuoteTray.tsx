"use client";

import Link from "next/link";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

/** Desktop procurement entry — dense summary + review CTA. */
export function StickyQuoteTray() {
  const { lineCount, totalCount, hydrated } = useQuoteCart();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden md:block">
      <div className="pointer-events-auto mx-auto flex max-w-[1440px] justify-end px-6 pb-4 pt-1">
        <div className="max-w-md rounded-lg border border-white/12 bg-[#141414]/95 px-3 py-2 text-left text-[12px] text-white shadow-lg backdrop-blur-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">Bulk quote</div>
          <Link
            href="/quote-cart"
            className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-white/80 hover:text-white"
          >
            <span className="tabular-nums text-white/65">
              {hydrated ? <span className="font-semibold text-white">{lineCount}</span> : "—"}{" "}
              <span className="font-normal">lines</span>
            </span>
            <span className="text-white/25">·</span>
            <span className="tabular-nums text-white/65">
              {hydrated ? <span className="font-semibold text-white">{totalCount}</span> : "—"}{" "}
              <span className="font-normal">units</span>
            </span>
            <span className="ml-1 font-bold text-[#f06232]">Review quote →</span>
          </Link>
          <p className="mt-1 text-[10px] leading-snug text-white/40">Most quote reviews within one business day.</p>
          <p className="mt-0.5 text-[10px] text-white/35">Pallet pricing &amp; multi-site programs welcome.</p>
        </div>
      </div>
    </div>
  );
}
