"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  X,
  Phone,
  Mail,
  MessageCircle,
  Search,
  ShoppingCart,
  ChevronDown,
  FileText,
} from "lucide-react";
import { HOME_BRAND_LIST, getBrandLogoPath } from "@/config/homeBrands";
import { HEADER_INDUSTRY_NAV_ITEMS } from "@/config/publicNav";
import { SITE_PHONE_TEL_HREF, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";
import { cn } from "@/lib/utils";

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";

function closeMobileNav(setMobileOpen: (v: boolean) => void, setMobilePanel: (v: "industries" | "brands" | null) => void) {
  setMobileOpen(false);
  setMobilePanel(null);
}

export function SiteHeader() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobilePanel, setMobilePanel] = React.useState<"industries" | "brands" | null>(null);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(buildStoreCatalogHref({ q: term }));
    else router.push("/store");
    closeMobileNav(setMobileOpen, setMobilePanel);
  }

  const navLinkClass =
    "flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold tracking-wide text-neutral-900 hover:text-[#FF5500]";

  const mobileNavLinkClass =
    "block py-3 text-[15px] font-semibold text-neutral-900 hover:bg-[#fff8f5] hover:text-[#FF5500] lg:py-3";

  return (
    <>
      {/* Utility bar — public/index.html */}
      <div className="overflow-x-hidden border-b border-white/10 bg-[#141414] py-2.5 text-[13px] font-medium leading-none text-white/90 sm:py-3">
        <div className="mx-auto flex min-w-0 max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-6 lg:px-8">
          <div className="hidden flex-wrap items-center gap-3.5 tracking-wide sm:flex">
            <span>Distributor pricing</span>
            <span className="text-white/40">•</span>
            <span>Net terms available</span>
            <span className="text-white/40">•</span>
            <span>Fast fulfillment</span>
            <span className="text-white/40">•</span>
            <span>Dedicated rep</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-4 sm:gap-5">
            <a href={SITE_PHONE_TEL_HREF} className="flex items-center gap-2 hover:text-[#FF5500]">
              <Phone className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Phone
            </a>
            <a href={SITE_SALES_MAILTO_HREF} className="flex items-center gap-2 hover:text-[#FF5500]">
              <Mail className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Email
            </a>
            <Link href="/contact" className="flex items-center gap-2 hover:text-[#FF5500]">
              <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Contact
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-[1000] overflow-x-hidden border-b border-neutral-300/90 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_0_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl min-w-0 px-4 py-3 sm:px-6 lg:px-8">
          <div className="grid min-w-0 grid-cols-1 items-center gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <Link
                href="/"
                className="flex min-w-0 max-w-full items-center bg-transparent no-underline [forced-color-adjust:none]"
                onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
              >
                <Image
                  src="/images/glovecubs-header-logo.png"
                  alt="GloveCubs"
                  width={1536}
                  height={1024}
                  priority
                  unoptimized
                  className="h-[32px] w-auto max-w-[min(220px,72vw)] shrink-0 object-contain object-left sm:h-[36px] lg:h-[38px]"
                />
              </Link>

              <div className="flex items-center gap-4 lg:hidden">
                <Link
                  href="/quote-cart"
                  className="relative flex cursor-pointer items-center text-neutral-800"
                  aria-label="Quote cart"
                  onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                >
                  <ShoppingCart className="h-6 w-6" />
                </Link>
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 p-2.5 text-neutral-800 shadow-sm"
                  aria-expanded={mobileOpen}
                  aria-label="Menu"
                  onClick={() => {
                    setMobileOpen((o) => !o);
                    if (mobileOpen) setMobilePanel(null);
                  }}
                >
                  {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
              </div>
            </div>

            <div className="flex min-w-0 w-full flex-wrap items-center justify-end gap-3 sm:gap-4 lg:gap-6">
              <form
                onSubmit={onSearch}
                className="order-3 flex min-w-0 max-w-full flex-1 basis-[min(100%,420px)] items-center overflow-hidden rounded-lg border-2 border-[#FF5500] bg-white focus-within:shadow-[0_0_0_2px_rgba(255,85,0,0.2)] lg:order-none lg:max-w-[420px]"
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by style, material, AQL, thickness, ANSI, industry…"
                  className="min-w-0 flex-1 border-0 bg-transparent px-4 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
                  aria-label="Search catalog"
                />
                <button
                  type="submit"
                  className="flex h-11 min-h-[44px] w-11 shrink-0 items-center justify-center bg-[#FF5500] text-white hover:opacity-90"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>
              </form>

              <Link
                href="/request-pricing"
                className="order-1 hidden rounded-md border-2 border-[#FF5500] bg-transparent px-5 py-2 text-[13px] font-bold text-[#FF5500] transition hover:-translate-y-px hover:bg-[#FF5500] hover:text-white hover:shadow-[0_4px_14px_rgba(255,85,0,0.35)] lg:inline-block"
              >
                Request Quote
              </Link>

              {MAIN_SITE_URL ? (
                <a
                  href={MAIN_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="order-2 hidden text-[13px] font-semibold text-neutral-800 hover:text-[#FF5500] lg:inline"
                >
                  Sign In
                </a>
              ) : null}

              <Link
                href="/quote-cart"
                className="relative order-2 hidden cursor-pointer items-center gap-1 text-neutral-800 lg:flex"
                aria-label="Quote cart"
              >
                <ShoppingCart className="h-6 w-6" />
              </Link>
            </div>
          </div>

          {/* Secondary nav — public/index.html */}
          <div
            className={`mt-3 border-t border-neutral-200/90 pt-3 text-center lg:block lg:overflow-visible ${
              mobileOpen
                ? "max-lg:block max-lg:max-h-[min(70vh,calc(100dvh-9rem))] max-lg:overflow-y-auto max-lg:overflow-x-hidden max-lg:overscroll-y-contain"
                : "max-lg:hidden max-lg:overflow-hidden"
            }`}
          >
            <nav aria-label="Primary">
              <ul className="flex list-none flex-col gap-0 lg:flex-row lg:flex-wrap lg:items-center lg:justify-center lg:gap-x-10 lg:gap-y-2">
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/store" className={navLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                    Shop Gloves
                  </Link>
                </li>
                <li className="group relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <div className="flex w-full items-center justify-between gap-2 lg:hidden">
                    <span className={navLinkClass}>Industries</span>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-200 p-2 text-neutral-800"
                      aria-expanded={mobilePanel === "industries"}
                      aria-label="Toggle industries menu"
                      onClick={() => setMobilePanel((p) => (p === "industries" ? null : "industries"))}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${mobilePanel === "industries" ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <span className={`${navLinkClass} hidden cursor-default justify-center lg:flex lg:cursor-pointer`}>
                    Industries <ChevronDown className="h-3 w-3 opacity-80" />
                  </span>
                  <ul
                    className={cn(
                      "mt-0 list-none space-y-0 border-l-2 border-[#FF5500]/35 pl-3 lg:hidden",
                      mobilePanel === "industries" ? "max-lg:block" : "max-lg:hidden",
                    )}
                  >
                    {HEADER_INDUSTRY_NAV_ITEMS.map((item) => (
                      <li key={item.href} className="border-t border-neutral-200 first:border-t-0 lg:border-t-0">
                        <Link
                          href={item.href}
                          className={mobileNavLinkClass}
                          onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="invisible relative z-[1050] mt-2 hidden rounded-xl border-2 border-[#FF5500] bg-white p-5 text-left opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 lg:absolute lg:left-1/2 lg:top-full lg:mt-0 lg:block lg:min-w-[280px] lg:-translate-x-1/2 lg:translate-y-2 lg:group-hover:translate-y-0">
                    <h4 className="mb-3 border-b-2 border-neutral-200 pb-2.5 text-xs font-bold uppercase tracking-wide text-[#FF5500]">
                      Shop by industry
                    </h4>
                    <ul className="list-none space-y-0 p-0">
                      {HEADER_INDUSTRY_NAV_ITEMS.map((item) => (
                        <li key={`d-${item.href}`} className="border-t border-neutral-200 first:border-t-0">
                          <Link href={item.href} className={mobileNavLinkClass}>
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
                <li className="group relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <div className="flex w-full items-center justify-between gap-2 lg:hidden">
                    <span className={navLinkClass}>Brands</span>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-200 p-2 text-neutral-800"
                      aria-expanded={mobilePanel === "brands"}
                      aria-label="Toggle brands menu"
                      onClick={() => setMobilePanel((p) => (p === "brands" ? null : "brands"))}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${mobilePanel === "brands" ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <span className={`${navLinkClass} hidden cursor-default justify-center lg:flex lg:cursor-pointer`}>
                    Brands <ChevronDown className="h-3 w-3 opacity-80" />
                  </span>
                  <ul
                    className={cn(
                      "mt-1 max-h-64 list-none space-y-0 overflow-y-auto border-l-2 border-[#FF5500]/35 pl-3 lg:hidden",
                      mobilePanel === "brands" ? "max-lg:block" : "max-lg:hidden",
                    )}
                  >
                    <li className="border-t border-neutral-200 first:border-t-0">
                      <Link
                        href="/brands"
                        className={mobileNavLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        All brands
                      </Link>
                    </li>
                    {HOME_BRAND_LIST.map((b) => {
                      const logo = getBrandLogoPath(b);
                      return (
                        <li key={b} className="border-t border-neutral-200">
                          <Link
                            href={getStoreHrefForBrandDisplayNameSearch(b)}
                            className="flex items-center gap-2 py-2.5 pl-0 text-[15px] font-semibold text-neutral-900 hover:text-[#FF5500]"
                            onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                          >
                            {logo ? (
                              <img src={logo} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />
                            ) : null}
                            {b}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="invisible relative z-[1050] mt-2 hidden max-h-64 overflow-y-auto rounded-xl border-2 border-[#FF5500] bg-white p-4 text-left opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 lg:absolute lg:left-1/2 lg:top-full lg:mt-0 lg:block lg:min-w-[280px] lg:-translate-x-1/2 lg:translate-y-2 lg:group-hover:translate-y-0">
                    <h4 className="mb-3 border-b-2 border-neutral-200 pb-2.5 text-xs font-bold uppercase tracking-wide text-[#FF5500]">
                      Shop by brand
                    </h4>
                    <ul className="grid list-none grid-cols-1 gap-0 p-0 sm:grid-cols-2">
                      <li className="border-t border-neutral-100 sm:col-span-2">
                        <Link
                          href="/brands"
                          className="block py-2.5 text-sm font-bold text-[#FF5500] hover:bg-[#fff8f5] hover:text-[#FF5500]"
                        >
                          All brands →
                        </Link>
                      </li>
                      {HOME_BRAND_LIST.map((b) => {
                        const logo = getBrandLogoPath(b);
                        return (
                          <li key={b} className="border-t border-neutral-100 first:border-t-0">
                            <Link
                              href={getStoreHrefForBrandDisplayNameSearch(b)}
                              className="flex items-center gap-2 py-2 text-sm font-semibold text-neutral-900 hover:text-[#FF5500]"
                            >
                              {logo ? (
                                <img src={logo} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />
                              ) : null}
                              {b}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link
                    href="/glove-finder"
                    className={navLinkClass}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    AI Recommender
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link
                    href="/request-pricing"
                    className={navLinkClass}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Bulk / RFQ
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link
                    href="/resources"
                    className={navLinkClass}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Resources
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/faq" className={navLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                    FAQ
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link
                    href="/contact"
                    className={navLinkClass}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Contact
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2 lg:ml-4 lg:border-l lg:border-neutral-200 lg:pl-4">
                  <Link
                    href="/invoice-savings"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#FF5500] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 lg:w-auto"
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Upload Invoice
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
