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
  User,
  LogOut,
  RefreshCw,
  Tag,
} from "lucide-react";
import { HOME_BRAND_LIST, getBrandLogoPath } from "@/config/homeBrands";
import { industryNavIconForHref } from "@/config/industryNavIcons";
import { HEADER_INDUSTRY_NAV_ITEMS } from "@/config/publicNav";
import { SITE_PHONE_TEL_HREF, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import type { CommerceHeaderAuth } from "@/lib/customer/commerce-header-auth";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

/**
 * Stacking (keep below `components/ui/dialog.tsx` overlay z-50; above page content).
 * - Page / hero: default (0–1).
 * - Sticky header: z-40.
 * - Mega-panels: z-10 inside elevated `li` (z-30 when open/hover) so later nav items do not paint over.
 * - Dialogs / modals: z-50+ (canonical overlay).
 * - Legacy mobile drawers (e.g. store): z-[1200] — unchanged.
 */

function closeMobileNav(setMobileOpen: (v: boolean) => void, setMobilePanel: (v: "industries" | "brands" | null) => void) {
  setMobileOpen(false);
  setMobilePanel(null);
}

/**
 * `auth` is optional so callers rendered against the static HEAD (e.g. legacy
 * pages still on `<SiteHeader />`) get the anonymous UI without a build break.
 * Auth-aware pages should render `<SiteHeaderLoader />` instead, which fetches
 * the server-side auth snapshot and forwards it here.
 */
export function SiteHeader({ auth = { kind: "anonymous" } }: { auth?: CommerceHeaderAuth }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [mobilePanel, setMobilePanel] = React.useState<"industries" | "brands" | null>(null);
  const [desktopMega, setDesktopMega] = React.useState<"industries" | "brands" | null>(null);
  const industriesMegaRef = React.useRef<HTMLLIElement | null>(null);
  const brandsMegaRef = React.useRef<HTMLLIElement | null>(null);
  /** Browser timer id (`window.setTimeout`); avoid `NodeJS.Timeout` mismatch in Next typecheck. */
  const megaCloseTimerRef = React.useRef<number | null>(null);

  function cancelMegaCloseTimer() {
    if (megaCloseTimerRef.current != null) {
      window.clearTimeout(megaCloseTimerRef.current);
      megaCloseTimerRef.current = null;
    }
  }

  function scheduleMegaClose(li: HTMLLIElement | null) {
    cancelMegaCloseTimer();
    const tid = window.setTimeout(() => {
      if (li?.contains(document.activeElement)) {
        megaCloseTimerRef.current = null;
        return;
      }
      setDesktopMega(null);
      megaCloseTimerRef.current = null;
    }, 140);
    megaCloseTimerRef.current = tid as unknown as number;
  }

  React.useEffect(() => {
    return () => cancelMegaCloseTimer();
  }, []);

  React.useEffect(() => {
    if (mobileOpen) setDesktopMega(null);
  }, [mobileOpen]);

  React.useEffect(() => {
    if (desktopMega == null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDesktopMega(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [desktopMega]);

  React.useEffect(() => {
    if (desktopMega == null) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (industriesMegaRef.current?.contains(t)) return;
      if (brandsMegaRef.current?.contains(t)) return;
      setDesktopMega(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [desktopMega]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(buildStoreCatalogHref({ q: term }));
    else router.push("/store");
    closeMobileNav(setMobileOpen, setMobilePanel);
  }

  async function onSignOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // still navigate home if client misconfigured
    }
    router.push("/");
    router.refresh();
  }

  const navLinkClass =
    "flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold tracking-wide text-neutral-950 hover:text-brand";

  const mobileNavLinkClass =
    "block py-3 text-[15px] font-semibold text-neutral-950 hover:bg-brand/5 hover:text-brand lg:py-3";

  const mobileSectionLabelClass =
    "proc-eyebrow mb-1 mt-4 border-t border-neutral-100 pt-4 text-neutral-500 first:mt-0 first:border-t-0 first:pt-0 lg:hidden";

  const megaTriggerClass = cn(
    navLinkClass,
    "border-0 bg-transparent p-0 text-neutral-950 shadow-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-md",
  );

  const procurementDropdownLinkClass =
    "block px-3 py-2 font-medium text-neutral-900 hover:bg-neutral-50 hover:text-brand";

  const showReorder = auth.kind === "signed_in" && auth.showWorkspace;
  const showBuyerWorkspace = auth.kind === "signed_in" && auth.showWorkspace;

  const industriesMegaOpen = desktopMega === "industries";
  const brandsMegaOpen = desktopMega === "brands";

  return (
    <>
      {/* Utility bar — public/index.html */}
      <div className="overflow-x-hidden border-b border-border-subtle bg-surface-card py-2 text-[13px] font-medium leading-none text-white/90 sm:py-2.5">
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
            <a href={SITE_PHONE_TEL_HREF} className="flex items-center gap-2 hover:text-brand">
              <Phone className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Phone
            </a>
            <a href={SITE_SALES_MAILTO_HREF} className="flex items-center gap-2 hover:text-brand">
              <Mail className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Email
            </a>
            <Link href="/contact" className="flex items-center gap-2 hover:text-brand">
              <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Contact
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 overflow-visible border-b border-neutral-300/90 bg-white text-neutral-950 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_0_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl min-w-0 px-4 pt-1.5 sm:px-6 lg:px-8">
          <div className="overflow-x-clip pb-2">
            <div className="grid min-w-0 grid-cols-1 items-center gap-3 lg:grid-cols-[auto_1fr]">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <Link
                href="/"
                className="flex min-w-0 max-w-full items-center bg-transparent no-underline [forced-color-adjust:none]"
                onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
              >
                <Image
                  src="/images/glovecubs-header-logo.png"
                  alt="GloveCubs"
                  width={1005}
                  height={143}
                  priority
                  unoptimized
                  className="h-[48px] w-auto max-w-[min(440px,72vw)] shrink-0 object-contain object-left sm:h-[64px] lg:h-[80px]"
                />
              </Link>

              <div className="flex items-center gap-3 lg:hidden">
                <Link
                  href="/quote-cart"
                  className="relative flex cursor-pointer items-center gap-1.5 text-neutral-800"
                  aria-label="Quote request"
                  title="Quote request"
                  onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                >
                  <ShoppingCart className="h-6 w-6 shrink-0" aria-hidden />
                  <span className="text-[12px] font-semibold">Quote</span>
                </Link>
                {auth.kind === "anonymous" ? (
                  <Link
                    href="/login"
                    className="text-[13px] font-semibold text-neutral-800 hover:text-brand"
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Sign In
                  </Link>
                ) : null}
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
                className="order-3 flex min-w-0 max-w-full flex-1 basis-[min(100%,420px)] items-center overflow-hidden rounded-lg border-2 border-brand bg-white focus-within:shadow-proc-sm lg:order-none lg:max-w-[420px]"
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
                  className="flex h-11 min-h-[44px] w-11 shrink-0 items-center justify-center bg-brand text-white hover:bg-brand-hover"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>
              </form>

              <Link
                href="/request-pricing"
                className="order-1 hidden rounded-md border-2 border-brand bg-transparent px-5 py-2 text-[13px] font-bold text-brand transition hover:-translate-y-px hover:bg-brand hover:text-white hover:shadow-proc-md lg:inline-block"
              >
                Request pricing
              </Link>

              {auth.kind === "anonymous" ? (
                <Link
                  href="/login"
                  className="order-2 hidden text-[13px] font-semibold text-neutral-800 hover:text-brand lg:inline"
                >
                  Sign In
                </Link>
              ) : (
                <details className="order-2 relative hidden lg:inline-block">
                  <summary className="list-none cursor-pointer text-[13px] font-semibold text-neutral-800 hover:text-brand [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5 opacity-80" aria-hidden />
                      Account
                      <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
                    </span>
                  </summary>
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-neutral-200 bg-white py-1 text-left text-[13px] shadow-lg">
                    <div className="border-b border-neutral-100 px-3 py-2 text-[11px] text-neutral-500">
                      {auth.email ? <span className="break-all">{auth.email}</span> : "Signed in"}
                    </div>
                    <Link
                      href="/account"
                      className="block px-3 py-2 font-medium text-neutral-900 hover:bg-neutral-50"
                      onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                    >
                      Account home
                    </Link>
                    <Link
                      href="/account/quicklist"
                      className="block px-3 py-2 font-medium text-neutral-900 hover:bg-neutral-50"
                      onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                    >
                      Glove quicklist
                    </Link>
                    {showReorder ? (
                      <Link
                        href="/workspace/procurement/reorder"
                        className="block px-3 py-2 font-medium text-neutral-900 hover:bg-neutral-50 hover:text-brand"
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        Reorder
                      </Link>
                    ) : null}
                    {showBuyerWorkspace ? (
                      <Link
                        href="/workspace/procurement"
                        className="block px-3 py-2 font-medium text-neutral-900 hover:bg-neutral-50 hover:text-brand"
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        Buyer workspace
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-neutral-900 hover:bg-neutral-50"
                      onClick={() => void onSignOut()}
                    >
                      <LogOut className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      Sign out
                    </button>
                  </div>
                </details>
              )}

              <Link
                href="/quote-cart"
                className="relative order-2 hidden cursor-pointer items-center gap-1.5 text-neutral-800 lg:flex"
                aria-label="Quote request"
                title="Quote request"
              >
                <ShoppingCart className="h-6 w-6 shrink-0" aria-hidden />
                <span className="text-[13px] font-semibold">Quote request</span>
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
                <li className={mobileSectionLabelClass} aria-hidden>
                  Shop
                </li>
                <li className="border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <Link href="/store" className={navLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                    Catalog
                  </Link>
                </li>
                <li
                  ref={industriesMegaRef}
                  className={cn(
                    "relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2",
                    industriesMegaOpen ? "lg:z-30" : "lg:z-auto lg:hover:z-30",
                  )}
                  onMouseEnter={() => {
                    cancelMegaCloseTimer();
                    setDesktopMega("industries");
                  }}
                  onMouseLeave={() => scheduleMegaClose(industriesMegaRef.current)}
                  onBlur={(e) => {
                    const rt = e.relatedTarget as Node | null;
                    if (rt && (e.currentTarget as HTMLElement).contains(rt)) return;
                    setDesktopMega((cur) => (cur === "industries" ? null : cur));
                  }}
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
                        className={`h-4 w-4 transition-transform ${mobilePanel === "industries" ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <button
                    type="button"
                    id="nav-mega-industries-trigger"
                    aria-haspopup="true"
                    aria-expanded={industriesMegaOpen}
                    aria-controls="nav-mega-industries"
                    className={cn(megaTriggerClass, "hidden w-full justify-center lg:inline-flex")}
                    onClick={() => setDesktopMega((m) => (m === "industries" ? null : "industries"))}
                    onFocus={() => {
                      cancelMegaCloseTimer();
                      setDesktopMega("industries");
                    }}
                  >
                    Industries <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
                  </button>
                  <ul
                    className={cn(
                      "mt-0 list-none space-y-0 border-l-2 border-[brand]/35 pl-3 lg:hidden",
                      mobilePanel === "industries" ? "max-lg:block" : "max-lg:hidden",
                    )}
                  >
                    {HEADER_INDUSTRY_NAV_ITEMS.map((item) => {
                      const IndustryIcon = industryNavIconForHref(item.href);
                      return (
                        <li key={item.href} className="border-t border-neutral-200 first:border-t-0 lg:border-t-0">
                          <Link
                            href={item.href}
                            className={`${mobileNavLinkClass} flex min-h-[44px] items-center gap-3`}
                            onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[brand]/25 bg-[brand]/[0.07]">
                              <IndustryIcon className="h-[18px] w-[18px] text-[brand]" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <div
                    id="nav-mega-industries"
                    role="region"
                    aria-label="Industries menu"
                    className={cn(
                      "absolute left-1/2 top-full z-10 hidden w-[min(calc(100vw-2rem),1180px)] max-w-[calc(100vw-2rem)] -translate-x-1/2 lg:block",
                      "before:pointer-events-auto before:absolute before:left-0 before:right-0 before:top-[-10px] before:z-[1] before:h-2.5 before:content-['']",
                      "rounded-xl border border-neutral-200/80 bg-white/95 text-left shadow-lg ring-1 ring-black/[0.03] backdrop-blur-sm transition duration-150 ease-out",
                      industriesMegaOpen
                        ? "visible translate-y-0 opacity-100"
                        : "invisible translate-y-px opacity-0",
                      industriesMegaOpen ? "pointer-events-auto" : "pointer-events-none",
                    )}
                  >
                    <div className="p-3 sm:p-4">
                      <h4 className="mb-3 border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[brand]">
                        Shop by industry
                      </h4>
                      <ul className="m-0 grid list-none grid-cols-1 gap-x-5 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-6">
                        {HEADER_INDUSTRY_NAV_ITEMS.map((item) => {
                          const IndustryIcon = industryNavIconForHref(item.href);
                          return (
                            <li key={`d-${item.href}`} className="min-w-0 break-inside-avoid">
                              <Link
                                href={item.href}
                                className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] font-semibold leading-snug text-neutral-950 transition hover:bg-neutral-50 hover:text-[brand] lg:min-h-0 lg:py-1"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[brand]/25 bg-[brand]/[0.07]">
                                  <IndustryIcon className="h-4 w-4 text-[brand]" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </li>
                <li
                  ref={brandsMegaRef}
                  className={cn(
                    "relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2",
                    brandsMegaOpen ? "lg:z-30" : "lg:z-auto lg:hover:z-30",
                  )}
                  onMouseEnter={() => {
                    cancelMegaCloseTimer();
                    setDesktopMega("brands");
                  }}
                  onMouseLeave={() => scheduleMegaClose(brandsMegaRef.current)}
                  onBlur={(e) => {
                    const rt = e.relatedTarget as Node | null;
                    if (rt && (e.currentTarget as HTMLElement).contains(rt)) return;
                    setDesktopMega((cur) => (cur === "brands" ? null : cur));
                  }}
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
                        className={`h-4 w-4 transition-transform ${mobilePanel === "brands" ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <button
                    type="button"
                    id="nav-mega-brands-trigger"
                    aria-haspopup="true"
                    aria-expanded={brandsMegaOpen}
                    aria-controls="nav-mega-brands"
                    className={cn(megaTriggerClass, "hidden w-full justify-center lg:inline-flex")}
                    onClick={() => setDesktopMega((m) => (m === "brands" ? null : "brands"))}
                    onFocus={() => {
                      cancelMegaCloseTimer();
                      setDesktopMega("brands");
                    }}
                  >
                    Brands <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
                  </button>
                  <ul
                    className={cn(
                      "mt-1 max-h-64 list-none space-y-0 overflow-y-auto border-l-2 border-[brand]/35 pl-3 lg:hidden",
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
                            className="flex min-h-[44px] items-center gap-2 py-2.5 pl-0 text-[15px] font-semibold text-neutral-950 hover:text-[brand]"
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
                    id="nav-mega-brands"
                    role="region"
                    aria-label="Brands menu"
                    className={cn(
                      "absolute left-1/2 top-full z-10 hidden w-[min(calc(100vw-1.5rem),520px)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 lg:block",
                      "before:pointer-events-auto before:absolute before:left-0 before:right-0 before:top-[-10px] before:z-[1] before:h-2.5 before:content-['']",
                      "rounded-xl border border-neutral-200/80 bg-white/95 text-left shadow-lg ring-1 ring-black/[0.03] backdrop-blur-sm transition duration-150 ease-out",
                      brandsMegaOpen ? "visible translate-y-0 opacity-100" : "invisible translate-y-px opacity-0",
                      brandsMegaOpen ? "pointer-events-auto" : "pointer-events-none",
                    )}
                  >
                    <div className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-y-contain p-3 sm:p-4">
                      <h4 className="mb-2 border-b border-neutral-200 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[brand]">
                        Shop by brand
                      </h4>
                      <ul className="grid list-none grid-cols-1 gap-0.5 p-0 sm:grid-cols-2 sm:gap-x-2 sm:gap-y-0.5">
                        <li className="sm:col-span-2">
                          <Link
                            href="/brands"
                            className="flex min-h-[44px] items-center justify-between rounded-lg border border-[brand]/20 bg-[brand]/8 px-3 py-2 text-sm font-bold text-[brand] transition hover:border-[brand]/35 hover:bg-[brand]/12"
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
                                className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-sm font-semibold text-neutral-950 transition hover:border-neutral-200/90 hover:bg-neutral-50 hover:text-[brand]"
                              >
                                {logo ? (
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200/70 bg-white">
                                    <img src={logo} alt="" className="h-7 w-7 object-contain" loading="lazy" />
                                  </span>
                                ) : (
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 text-[10px] font-bold text-neutral-400">
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
                <li className="relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2">
                  <p className={mobileSectionLabelClass}>Procurement</p>
                  <details className="hidden lg:inline-block">
                    <summary
                      className={cn(
                        megaTriggerClass,
                        "list-none [&::-webkit-details-marker]:hidden inline-flex",
                      )}
                    >
                      Procurement <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
                    </summary>
                    <div className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white py-1 text-left text-[13px] shadow-lg">
                      <Link
                        href="/request-pricing"
                        className={procurementDropdownLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Tag className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          Request pricing
                        </span>
                      </Link>
                      <Link
                        href="/invoice-savings"
                        className={procurementDropdownLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          Upload invoice
                        </span>
                      </Link>
                      {showReorder ? (
                        <Link
                          href="/workspace/procurement/reorder"
                          className={procurementDropdownLinkClass}
                          onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                        >
                          <span className="inline-flex items-center gap-2">
                            <RefreshCw className="h-3.5 w-3.5 opacity-70" aria-hidden />
                            Reorder
                          </span>
                        </Link>
                      ) : null}
                      {showBuyerWorkspace ? (
                        <Link
                          href="/workspace/procurement"
                          className={procurementDropdownLinkClass}
                          onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                        >
                          Buyer workspace
                        </Link>
                      ) : null}
                    </div>
                  </details>
                  <ul className="list-none lg:hidden">
                    <li>
                      <Link
                        href="/quote-cart"
                        className={`${mobileNavLinkClass} flex items-center gap-2 font-bold text-brand`}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden />
                        Quote request
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/request-pricing"
                        className={mobileNavLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        Request pricing
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/invoice-savings"
                        className={mobileNavLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        Upload invoice
                      </Link>
                    </li>
                    {showReorder ? (
                      <li>
                        <Link
                          href="/workspace/procurement/reorder"
                          className={mobileNavLinkClass}
                          onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                        >
                          Reorder
                        </Link>
                      </li>
                    ) : null}
                    {showBuyerWorkspace ? (
                      <li>
                        <Link
                          href="/workspace/procurement"
                          className={mobileNavLinkClass}
                          onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                        >
                          Buyer workspace
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                </li>
                <li className={mobileSectionLabelClass} aria-hidden>
                  Account
                </li>
                {auth.kind === "anonymous" ? (
                  <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                    <Link href="/login" className={navLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                      Sign in
                    </Link>
                  </li>
                ) : (
                  <>
                    <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                      <Link href="/account" className={navLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                        Account home
                      </Link>
                    </li>
                    <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                      <Link
                        href="/account/quicklist"
                        className={navLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        Glove quicklist
                      </Link>
                    </li>
                    <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                      <button
                        type="button"
                        className={`${navLinkClass} w-full border-0 bg-transparent text-left`}
                        onClick={() => {
                          closeMobileNav(setMobileOpen, setMobilePanel);
                          void onSignOut();
                        }}
                      >
                        Sign out
                      </button>
                    </li>
                  </>
                )}
                <li className={cn(mobileSectionLabelClass, "lg:hidden")} aria-hidden>
                  Help
                </li>
                <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                  <Link
                    href="/glove-finder"
                    className={`${navLinkClass} text-neutral-600`}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    AI glove finder (optional)
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                  <Link
                    href="/faq"
                    className={navLinkClass}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Support
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                  <Link
                    href="/resources"
                    className={navLinkClass}
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Resources
                  </Link>
                </li>
                <li className="border-b border-neutral-100 py-3 lg:hidden lg:border-0 lg:py-2">
                  <Link href="/contact" className={navLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                    Contact
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
