"use client";

import * as React from "react";
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

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";

export function SiteHeader() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/store?q=${encodeURIComponent(term)}`);
    else router.push("/store");
    setMobileOpen(false);
  }

  const navLinkClass =
    "flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold tracking-wide text-neutral-900 hover:text-[#FF7A00]";

  return (
    <>
      {/* Utility bar — public/index.html */}
      <div className="border-b border-white/10 bg-[#141414] py-2.5 text-[13px] font-medium leading-none text-white/90 sm:py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-4 sm:px-6 lg:px-8">
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
            <a href="tel:1-800-GLOVECUBS" className="flex items-center gap-2 hover:text-[#FF7A00]">
              <Phone className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Phone
            </a>
            <a href="mailto:sales@glovecubs.com" className="flex items-center gap-2 hover:text-[#FF7A00]">
              <Mail className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Email
            </a>
            <Link href="/request-pricing" className="flex items-center gap-2 hover:text-[#FF7A00]">
              <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Contact
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-[1000] border-b border-neutral-300/90 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_0_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-3 no-underline">
                <img
                  src="/images/logo.png"
                  alt="Glovecubs"
                  className="h-10 max-h-[44px] w-auto max-w-[min(100%,240px)] object-contain object-left transition-transform hover:scale-[1.02] sm:max-w-[300px] sm:h-11"
                />
                <span className="hidden items-center gap-1.5 rounded-xl bg-[#FF7A00] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white shadow-md sm:inline-flex">
                  <span aria-hidden>✓</span> Authorized Distributor
                </span>
              </Link>

              <div className="flex items-center gap-4 lg:hidden">
                <Link
                  href="/quote-cart"
                  className="relative flex cursor-pointer items-center text-neutral-800"
                  aria-label="Quote cart"
                >
                  <ShoppingCart className="h-6 w-6" />
                </Link>
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 p-2.5 text-neutral-800 shadow-sm"
                  aria-expanded={mobileOpen}
                  aria-label="Menu"
                  onClick={() => setMobileOpen((o) => !o)}
                >
                  {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-4 lg:gap-6">
              <form
                onSubmit={onSearch}
                className="order-3 flex min-w-[200px] flex-1 items-center overflow-hidden rounded-lg border-2 border-[#FF7A00] bg-white focus-within:shadow-[0_0_0_2px_rgba(255,122,0,0.2)] lg:order-none lg:max-w-[420px]"
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by style, material, AQL, thickness, ANSI, industry…"
                  className="min-w-0 flex-1 border-0 bg-transparent px-4 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
                  aria-label="Search catalog"
                />
                <button type="submit" className="flex h-11 min-h-[44px] w-11 shrink-0 items-center justify-center bg-[#FF7A00] text-white hover:bg-[#e56e00]">
                  <Search className="h-[18px] w-[18px]" />
                </button>
              </form>

              <Link
                href="/request-pricing"
                className="order-1 hidden rounded-md border-2 border-[#FF7A00] bg-transparent px-5 py-2 text-[13px] font-bold text-[#FF7A00] transition hover:-translate-y-px hover:bg-[#FF7A00] hover:text-white hover:shadow-[0_4px_14px_rgba(255,122,0,0.35)] lg:inline-block"
              >
                Request Quote
              </Link>

              {MAIN_SITE_URL ? (
                <a
                  href={MAIN_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="order-2 hidden text-[13px] font-semibold text-neutral-800 hover:text-[#FF7A00] lg:inline"
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
            className={`mt-3 max-h-[calc(100vh-100px)] overflow-y-auto border-t border-neutral-200/90 pt-3 text-center lg:block ${
              mobileOpen ? "max-lg:block" : "max-lg:hidden"
            }`}
          >
            <nav aria-label="Primary">
              <ul className="flex list-none flex-col gap-0 lg:flex-row lg:flex-wrap lg:items-center lg:justify-center lg:gap-x-10 lg:gap-y-2">
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/store" className={navLinkClass}>
                    Shop Gloves
                  </Link>
                </li>
                <li className="group relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <span className={`${navLinkClass} cursor-default justify-center lg:cursor-pointer`}>
                    Industries <ChevronDown className="h-3 w-3 opacity-80" />
                  </span>
                  <div className="invisible relative z-[1050] mt-2 rounded-xl border-2 border-[#FF7A00] bg-white p-5 text-left opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 lg:absolute lg:left-1/2 lg:top-full lg:mt-0 lg:min-w-[280px] lg:-translate-x-1/2 lg:translate-y-2 lg:group-hover:translate-y-0">
                    <h4 className="mb-3 border-b-2 border-neutral-200 pb-2.5 text-xs font-bold uppercase tracking-wide text-[#FF7A00]">
                      Shop by industry
                    </h4>
                    <ul className="list-none space-y-0 p-0">
                      <li className="border-t border-neutral-200 first:border-t-0">
                        <Link href="/industries/healthcare" className="block py-3 text-[15px] font-semibold text-neutral-900 hover:bg-[#fff8f5] hover:text-[#FF7A00] lg:py-3">
                          Medical &amp; Healthcare
                        </Link>
                      </li>
                      <li className="border-t border-neutral-200">
                        <Link href="/industries/janitorial" className="block py-3 text-[15px] font-semibold text-neutral-900 hover:bg-[#fff8f5] hover:text-[#FF7A00]">
                          Janitorial
                        </Link>
                      </li>
                      <li className="border-t border-neutral-200">
                        <Link href="/industries/hospitality" className="block py-3 text-[15px] font-semibold text-neutral-900 hover:bg-[#fff8f5] hover:text-[#FF7A00]">
                          Food Service
                        </Link>
                      </li>
                      <li className="border-t border-neutral-200">
                        <Link href="/industries/industrial" className="block py-3 text-[15px] font-semibold text-neutral-900 hover:bg-[#fff8f5] hover:text-[#FF7A00]">
                          Industrial
                        </Link>
                      </li>
                      <li className="border-t border-neutral-200">
                        <Link href="/store" className="block py-3 text-[15px] font-semibold text-neutral-900 hover:bg-[#fff8f5] hover:text-[#FF7A00]">
                          Automotive
                        </Link>
                      </li>
                    </ul>
                  </div>
                </li>
                <li className="group relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <span className={`${navLinkClass} cursor-default justify-center lg:cursor-pointer`}>
                    Brands <ChevronDown className="h-3 w-3 opacity-80" />
                  </span>
                  <div className="invisible relative z-[1050] mt-2 max-h-64 overflow-y-auto rounded-xl border-2 border-[#FF7A00] bg-white p-4 text-left opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 lg:absolute lg:left-1/2 lg:top-full lg:mt-0 lg:min-w-[280px] lg:-translate-x-1/2 lg:translate-y-2 lg:group-hover:translate-y-0">
                    <h4 className="mb-3 border-b-2 border-neutral-200 pb-2.5 text-xs font-bold uppercase tracking-wide text-[#FF7A00]">
                      Shop by brand
                    </h4>
                    <ul className="grid list-none grid-cols-1 gap-0 p-0 sm:grid-cols-2">
                      {HOME_BRAND_LIST.map((b) => {
                        const logo = getBrandLogoPath(b);
                        return (
                          <li key={b} className="border-t border-neutral-100 first:border-t-0">
                            <Link
                              href={`/store?brand=${encodeURIComponent(b)}`}
                              className="flex items-center gap-2 py-2 text-sm font-semibold text-neutral-900 hover:text-[#FF7A00]"
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
                  <Link href="/glove-finder" className={navLinkClass}>
                    AI Recommender
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/request-pricing" className={navLinkClass}>
                    Bulk / RFQ
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/store" className={navLinkClass}>
                    Resources
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/request-pricing" className={navLinkClass}>
                    FAQ
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/request-pricing" className={navLinkClass}>
                    Contact
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2 lg:ml-4 lg:border-l lg:border-neutral-200 lg:pl-4">
                  <Link
                    href="/invoice-savings"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#FF7A00] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#e56e00] lg:w-auto"
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
