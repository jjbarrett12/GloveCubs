"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

/** Floating quote access on small screens (clears PDP sticky bar height). */
export function MobileQuoteFab() {
  const pathname = usePathname();
  const { lineCount, hydrated } = useQuoteCart();
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/store/p/")) return null;
  const n = hydrated ? lineCount : 0;

  return (
    <Link
      href="/quote-cart"
      className="fixed bottom-24 right-4 z-[45] flex h-11 w-11 items-center justify-center rounded-full border border-border-light bg-white text-brand shadow-proc-light-md md:hidden"
      aria-label={n > 0 ? `Quote request cart, ${n} lines — review quote` : "Quote request cart — review quote"}
    >
      <ClipboardList className="h-5 w-5" />
      {n > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}
