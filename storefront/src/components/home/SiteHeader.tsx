"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QuoteCartNavLink } from "@/components/quote/QuoteCartNavLink";

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/85 backdrop-blur-md supports-[backdrop-filter]:bg-black/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-sm font-black text-white shadow-md shadow-[hsl(var(--primary))]/25"
            aria-hidden
          >
            GC
          </span>
          <span className="text-lg font-bold tracking-tight text-white sm:text-xl">
            Glove<span className="text-[hsl(var(--primary))]">Cubs</span>
          </span>
        </Link>

        <nav
          className="flex min-w-0 flex-1 items-center justify-center gap-3 overflow-x-auto whitespace-nowrap px-1 text-sm font-medium text-white/75 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 md:text-[0.9375rem] [&::-webkit-scrollbar]:hidden"
          aria-label="Primary"
        >
          <Link href="/store" className="shrink-0 hover:text-white">
            Shop
          </Link>
          <a href="#bulk-order" className="shrink-0 hover:text-white">
            Bulk Orders
          </a>
          <a href="#industries" className="shrink-0 hover:text-white">
            Industries
          </a>
          <Link href="/invoice-savings" className="shrink-0 hover:text-white">
            Invoice Savings
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {MAIN_SITE_URL ? (
            <a
              href={MAIN_SITE_URL}
              className="hidden text-xs text-white/45 hover:text-white/80 lg:inline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Full site
            </a>
          ) : null}
          <span className="text-white/80 [&_a]:text-xs [&_a]:text-white/70 [&_a]:hover:text-white sm:[&_a]:text-sm">
            <QuoteCartNavLink />
          </span>
          <Button
            asChild
            size="sm"
            className="shrink-0 bg-[hsl(var(--primary))] px-4 font-semibold text-white shadow-md shadow-[hsl(var(--primary))]/25 hover:opacity-95"
          >
            <Link href="/request-pricing">Request Pricing</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
