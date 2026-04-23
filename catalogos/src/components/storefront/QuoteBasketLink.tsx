"use client";

import Link from "next/link";
import { useQuoteBasket } from "@/contexts/QuoteBasketContext";

export function QuoteBasketLink() {
  const { count } = useQuoteBasket();
  return (
    <Link
      href="/quote"
      className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
    >
      <span>Quote request</span>
      {count > 0 && (
        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
          {count}
        </span>
      )}
    </Link>
  );
}
