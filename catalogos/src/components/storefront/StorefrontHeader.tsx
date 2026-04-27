"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { getStorefrontNavCategories } from "@/lib/product-types";
import { QuoteBasketLink } from "@/components/storefront/QuoteBasketLink";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CATEGORY_SLUGS = getStorefrontNavCategories();

const BUYING_GUIDES = [
  { slug: "best-nitrile-gloves-for-food-service", label: "Food service" },
  { slug: "best-disposable-gloves-for-mechanics", label: "Mechanics" },
  { slug: "best-gloves-for-janitorial-cleaning", label: "Janitorial" },
] as const;

const GLOVE_CATEGORY_LINKS = [
  { slug: "disposable_gloves", label: "Disposable", q: "" },
  { slug: "disposable_gloves", label: "Nitrile", q: "material=nitrile" },
  { slug: "disposable_gloves", label: "Latex", q: "material=latex" },
  { slug: "disposable_gloves", label: "Vinyl", q: "material=vinyl" },
  { slug: "disposable_gloves", label: "Heavy Duty", q: "thickness_mil=6,7,8,9,10" },
  { slug: "disposable_gloves", label: "Food Service", q: "grade=food_service_grade" },
] as const;

const drawerLinkClass =
  "flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";

const desktopLinkClass =
  "inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground md:px-2";

function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</p>
        <ul className="space-y-1">
          {CATEGORY_SLUGS.map(({ slug, label }) => (
            <li key={slug}>
              <Link href={`/catalog/${slug}`} className={drawerLinkClass} onClick={onNavigate}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gloves</p>
        <ul className="space-y-1">
          {GLOVE_CATEGORY_LINKS.map(({ slug, label, q }, i) => (
            <li key={`${slug}-${label}-${i}`}>
              <Link href={q ? `/catalog/${slug}?${q}` : `/catalog/${slug}`} className={drawerLinkClass} onClick={onNavigate}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guides</p>
        <ul className="space-y-1">
          {BUYING_GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/best/${g.slug}`} className={drawerLinkClass} onClick={onNavigate}>
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border pt-4">
        <QuoteBasketLink className={drawerLinkClass} variant="desktop" onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function StorefrontHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 md:min-h-0 md:py-3">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 md:flex-initial md:justify-start">
            <Link
              href="/catalog/disposable_gloves"
              className="inline-flex min-h-11 shrink-0 items-center font-semibold text-foreground"
            >
              GloveCubs
            </Link>
            <div className="flex items-center gap-2 md:hidden">
              <QuoteBasketLink variant="compact" />
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                aria-expanded={menuOpen}
                aria-controls="storefront-mobile-menu"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>

          <nav
            className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-2 md:flex lg:gap-x-3"
            aria-label="Primary"
          >
            {CATEGORY_SLUGS.map(({ slug, label }) => (
              <Link key={slug} href={`/catalog/${slug}`} className={desktopLinkClass}>
                {label}
              </Link>
            ))}
            {GLOVE_CATEGORY_LINKS.map(({ slug, label, q }, i) => (
              <Link
                key={`${slug}-${label}-${i}`}
                href={q ? `/catalog/${slug}?${q}` : `/catalog/${slug}`}
                className={desktopLinkClass}
              >
                {label}
              </Link>
            ))}
            {BUYING_GUIDES.map((g) => (
              <Link key={g.slug} href={`/best/${g.slug}`} className={desktopLinkClass}>
                {g.label}
              </Link>
            ))}
            <QuoteBasketLink variant="desktop" />
          </nav>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="z-50 w-full max-w-sm" id="storefront-mobile-menu">
          <SheetHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <SheetTitle>Menu</SheetTitle>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </SheetHeader>
          <SheetBody>
            <NavSections onNavigate={() => setMenuOpen(false)} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
