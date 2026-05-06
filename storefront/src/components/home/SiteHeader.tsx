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
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { HOME_BRAND_LIST, getBrandLogoPath } from "@/config/homeBrands";
import { getIndustryMegaCards } from "@/config/headerMega";
import { HEADER_INDUSTRY_NAV_ITEMS } from "@/config/publicNav";
import { SITE_PHONE_TEL_HREF, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";
import { cn } from "@/lib/utils";

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";
const INDUSTRY_MEGA = getIndustryMegaCards();

function closeMobileNav(setMobileOpen: (v: boolean) => void, setMobilePanel: (v: "industries" | "brands" | null) => void) {
  setMobileOpen(false);
  setMobilePanel(null);
}

function useSiteHeaderBottom(ref: React.RefObject<HTMLElement | null>) {
  const tick = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    document.documentElement.style.setProperty("--site-header-bottom", `${Math.ceil(el.getBoundingClientRect().bottom)}px`);
  }, [ref]);

  React.useLayoutEffect(() => {
    tick();
    const el = ref.current;
    const ro = new ResizeObserver(() => tick());
    if (el) ro.observe(el);
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
      document.documentElement.style.removeProperty("--site-header-bottom");
    };
  }, [tick, ref]);
}

type MegaKey = "industries" | "brands";

function useDesktopMega() {
  const [mega, setMega] = React.useState<MegaKey | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closeMegaNow = React.useCallback(() => {
    cancelClose();
    setMega(null);
  }, [cancelClose]);

  const openMega = React.useCallback(
    (key: MegaKey) => {
      if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) return;
      cancelClose();
      setMega(key);
    },
    [cancelClose],
  );

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setMega(null), 160);
  }, [cancelClose]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  return { mega, openMega, scheduleClose, cancelClose, closeMegaNow };
}

export function SiteHeader() {
  const router = useRouter();
  const headerRef = React.useRef<HTMLElement | null>(null);
  useSiteHeaderBottom(headerRef);
  const { mega, openMega, scheduleClose, closeMegaNow } = useDesktopMega();

  React.useEffect(() => {
    if (!mega) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMegaNow();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mega, closeMegaNow]);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    function onChange() {
      if (mq.matches) closeMegaNow();
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [closeMegaNow]);

  const [q, setQ] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobilePanel, setMobilePanel] = React.useState<"industries" | "brands" | null>(null);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/store?q=${encodeURIComponent(term)}`);
    else router.push("/store");
    closeMobileNav(setMobileOpen, setMobilePanel);
  }

  const navLinkClass =
    "flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold tracking-wide text-neutral-900 hover:text-[#FF7A00]";

  const mobileNavLinkClass =
    "block py-3 text-[15px] font-semibold text-neutral-900 hover:bg-[#fff8f5] hover:text-[#FF7A00] lg:py-3";

  const megaTopStyle = { top: "var(--site-header-bottom, 132px)" } as const;

  return (
    <>
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
            <a href={SITE_PHONE_TEL_HREF} className="flex items-center gap-2 hover:text-[#FF7A00]">
              <Phone className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Phone
            </a>
            <a href={SITE_SALES_MAILTO_HREF} className="flex items-center gap-2 hover:text-[#FF7A00]">
              <Mail className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Email
            </a>
            <Link href="/contact" className="flex items-center gap-2 hover:text-[#FF7A00]">
              <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Contact
            </Link>
          </div>
        </div>
      </div>

      <header
        ref={headerRef}
        className="sticky top-0 z-[8000] border-b border-neutral-300/90 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_0_rgba(0,0,0,0.04)]"
      >
        <div className="mx-auto max-w-7xl min-w-0 overflow-x-clip px-4 py-3 sm:px-6 lg:px-8">
          <div className="grid min-w-0 grid-cols-1 items-center gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <Link
                href="/"
                className="flex min-w-0 max-w-full items-center bg-transparent no-underline [forced-color-adjust:none]"
                onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
              >
                <Image
                  src="/images/glovecubs-header-mark-transparent.png?v=b-white"
                  alt="GloveCubs logo"
                  width={1024}
                  height={132}
                  priority
                  unoptimized
                  className="h-auto w-[148px] shrink-0 object-contain object-left sm:w-[168px] lg:w-[184px]"
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
                className="order-3 flex min-w-0 max-w-full flex-1 basis-[min(100%,320px)] items-center overflow-hidden rounded-lg border border-neutral-300/95 bg-neutral-50/80 focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-neutral-300/80 lg:order-none lg:max-w-[300px]"
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search specs, ANSI, mil, brand…"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-500"
                  aria-label="Search catalog"
                />
                <button
                  type="submit"
                  className="flex h-9 min-h-[36px] w-9 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-white hover:bg-neutral-900"
                >
                  <Search className="h-[16px] w-[16px]" />
                </button>
              </form>

              <Link
                href="/#bulk-order"
                className="order-1 hidden rounded-md bg-[#FF7A00] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(255,122,0,0.28)] transition hover:bg-[#e56e00] hover:shadow-[0_6px_18px_rgba(255,122,0,0.32)] lg:inline-block"
              >
                Get bulk pricing
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

          <div
            className={cn(
              "mt-3 border-t border-neutral-200/90 pt-3 text-center lg:block lg:overflow-visible",
              mobileOpen
                ? "max-lg:block max-lg:max-h-[min(70vh,calc(100dvh-9rem))] max-lg:overflow-y-auto max-lg:overflow-x-hidden max-lg:overscroll-y-contain"
                : "max-lg:hidden max-lg:overflow-hidden",
            )}
          >
            <nav aria-label="Primary">
              <ul className="relative z-[8100] flex list-none flex-col gap-0 lg:z-[8100] lg:flex-row lg:flex-wrap lg:items-center lg:justify-center lg:gap-x-10 lg:gap-y-2">
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/store" className={navLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                    Shop Gloves
                  </Link>
                </li>

                <li
                  className="relative border-b border-neutral-100 py-3 lg:z-[8200] lg:border-0 lg:py-2"
                  onMouseLeave={scheduleClose}
                >
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
                        className={cn("h-4 w-4 transition-transform", mobilePanel === "industries" ? "rotate-180" : "")}
                      />
                    </button>
                  </div>
                  <span
                    className={`${navLinkClass} hidden cursor-default justify-center lg:flex lg:cursor-pointer`}
                    onMouseEnter={() => openMega("industries")}
                  >
                    Industries <ChevronDown className="h-3 w-3 opacity-80" />
                  </span>
                  <ul
                    className={cn(
                      "mt-0 list-none space-y-0 border-l border-neutral-200 pl-3 lg:hidden",
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

                  {mega === "industries" ? (
                    <div
                      className="pointer-events-auto fixed left-2 right-2 z-[9000] hidden max-h-[min(82vh,920px)] overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200/90 bg-white shadow-[0_28px_100px_rgba(0,0,0,0.22)] lg:block md:left-4 md:right-4"
                      style={megaTopStyle}
                      onMouseEnter={() => openMega("industries")}
                      onMouseLeave={scheduleClose}
                      role="region"
                      aria-label="Industries menu"
                    >
                      <div className="border-b border-neutral-200/80 bg-gradient-to-r from-[#fff8f3] via-white to-white px-5 py-4 md:px-8 md:py-5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF7A00]">
                          <Sparkles className="h-3.5 w-3.5" aria-hidden />
                          Shop by industry
                        </div>
                        <p className="mt-1 max-w-3xl text-sm text-neutral-600 md:text-base">
                          Pick your environment—we surface the right specs, case economics, and fulfillment rhythm.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 lg:gap-4 lg:p-6">
                        {INDUSTRY_MEGA.map((item) => {
                          const wide = item.href === "/industries";
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={cn(
                                "group/card relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-5 text-left text-white shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl",
                                "bg-gradient-to-br",
                                item.cardClass,
                                wide ? "sm:col-span-2 lg:col-span-3 lg:min-h-[160px] lg:flex-row lg:items-center lg:justify-between lg:p-8" : "",
                              )}
                              onClick={closeMegaNow}
                            >
                              <div
                                className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
                                style={{
                                  backgroundImage:
                                    "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 80% 80%, rgba(255,122,0,0.2), transparent 40%)",
                                }}
                              />
                              <div className="relative z-[1] flex min-w-0 flex-1 flex-col gap-2">
                                <div className="flex items-start gap-3">
                                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/25 ring-1 ring-white/20 backdrop-blur-sm">
                                    <item.Icon className="h-6 w-6 text-white" aria-hidden />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-lg font-bold leading-snug tracking-tight">{item.label}</div>
                                    <p className="mt-1 text-sm font-medium leading-snug text-white/80">{item.blurb}</p>
                                  </div>
                                </div>
                              </div>
                              <span className="relative z-[1] mt-4 inline-flex items-center gap-1 text-sm font-bold text-white/95 lg:mt-0">
                                Explore
                                <ArrowRight className="h-4 w-4 transition group-hover/card:translate-x-0.5" />
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </li>

                <li
                  className="relative border-b border-neutral-100 py-3 lg:z-[8200] lg:border-0 lg:py-2"
                  onMouseLeave={scheduleClose}
                >
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
                        className={cn("h-4 w-4 transition-transform", mobilePanel === "brands" ? "rotate-180" : "")}
                      />
                    </button>
                  </div>
                  <span
                    className={`${navLinkClass} hidden cursor-default justify-center lg:flex lg:cursor-pointer`}
                    onMouseEnter={() => openMega("brands")}
                  >
                    Brands <ChevronDown className="h-3 w-3 opacity-80" />
                  </span>
                  <ul
                    className={cn(
                      "mt-1 max-h-64 list-none space-y-0 overflow-y-auto border-l border-neutral-200 pl-3 lg:hidden",
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
                            href={`/store?brand=${encodeURIComponent(b)}`}
                            className="flex items-center gap-2 py-2.5 pl-0 text-[15px] font-semibold text-neutral-900 hover:text-[#FF7A00]"
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

                  {mega === "brands" ? (
                    <div
                      className="pointer-events-auto fixed left-2 right-2 z-[9000] hidden max-h-[min(82vh,920px)] overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200/90 bg-[#fafafa] shadow-[0_28px_100px_rgba(0,0,0,0.22)] lg:block md:left-4 md:right-4"
                      style={megaTopStyle}
                      onMouseEnter={() => openMega("brands")}
                      onMouseLeave={scheduleClose}
                      role="region"
                      aria-label="Brands menu"
                    >
                      <div className="border-b border-neutral-200/90 bg-white px-5 py-4 md:px-8 md:py-5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF7A00]">
                          <Sparkles className="h-3.5 w-3.5" aria-hidden />
                          Shop by brand
                        </div>
                        <p className="mt-1 max-w-3xl text-sm text-neutral-600 md:text-base">
                          Distributor-direct logos we stock and move at case &amp; pallet scale—tap a mark to jump into
                          the live catalog.
                        </p>
                      </div>
                      <div className="p-4 sm:p-5 lg:p-6">
                        <Link
                          href="/brands"
                          className="mb-4 flex min-h-[100px] items-center justify-between gap-4 rounded-2xl border border-[#FF7A00]/25 bg-gradient-to-r from-[#1a1a1a] via-[#2a2a2a] to-[#FF7A00]/25 px-6 py-5 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg md:px-8"
                          onClick={closeMegaNow}
                        >
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-[#ffb36a]">Full line card</div>
                            <div className="mt-1 text-xl font-bold">Browse all brands</div>
                            <p className="mt-1 max-w-xl text-sm text-white/75">
                              Compare marks, certifications, and case packs across the entire vendor set.
                            </p>
                          </div>
                          <ArrowRight className="hidden h-10 w-10 shrink-0 text-white/90 sm:block" aria-hidden />
                        </Link>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 xl:gap-4">
                          {HOME_BRAND_LIST.map((b) => {
                            const logo = getBrandLogoPath(b);
                            return (
                              <Link
                                key={b}
                                href={`/store?brand=${encodeURIComponent(b)}`}
                                className="group/brand flex flex-col items-center justify-center rounded-2xl border border-neutral-200/90 bg-white p-4 text-center shadow-sm transition hover:-translate-y-1 hover:border-[#FF7A00]/40 hover:shadow-xl"
                                onClick={closeMegaNow}
                              >
                                <div className="mb-3 flex h-[72px] w-full items-center justify-center rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200/80 transition group-hover/brand:bg-white group-hover/brand:ring-[#FF7A00]/25">
                                  {logo ? (
                                    <img
                                      src={logo}
                                      alt=""
                                      className="max-h-14 w-full max-w-[140px] object-contain"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="text-lg font-bold text-neutral-400">{b.slice(0, 2)}</span>
                                  )}
                                </div>
                                <span className="text-[13px] font-bold leading-tight text-neutral-900 group-hover/brand:text-[#FF7A00]">
                                  {b}
                                </span>
                                <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 transition group-hover/brand:text-neutral-600">
                                  View SKUs
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
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
                    href="/#bulk-order"
                    className={navLinkClass}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Bulk pricing
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2 lg:ml-4 lg:border-l lg:border-neutral-200 lg:pl-4">
                  <Link
                    href="/invoice-savings"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-neutral-50 px-3.5 py-2 text-xs font-semibold text-neutral-800 hover:border-[#FF7A00]/40 hover:bg-white lg:w-auto"
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    <FileText className="h-3.5 w-3.5 text-neutral-600" />
                    Invoice check
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
