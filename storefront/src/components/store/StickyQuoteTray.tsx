"use client";

import Link from "next/link";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

/** Desktop procurement entry — dense summary + review CTA. */
export function StickyQuoteTray() {
  const { lineCount, totalCount, hydrated } = useQuoteCart();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden md:block">
      <div className="pointer-events-auto mx-auto flex max-w-[1440px] justify-end px-6 pb-5 pt-1">
        <Link
          href="/quote-cart"
          className="flex max-w-md flex-col gap-0.5 rounded-2xl border border-[#FF7A00]/35 bg-[#12151c]/95 px-5 py-3.5 text-left text-white shadow-[0_16px_48px_rgba(0,0,0,0.45),0_0_40px_rgba(255,122,0,0.12)] backdrop-blur-md transition hover:border-[#FF7A00]/55 hover:shadow-[0_18px_52px_rgba(0,0,0,0.5),0_0_48px_rgba(255,122,0,0.16)] sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#ffb36a]">Bulk quote</div>
            <div className="text-sm font-semibold text-white">
              {hydrated && lineCount > 0 ? (
                <>
                  {lineCount} line{lineCount === 1 ? "" : "s"} selected — request pricing
                </>
              ) : (
                <>Build your bulk quote → distributor-level pricing</>
              )}
            </div>
            <div className="text-xs text-white/55">Most quote reviews within one business day.</div>
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t border-white/10 pt-2 sm:border-t-0 sm:border-l sm:border-white/10 sm:pl-4 sm:pt-0">
            <div className="hidden text-right text-[11px] leading-tight text-white/50 sm:block">
              <div className="tabular-nums">
                <span className="font-semibold text-white">{hydrated ? lineCount : "—"}</span> lines
              </div>
              <div className="tabular-nums">
                <span className="font-semibold text-white">{hydrated ? totalCount : "—"}</span> units
              </div>
            </div>
            <span className="rounded-xl bg-[#FF7A00] px-4 py-2 text-sm font-bold text-white">Open quote</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
