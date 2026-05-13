"use client";

import Link from "next/link";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";

export function QuoteCartNavLink() {
  const { totalCount, hydrated } = useQuoteCart();
  const label =
    hydrated && totalCount > 0 ? `Quote request cart (${totalCount})` : "Quote request cart";

  return (
    <Link href="/quote-cart" className="text-white/80 hover:text-white text-sm">
      {label}
    </Link>
  );
}
