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

      <header className="sticky top-0 z-[5000] isolate overflow-visible border-b border-neutral-300/90 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_0_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl min-w-0 px-4 pt-3 sm:px-6 lg:px-8">
          <div className="overflow-x-clip pb-3">
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
          </div>

          {/* Secondary nav — public/index.html (own row: avoid overflow-x on header clipping mega-menus) */}
          <div
            className={`border-t border-neutral-200/90 px-4 pb-3 pt-3 text-center sm:px-6 lg:block lg:overflow-visible lg:px-8 ${
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
                          className={`${mobileNavLinkClass} flex items-center gap-3`}
                          onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                        >
                          {item.thumb ? (
                            <img
                              src={item.thumb}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-md border border-neutral-200/80 bg-neutral-50 object-contain p-0.5"
                              loading="lazy"
                            />
                          ) : null}
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div
                    className={cn(
                      "pointer-events-none invisible absolute left-1/2 top-full z-[5100] mt-1 hidden w-[min(calc(100vw-1.5rem),520px)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 translate-y-1 opacity-0 transition duration-150 ease-out lg:block",
                      "rounded-2xl border border-neutral-200/90 bg-white/95 text-left shadow-2xl ring-1 ring-black/[0.04] backdrop-blur-md",
                      "group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100",
                    )}
                  >
                    <div className="flex max-h-[min(70vh,520px)] flex-col sm:max-h-none lg:flex-row lg:divide-x lg:divide-neutral-100">
                      <div className="min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-4">
                        <h4 className="mb-2 border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF5500]">
                          Shop by industry
                        </h4>
                        <ul className="list-none space-y-0.5 p-0">
                          {HEADER_INDUSTRY_NAV_ITEMS.map((item) => (
                            <li key={`d-${item.href}`}>
                              <Link
                                href={item.href}
                                className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50 hover:text-[#FF5500] lg:py-2.5"
                              >
                                {item.thumb ? (
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200/80 bg-neutral-50/90 shadow-sm">
                                    <img
                                      src={item.thumb}
                                      alt=""
                                      className="h-9 w-9 object-contain"
                                      loading="lazy"
                                    />
                                  </span>
                                ) : null}
                                <span className="min-w-0 flex-1 text-left leading-snug">{item.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="hidden shrink-0 flex-col justify-between gap-3 bg-gradient-to-b from-neutral-50 to-white p-4 lg:flex lg:w-[168px]">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Catalog</p>
                          <p className="mt-1 text-xs leading-snug text-neutral-600">Case-ready lines from authorized distributors.</p>
                        </div>
                        <div className="relative overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-inner" aria-hidden>
                          <Image
                            src="/images/logos/Global_Glove.png"
                            alt=""
                            width={200}
                            height={200}
                            className="h-auto w-full object-contain p-2"
                          />
                        </div>
                      </div>
                    </div>
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
                  <div
                    className={cn(
                      "pointer-events-none invisible absolute left-1/2 top-full z-[5100] mt-1 hidden w-[min(calc(100vw-1.5rem),580px)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 translate-y-1 opacity-0 transition duration-150 ease-out lg:block",
                      "rounded-2xl border border-neutral-200/90 bg-white/95 text-left shadow-2xl ring-1 ring-black/[0.04] backdrop-blur-md",
                      "group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100",
                    )}
                  >
                    <div className="max-h-[min(72vh,560px)] overflow-y-auto overscroll-y-contain p-4 sm:p-5">
                      <h4 className="mb-3 border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF5500]">
                        Shop by brand
                      </h4>
                      <ul className="grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2 sm:gap-x-2 sm:gap-y-1">
                        <li className="sm:col-span-2">
                          <Link
                            href="/brands"
                            className="flex items-center justify-between rounded-xl border border-[#FF5500]/25 bg-[#FF5500]/10 px-3 py-2.5 text-sm font-bold text-[#FF5500] transition hover:border-[#FF5500]/40 hover:bg-[#FF5500]/15"
                          >
                            <span>All brands</span>
                            <span aria-hidden>→</span>
                          </Link>
                        </li>
                        {HOME_BRAND_LIST.map((b) => {
                          const logo = getBrandLogoPath(b);
                          return (
                            <li key={b}>
                              <Link
                                href={getStoreHrefForBrandDisplayNameSearch(b)}
                                className="flex min-h-[52px] items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-sm font-semibold text-neutral-900 transition hover:border-neutral-200 hover:bg-neutral-50/90 hover:text-[#FF5500]"
                              >
                                {logo ? (
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200/80 bg-white shadow-sm">
                                    <img src={logo} alt="" className="h-9 w-9 object-contain" loading="lazy" />
                                  </span>
                                ) : (
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-[10px] font-bold text-neutral-400">
                                    —
                                  </span>
                                )}
                                <span className="min-w-0 flex-1 leading-snug">{b}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
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
