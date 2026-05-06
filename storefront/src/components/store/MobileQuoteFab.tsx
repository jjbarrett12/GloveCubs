"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

/** Floating quote access on small screens (clears PDP sticky bar height). */
export function MobileQuoteFab() {
  const pathname = usePathname();
  if (pathname?.startsWith("/store/p/")) return null;

  const { lineCount, hydrated } = useQuoteCart();
  const n = hydrated ? lineCount : 0;

  return (
    <Link
      href="/quote-cart"
      className="fixed bottom-20 left-4 right-4 z-[45] flex items-center justify-between gap-3 rounded-2xl border border-[#FF7A00]/40 bg-[#12151c]/95 px-4 py-3 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_32px_rgba(255,122,0,0.12)] backdrop-blur-md md:hidden"
      aria-label={n > 0 ? `Quote cart, ${n} lines` : "Open bulk quote cart"}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF7A00]/15 text-[#FF7A00]">
          <ClipboardList className="h-5 w-5" />
          {n > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF7A00] px-1 text-[10px] font-bold text-black">
              {n > 99 ? "99+" : n}
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#ffb36a]">Bulk quote</div>
          <div className="truncate text-sm font-semibold">
            {n > 0 ? `${n} line${n === 1 ? "" : "s"} — request pricing` : "Build your bulk quote"}
          </div>
          <div className="text-xs text-white/55">Distributor-style line cart</div>
        </div>
      </div>
      <span className="shrink-0 rounded-xl bg-[#FF7A00] px-3 py-2 text-xs font-bold text-white">Open</span>
    </Link>
  );
}
