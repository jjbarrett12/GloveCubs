"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  Boxes,
} from "lucide-react";
import { HOME_BRAND_LIST } from "@/config/homeBrands";
import { HeaderWordmark } from "@/components/home/HeaderWordmark";
import { HomeBrandLogo } from "@/components/home/HomeBrandLogo";
import { industryNavIconForHref } from "@/config/industryNavIcons";
import { HEADER_INDUSTRY_NAV_ITEMS } from "@/config/publicNav";
import { SITE_PHONE_TEL_HREF, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import type { CommerceHeaderAuth } from "@/lib/customer/commerce-header-auth";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";
import { HeaderTrustStrip } from "@/components/header/HeaderTrustStrip";

const UTILITY_CAPABILITIES = [
  { label: "Case & pallet pricing", nudge: true },
  { label: "Net terms available", nudge: false },
  { label: "Nationwide fulfillment", nudge: false },
] as const;

/** Left rail: “All industries” + primary industry landings. */
const INDUSTRY_MEGA_RAIL_COUNT = 5;

const NAV_MEGA_PANEL_SHELL =
  "w-full overflow-hidden rounded-xl border border-[#e7e7e7]/90 bg-white/95 text-left shadow-[0_24px_60px_rgb(0_0_0/0.14)] backdrop-blur-md";

function navMegaPanelMotion(open: boolean) {
  return cn(
    "transition duration-200 ease-out motion-reduce:transition-none",
    open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
    open ? "pointer-events-auto" : "pointer-events-none",
  );
}

function isMegaHoverTarget(related: Node | null, ...nodes: (HTMLElement | null | undefined)[]) {
  return related != null && nodes.some((n) => n?.contains(related));
}

type NavMegaPortalProps = {
  open: boolean;
  topPx: number;
  panelId: string;
  ariaLabel: string;
  widthClass: string;
  panelRef: React.Ref<HTMLDivElement>;
  slotRef: React.Ref<HTMLDivElement>;
  onMouseEnter: () => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  children: React.ReactNode;
};

function NavMegaPortal({
  open,
  topPx,
  panelId,
  ariaLabel,
  widthClass,
  panelRef,
  slotRef,
  onMouseEnter,
  onMouseLeave,
  children,
}: NavMegaPortalProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={slotRef}
      className={cn(
        "fixed left-1/2 z-[100] hidden -translate-x-1/2 pt-2.5 lg:block",
        widthClass,
        navMegaPanelMotion(open),
      )}
      style={{ top: topPx }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div ref={panelRef} id={panelId} role="region" aria-label={ariaLabel} className={NAV_MEGA_PANEL_SHELL}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Stacking (keep below `components/ui/dialog.tsx` overlay z-50; above page content).
 * - Page / hero: default (0–1).
 * - Sticky header: z-40.
 * - Mega-panels: fixed + portaled to `body`, centered with `left: 1/2` / `-translate-x-1/2`, z-[100].
 * - Dialogs / modals: z-50+ (canonical overlay).
 * - Legacy mobile drawers (e.g. store): z-[1200] — unchanged.
 */

function closeMobileNav(setMobileOpen: (v: boolean) => void, setMobilePanel: (v: "industries" | "programs" | null) => void) {
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
  const [mobilePanel, setMobilePanel] = React.useState<"industries" | "programs" | null>(null);
  const [desktopMega, setDesktopMega] = React.useState<"industries" | "programs" | null>(null);
  const secondaryNavRef = React.useRef<HTMLDivElement | null>(null);
  const industriesMegaRef = React.useRef<HTMLLIElement | null>(null);
  const programsMegaRef = React.useRef<HTMLLIElement | null>(null);
  const industriesMegaSlotRef = React.useRef<HTMLDivElement | null>(null);
  const industriesMegaPanelRef = React.useRef<HTMLDivElement | null>(null);
  const programsMegaSlotRef = React.useRef<HTMLDivElement | null>(null);
  const programsMegaPanelRef = React.useRef<HTMLDivElement | null>(null);
  /** Browser timer id (`window.setTimeout`); avoid `NodeJS.Timeout` mismatch in Next typecheck. */
  const megaCloseTimerRef = React.useRef<number | null>(null);
  const [megaMenuTopPx, setMegaMenuTopPx] = React.useState(0);

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

  React.useLayoutEffect(() => {
    if (desktopMega == null) return;

    const updateTop = () => {
      const el = secondaryNavRef.current;
      if (!el) return;
      setMegaMenuTopPx(el.getBoundingClientRect().bottom);
    };

    updateTop();
    const ro = new ResizeObserver(updateTop);
    if (secondaryNavRef.current) ro.observe(secondaryNavRef.current);
    window.addEventListener("resize", updateTop);
    window.addEventListener("scroll", updateTop, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateTop);
      window.removeEventListener("scroll", updateTop, true);
    };
  }, [desktopMega]);

  React.useEffect(() => {
    if (desktopMega == null) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (industriesMegaRef.current?.contains(t)) return;
      if (programsMegaRef.current?.contains(t)) return;
      if (industriesMegaSlotRef.current?.contains(t)) return;
      if (programsMegaSlotRef.current?.contains(t)) return;
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
    "block py-2.5 text-[14px] font-semibold text-neutral-800 hover:text-brand lg:py-2";

  const mobileNavLinkClass = navLinkClass;

  const mobileSectionLabelClass =
    "mb-1 mt-3 border-t border-neutral-300/70 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500 first:mt-0 first:border-t-0 first:pt-0 lg:hidden";

  const megaTriggerClass =
    "header-nav-link border-0 bg-transparent p-0 shadow-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm";

  const dropdownLinkClass =
    "block px-3 py-2 text-[13px] font-medium text-neutral-800 hover:bg-neutral-200/50 hover:text-neutral-950 focus-visible:bg-neutral-200/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/30";

  const headerPrimaryCtaClass =
    "hidden min-h-10 shrink-0 items-center justify-center rounded-[5px] bg-brand px-6 py-2 text-[12px] font-bold uppercase tracking-[0.07em] text-white shadow-sm transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:inline-flex";

  const headerSecondaryCtaClass =
    "hidden min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-neutral-500/70 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-800 transition hover:border-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:inline-flex";

  const headerTertiaryLinkClass =
    "hidden items-center gap-1.5 text-[11px] font-medium text-neutral-600 transition hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-sm lg:inline-flex";

  const mobileProcurementPrimaryClass =
    "flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-[14px] font-bold text-white shadow-sm hover:bg-brand-hover";

  const mobileProcurementSecondaryClass =
    "flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-500/80 bg-white px-4 py-2.5 text-[14px] font-semibold text-neutral-800 hover:border-neutral-700 hover:bg-neutral-50";

  const showReorder = auth.kind === "signed_in" && auth.showWorkspace;
  const showBuyerWorkspace = auth.kind === "signed_in" && auth.showWorkspace;

  const industriesMegaOpen = desktopMega === "industries";
  const programsMegaOpen = desktopMega === "programs";

  const industryRailItems = HEADER_INDUSTRY_NAV_ITEMS.slice(0, INDUSTRY_MEGA_RAIL_COUNT);
  const industryColumnItems = HEADER_INDUSTRY_NAV_ITEMS.slice(INDUSTRY_MEGA_RAIL_COUNT);

  function handleMegaNavLeave(
    e: React.MouseEvent,
    liRef: React.RefObject<HTMLLIElement | null>,
    panelRef: React.RefObject<HTMLDivElement | null>,
    slotRef: React.RefObject<HTMLDivElement | null>,
  ) {
    const related = e.relatedTarget as Node | null;
    if (isMegaHoverTarget(related, liRef.current, panelRef.current, slotRef.current)) return;
    scheduleMegaClose(liRef.current);
  }

  return (
    <div className="header-sticky-bridge sticky top-0 z-40">
      <div className="overflow-x-hidden border-b border-neutral-800 bg-[#141414] py-1 text-[10px] font-medium leading-tight text-neutral-300 sm:py-1.5">
        <div className="mx-auto flex min-w-0 max-w-7xl flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 sm:px-6 lg:px-8">
          <div className="hidden flex-wrap items-center gap-x-2.5 gap-y-0.5 sm:flex">
            {UTILITY_CAPABILITIES.map((cap, i) => (
              <React.Fragment key={cap.label}>
                {i > 0 ? <span className="text-neutral-600" aria-hidden>·</span> : null}
                <span
                  className={cn(
                    "uppercase tracking-[0.08em]",
                    cap.nudge && "animate-header-sku-nudge inline-block text-neutral-100",
                  )}
                >
                  {cap.label}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5 sm:gap-3">
            <a href={SITE_PHONE_TEL_HREF} className="inline-flex items-center gap-1.5 hover:text-white">
              <Phone className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              <span className="uppercase tracking-wide">Phone</span>
            </a>
            <a href={SITE_SALES_MAILTO_HREF} className="inline-flex items-center gap-1.5 hover:text-white">
              <Mail className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              <span className="uppercase tracking-wide">Email</span>
            </a>
            <Link href="/contact" className="inline-flex items-center gap-1.5 hover:text-white">
              <MessageCircle className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              <span className="uppercase tracking-wide">Contact</span>
            </Link>
            <Link href="/quote-cart" className="inline-flex items-center gap-1.5 text-neutral-100 hover:text-brand-soft">
              <span className="uppercase tracking-wide">Quote support</span>
            </Link>
          </div>
        </div>
      </div>

      <header className="overflow-visible border-b border-[#e7e7e7] bg-white text-neutral-950 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-7xl min-w-0 px-4 py-1.5 sm:px-6 lg:px-8 lg:py-1.5">
          <div className="overflow-x-clip lg:overflow-visible">
            <div className="grid min-w-0 grid-cols-1 items-center gap-2 lg:grid-cols-[auto_1fr] lg:gap-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <HeaderWordmark onNavigate={() => closeMobileNav(setMobileOpen, setMobilePanel)} />
                <span
                  className={cn(
                    "hidden shrink-0 items-center gap-0.5 rounded-full border border-[#0a0a0a]/10",
                    "bg-[var(--color-accent-orange)] px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.1em] text-[#0a0a0a]",
                    "shadow-[0_0_8px_rgb(255_106_0/0.22)] sm:inline-flex sm:px-2 sm:py-0.5 sm:text-[9px]"
                  )}
                >
                  <Boxes className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  Authorized Distributor
                </span>
              </div>

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

            <div className="flex min-w-0 w-full flex-wrap items-center justify-end gap-2 sm:gap-3 lg:gap-4">
              <form
                onSubmit={onSearch}
                className="order-3 flex h-10 min-w-0 max-w-full flex-1 basis-[min(100%,480px)] items-stretch overflow-hidden rounded-[5px] border border-neutral-500/80 bg-white shadow-sm focus-within:border-neutral-700 focus-within:ring-1 focus-within:ring-neutral-600/20 lg:order-none lg:h-11 lg:max-w-[460px]"
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search gloves, specs, ANSI, thickness, case quantity…"
                  className="min-w-0 flex-1 border-0 bg-transparent px-4 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-600"
                  aria-label="Search catalog"
                />
                <button
                  type="submit"
                  className="flex w-10 shrink-0 items-center justify-center bg-neutral-800 text-white hover:bg-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 lg:w-11"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>
              </form>

              <div className="order-1 flex shrink-0 items-center gap-2">
                <Link href="/request-pricing" className={headerPrimaryCtaClass}>
                  Request pricing
                </Link>
                <Link href="/invoice-savings" className={headerSecondaryCtaClass}>
                  Upload invoice
                </Link>
              </div>

              <div className="order-2 hidden shrink-0 items-center gap-3 border-l border-neutral-300/90 pl-3 lg:flex">
              <Link href="/quote-cart" className={headerTertiaryLinkClass} aria-label="Quote request">
                <ShoppingCart className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Quote request
              </Link>

              {auth.kind === "anonymous" ? (
                <Link href="/login" className={headerTertiaryLinkClass}>
                  Account
                </Link>
              ) : (
                <details className="relative hidden lg:inline-block">
                  <summary className={cn(headerTertiaryLinkClass, "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
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
              </div>

            </div>
          </div>
          </div>

          {/* Secondary nav — mega panels anchor to this row (centered), not to individual <li> */}
          <div
            ref={secondaryNavRef}
            className={`relative border-t border-neutral-300/60 px-4 pb-1 pt-1 sm:px-6 lg:block lg:overflow-visible lg:px-8 ${
              mobileOpen
                ? "max-lg:block max-lg:max-h-[min(70vh,calc(100dvh-9rem))] max-lg:overflow-y-auto max-lg:overflow-x-hidden max-lg:overscroll-y-contain"
                : "max-lg:hidden max-lg:overflow-hidden"
            }`}
          >
            <nav aria-label="Primary">
              <ul className="flex list-none flex-col gap-0 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-7 lg:gap-y-1 xl:gap-x-9">
                <li className="lg:hidden">
                  <p className={cn(mobileSectionLabelClass, "mt-0 border-t-0 pt-0")}>Procurement</p>
                  <ul className="mb-2 list-none space-y-2.5">
                    <li>
                      <Link
                        href="/request-pricing"
                        className={mobileProcurementPrimaryClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        <Tag className="h-4 w-4 shrink-0" aria-hidden />
                        Request pricing
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/invoice-savings"
                        className={mobileProcurementSecondaryClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        <FileText className="h-4 w-4 shrink-0" aria-hidden />
                        Upload invoice
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/#bulk-order"
                        className={mobileNavLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Boxes className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                          Start bulk order
                        </span>
                      </Link>
                    </li>
                  </ul>
                </li>
                <li className={mobileSectionLabelClass} aria-hidden>
                  Shop
                </li>
                <li className="border-b border-neutral-100 py-2.5 lg:border-0 lg:py-0">
                  <Link href="/store" className="header-nav-link max-lg:block max-lg:py-2.5" onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
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
                    const el = secondaryNavRef.current;
                    if (el) setMegaMenuTopPx(el.getBoundingClientRect().bottom);
                  }}
                  onMouseLeave={(e) => handleMegaNavLeave(e, industriesMegaRef, industriesMegaPanelRef, industriesMegaSlotRef)}
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
                    className={cn(
                      megaTriggerClass,
                      "header-nav-link hidden w-full justify-center lg:inline-flex",
                    )}
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
                </li>
                <li
                  ref={programsMegaRef}
                  className={cn(
                    "relative border-b border-neutral-100 py-3 lg:border-0 lg:py-2",
                    programsMegaOpen ? "lg:z-30" : "lg:z-auto lg:hover:z-30",
                  )}
                  onMouseEnter={() => {
                    cancelMegaCloseTimer();
                    setDesktopMega("programs");
                    const el = secondaryNavRef.current;
                    if (el) setMegaMenuTopPx(el.getBoundingClientRect().bottom);
                  }}
                  onMouseLeave={(e) => handleMegaNavLeave(e, programsMegaRef, programsMegaPanelRef, programsMegaSlotRef)}
                  onBlur={(e) => {
                    const rt = e.relatedTarget as Node | null;
                    if (rt && (e.currentTarget as HTMLElement).contains(rt)) return;
                    setDesktopMega((cur) => (cur === "programs" ? null : cur));
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-2 lg:hidden">
                    <span className={navLinkClass}>Programs</span>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-200 p-2 text-neutral-800"
                      aria-expanded={mobilePanel === "programs"}
                      aria-label="Toggle brands menu"
                      onClick={() => setMobilePanel((p) => (p === "programs" ? null : "programs"))}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${mobilePanel === "programs" ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <button
                    type="button"
                    id="nav-mega-brands-trigger"
                    aria-haspopup="true"
                    aria-expanded={programsMegaOpen}
                    aria-controls="nav-mega-brands"
                    className={cn(
                      megaTriggerClass,
                      "header-nav-link hidden w-full justify-center lg:inline-flex",
                    )}
                    onClick={() => setDesktopMega((m) => (m === "programs" ? null : "programs"))}
                    onFocus={() => {
                      cancelMegaCloseTimer();
                      setDesktopMega("programs");
                    }}
                  >
                    Programs <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
                  </button>
                  <ul
                    className={cn(
                      "mt-1 max-h-64 list-none space-y-0 overflow-y-auto border-l-2 border-[brand]/35 pl-3 lg:hidden",
                      mobilePanel === "programs" ? "max-lg:block" : "max-lg:hidden",
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
                    {HOME_BRAND_LIST.map((b) => (
                        <li key={b} className="border-t border-neutral-200">
                          <Link
                            href={getStoreHrefForBrandDisplayNameSearch(b)}
                            className="flex min-h-[44px] items-center gap-2.5 py-2.5 pl-0 text-[15px] font-semibold text-neutral-950 hover:text-[var(--color-accent-orange)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)]"
                            onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                          >
                            <HomeBrandLogo
                              brand={b}
                              className="h-8 w-[88px] shrink-0"
                              imgClassName="h-7 w-auto max-w-[88px]"
                            />
                            {b}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </li>
                <li className="border-b border-neutral-100 py-2.5 lg:border-0 lg:py-0">
                  <Link
                    href="/invoice-savings"
                    className="header-nav-link max-lg:block max-lg:py-2.5"
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    Invoice analysis
                  </Link>
                </li>
                <li className="relative border-b border-neutral-100 py-2.5 lg:border-0 lg:py-0">
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
                        href="/#bulk-order"
                        className={dropdownLinkClass}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Boxes className="h-3.5 w-3.5 opacity-70" aria-hidden />
                          Start bulk order
                        </span>
                      </Link>
                      {showReorder ? (
                        <Link
                          href="/workspace/procurement/reorder"
                          className={dropdownLinkClass}
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
                          className={dropdownLinkClass}
                          onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                        >
                          Buyer workspace
                        </Link>
                      ) : null}
                    </div>
                  </details>
                  {showReorder || showBuyerWorkspace ? (
                  <ul className="mt-2 list-none border-t border-neutral-100 pt-2 lg:hidden">
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
                  ) : null}
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
                <li className="relative border-b border-neutral-100 py-2.5 lg:border-0 lg:py-0">
                  <details className="hidden lg:inline-block">
                    <summary
                      className={cn(megaTriggerClass, "list-none [&::-webkit-details-marker]:hidden inline-flex")}
                    >
                      Support <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
                    </summary>
                    <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-md border border-[#e7e7e7] bg-white py-1 text-left text-[13px] shadow-md">
                      <Link href="/faq" className={dropdownLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                        FAQ
                      </Link>
                      <Link href="/resources" className={dropdownLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                        Resources
                      </Link>
                      <Link href="/contact" className={dropdownLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                        Contact
                      </Link>
                      <Link
                        href="/glove-finder"
                        className={cn(dropdownLinkClass, "text-neutral-500")}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                      >
                        AI glove finder (optional)
                      </Link>
                    </div>
                  </details>
                  <span className={cn(navLinkClass, "lg:hidden")}>Support</span>
                  <ul className="mt-1 list-none border-l border-neutral-300/80 pl-3 lg:hidden">
                    <li>
                      <Link href="/faq" className={mobileNavLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                        FAQ
                      </Link>
                    </li>
                    <li>
                      <Link href="/resources" className={mobileNavLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                        Resources
                      </Link>
                    </li>
                    <li>
                      <Link href="/contact" className={mobileNavLinkClass} onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}>
                        Contact
                      </Link>
                    </li>
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
          <HeaderTrustStrip />
        </div>
      </header>

      <NavMegaPortal
        open={industriesMegaOpen}
        topPx={megaMenuTopPx}
        panelId="nav-mega-industries"
        ariaLabel="Industries menu"
        widthClass="w-[min(1400px,calc(100vw-48px))] max-w-[calc(100vw-48px)]"
        panelRef={industriesMegaPanelRef}
        slotRef={industriesMegaSlotRef}
        onMouseEnter={() => {
          cancelMegaCloseTimer();
          setDesktopMega("industries");
        }}
        onMouseLeave={(e) => handleMegaNavLeave(e, industriesMegaRef, industriesMegaPanelRef, industriesMegaSlotRef)}
      >
        <div className="min-w-0 p-4 sm:p-5">
          <h4 className="mb-4 border-b border-neutral-200/90 pb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[brand]">
            Shop by industry
          </h4>
          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
            <aside className="min-w-0 border-neutral-200/80 lg:border-r lg:pr-6">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">Featured</p>
              <ul className="m-0 list-none space-y-0.5">
                {industryRailItems.map((item) => {
                  const IndustryIcon = industryNavIconForHref(item.href);
                  const featured = item.href === "/industries";
                  return (
                    <li key={`rail-${item.href}`}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-semibold leading-snug transition",
                          featured
                            ? "border border-[brand]/25 bg-[brand]/[0.08] text-[brand] hover:border-[brand]/40 hover:bg-[brand]/12"
                            : "text-neutral-950 hover:bg-neutral-50 hover:text-[brand]",
                        )}
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
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
            </aside>
            <div className="min-w-0 overflow-x-auto">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500 lg:sr-only">
                All categories
              </p>
              <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                {industryColumnItems.map((item) => {
                  const IndustryIcon = industryNavIconForHref(item.href);
                  return (
                    <li key={`col-${item.href}`} className="min-w-0">
                      <Link
                        href={item.href}
                        className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] font-semibold leading-snug text-neutral-950 transition hover:bg-neutral-50 hover:text-[brand]"
                        onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
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
        </div>
      </NavMegaPortal>

      <NavMegaPortal
        open={programsMegaOpen}
        topPx={megaMenuTopPx}
        panelId="nav-mega-brands"
        ariaLabel="Programs menu"
        widthClass="w-[min(520px,calc(100vw-48px))] max-w-[calc(100vw-48px)]"
        panelRef={programsMegaPanelRef}
        slotRef={programsMegaSlotRef}
        onMouseEnter={() => {
          cancelMegaCloseTimer();
          setDesktopMega("programs");
        }}
        onMouseLeave={(e) => handleMegaNavLeave(e, programsMegaRef, programsMegaPanelRef, programsMegaSlotRef)}
      >
        <div className="max-h-[min(70vh,520px)] min-w-0 overflow-y-auto overscroll-y-contain p-4 sm:p-5">
          <h4 className="mb-3 border-b border-neutral-200/90 pb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[brand]">
            Brands &amp; supply programs
          </h4>
          <ul className="m-0 grid list-none grid-cols-1 gap-0.5 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-0.5">
            <li className="sm:col-span-2">
              <Link
                href="/brands"
                className="flex min-h-[44px] items-center justify-between rounded-lg border border-[brand]/20 bg-[brand]/8 px-3 py-2 text-sm font-bold text-[brand] transition hover:border-[brand]/35 hover:bg-[brand]/12"
                onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
              >
                <span>All brands</span>
                <span aria-hidden>→</span>
              </Link>
            </li>
            {HOME_BRAND_LIST.map((b) => (
                <li key={b}>
                  <Link
                    href={getStoreHrefForBrandDisplayNameSearch(b)}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-sm font-semibold text-neutral-950 transition hover:border-neutral-200/90 hover:bg-neutral-50 hover:text-[var(--color-accent-orange)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)]"
                    onClick={() => closeMobileNav(setMobileOpen, setMobilePanel)}
                  >
                    <span className="flex h-9 w-[88px] shrink-0 items-center justify-center rounded-md border border-neutral-200/70 bg-white px-1">
                      <HomeBrandLogo brand={b} className="h-8 w-full" imgClassName="h-7 w-auto max-w-[80px]" />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{b}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </NavMegaPortal>
    </div>
  );
}
