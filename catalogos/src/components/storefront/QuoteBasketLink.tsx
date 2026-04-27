"use client";

import Link from "next/link";
import { useQuoteBasket } from "@/contexts/QuoteBasketContext";
import { cn } from "@/lib/utils";

interface QuoteBasketLinkProps {
  className?: string;
  /** compact: short label for mobile header; desktop: full label in wide nav */
  variant?: "compact" | "desktop";
  onNavigate?: () => void;
}

export function QuoteBasketLink({ className, variant = "desktop", onNavigate }: QuoteBasketLinkProps) {
  const { count } = useQuoteBasket();
  const isCompact = variant === "compact";
  return (
    <Link
      href="/quote"
      onClick={onNavigate}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 hover:bg-muted/60",
        isCompact && "px-3 text-sm font-medium",
        className
      )}
    >
      {isCompact ? <span>Quote</span> : <span>Quote request</span>}
      {count > 0 && (
        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">{count}</span>
      )}
    </Link>
  );
}
