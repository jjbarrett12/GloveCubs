import Link from "next/link";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
};
import { QuoteBasketProvider } from "@/contexts/QuoteBasketContext";
import { QuoteBasketLink } from "@/components/storefront/QuoteBasketLink";
import { CompareProvider } from "@/components/storefront/CompareContext";
import { CompareDrawer } from "@/components/storefront/CompareDrawer";
import { getStorefrontNavCategories } from "@/lib/product-types";

const CATEGORY_SLUGS = getStorefrontNavCategories();

/** SEO / buying guide landing pages. */
const BUYING_GUIDES = [
  { slug: "best-nitrile-gloves-for-food-service", label: "Food service" },
  { slug: "best-disposable-gloves-for-mechanics", label: "Mechanics" },
  { slug: "best-gloves-for-janitorial-cleaning", label: "Janitorial" },
] as const;

/** Primary glove categories: map to catalog with material/category filters. */
const GLOVE_CATEGORY_LINKS = [
  { slug: "disposable_gloves", label: "Disposable", q: "" },
  { slug: "disposable_gloves", label: "Nitrile", q: "material=nitrile" },
  { slug: "disposable_gloves", label: "Latex", q: "material=latex" },
  { slug: "disposable_gloves", label: "Vinyl", q: "material=vinyl" },
  { slug: "disposable_gloves", label: "Heavy Duty", q: "thickness_mil=6,7,8,9,10" },
  { slug: "disposable_gloves", label: "Food Service", q: "grade=food_service_grade" },
] as const;

export default function StorefrontLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <QuoteBasketProvider>
      <CompareProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <Link href="/catalog/disposable_gloves" className="font-semibold text-foreground">
              GloveCubs
            </Link>
            <nav className="flex flex-wrap items-center gap-4 text-sm">
              {CATEGORY_SLUGS.map(({ slug, label }) => (
                <Link key={slug} href={`/catalog/${slug}`} className="text-muted-foreground hover:text-foreground">
                  {label}
                </Link>
              ))}
              <span className="text-muted-foreground">|</span>
              {GLOVE_CATEGORY_LINKS.map(({ slug, label, q }, i) => (
                <Link
                  key={`${slug}-${label}-${i}`}
                  href={q ? `/catalog/${slug}?${q}` : `/catalog/${slug}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {label}
                </Link>
              ))}
              <span className="text-muted-foreground">|</span>
              {BUYING_GUIDES.map((g) => (
                <Link
                  key={g.slug}
                  href={`/best/${g.slug}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {g.label}
                </Link>
              ))}
              <QuoteBasketLink />
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
        <CompareDrawer />
      </div>
      </CompareProvider>
    </QuoteBasketProvider>
  );
}
