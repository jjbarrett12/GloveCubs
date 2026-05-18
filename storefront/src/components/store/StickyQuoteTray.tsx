"use client";

import Link from "next/link";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

/** Desktop procurement entry — dense summary + review CTA. */
export function StickyQuoteTray() {
  const { lineCount, totalCount, hydrated } = useQuoteCart();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden md:block">
      <div className="pointer-events-auto mx-auto flex max-w-[1440px] justify-end px-6 pb-3 pt-1">
        <div className="max-w-sm rounded-lg border border-border-light bg-white/95 px-3 py-2 text-left text-[12px] text-ink shadow-proc-light-md backdrop-blur-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">Bulk quote</div>
          <Link
            href="/quote-cart"
            className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-neutral-700 hover:text-ink"
          >
            <span className="tabular-nums text-neutral-600">
              {hydrated ? <span className="font-semibold text-ink">{lineCount}</span> : "—"}{" "}
              <span className="font-normal">lines</span>
            </span>
            <span className="text-neutral-300">·</span>
            <span className="tabular-nums text-neutral-600">
              {hydrated ? <span className="font-semibold text-ink">{totalCount}</span> : "—"}{" "}
              <span className="font-normal">units</span>
            </span>
            <span className="ml-1 font-bold text-brand">Review quote →</span>
          </Link>
          <p className="mt-1 text-[10px] leading-snug text-neutral-500">
            Pricing is confirmed during review, not on this screen.
          </p>
        </div>
      </div>
    </div>
  );
}
