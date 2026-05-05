import Link from "next/link";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/industries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileText, LayoutGrid, Package } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";
import { BrandStrip } from "@/components/home/BrandStrip";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { TrustStrip } from "@/components/home/TrustStrip";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[hsl(var(--background))]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--background))]/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-xl font-semibold text-white shrink-0">
            GloveCubs
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href="/store" className="text-white/75 hover:text-white">
              Shop Gloves
            </Link>
            <a href="#bulk-order" className="text-white/75 hover:text-white">
              Bulk Order
            </a>
            <a href="#industries" className="text-white/75 hover:text-white">
              Industries
            </a>
            <Link href="/invoice-savings" className="text-white/75 hover:text-white">
              Invoice Savings
            </Link>
            {MAIN_SITE_URL ? (
              <a href={MAIN_SITE_URL} className="text-white/55 hover:text-white hidden sm:inline" target="_blank" rel="noopener noreferrer">
                Full site
              </a>
            ) : null}
            <Button asChild size="sm" className="bg-[hsl(var(--primary))] text-white hover:opacity-90 ml-0 sm:ml-2">
              <Link href="/request-pricing">Request Pricing</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {/* Hero + builder */}
        <section className="mt-6 lg:mt-10 mb-10 lg:mb-12 grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <div className="space-y-6 order-2 lg:order-1">
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white tracking-tight leading-tight">
              Bulk Gloves by the Case — Built for Operators Who Reorder Fast
            </h1>
            <p className="text-lg text-white/70 max-w-xl">
              Nitrile, latex, vinyl. Case pricing. Fast fulfillment.
            </p>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Button asChild size="lg" className="bg-[hsl(var(--primary))] text-white hover:opacity-90">
                <a href="#bulk-order">Build Bulk Order</a>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10">
                <Link href="/store">
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Browse Catalog
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10">
                <Link href="/invoice-savings">
                  <FileText className="mr-2 h-4 w-4" />
                  Upload Invoice
                </Link>
              </Button>
            </div>
            {MAIN_SITE_URL ? (
              <p className="text-sm text-white/45">
                <a href={MAIN_SITE_URL} className="underline hover:text-white/80" target="_blank" rel="noopener noreferrer">
                  Open full GloveCubs site
                </a>{" "}
                — cart, checkout, account.
              </p>
            ) : null}
          </div>
          <div className="order-1 lg:order-2 min-w-0">
            <QuickBulkBuilder />
          </div>
        </section>

        <BrandStrip />

        <CategoryShowcase />

        <TrustStrip />

        {/* Industries — demoted */}
        <section id="industries" className="scroll-mt-24 py-10 border-t border-white/10">
          <h2 className="text-lg font-medium text-white/90 mb-1 text-center">Browse by industry</h2>
          <p className="text-white/45 text-sm text-center mb-8">Tailored collections and use cases.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {INDUSTRY_KEYS.map((key) => {
              const config = INDUSTRIES[key];
              return (
                <Link key={key} href={`/industries/${key}`}>
                  <Card
                    className={`h-full rounded-xl border-white/10 bg-white/[0.03] transition-all hover:border-white/20 hover:bg-white/[0.06] ${config.accentClass}`}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-base">{config.name}</CardTitle>
                      <CardDescription className="text-white/55 text-sm line-clamp-2">{config.tagline}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <span className="text-sm text-white/70 inline-flex items-center">
                        View industry <ChevronRight className="h-4 w-4 ml-1" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Invoice savings */}
        <section className="py-10 border-t border-white/10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-8 sm:px-10 sm:py-10 text-center max-w-3xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">
              Already buying gloves? Let&apos;s check your invoice for savings.
            </h2>
            <p className="text-white/60 text-sm mb-6">
              Upload a recent invoice—we&apos;ll review line items and reply with options.
            </p>
            <Button asChild size="lg" className="bg-[hsl(var(--primary))] text-white hover:opacity-90">
              <Link href="/invoice-savings">Upload invoice</Link>
            </Button>
          </div>
        </section>

        <ServiceAreaPanel />

        {/* Final CTA */}
        <section className="py-12 border-t border-white/10 text-center">
          <h2 className="text-2xl font-semibold text-white mb-6">Ready to buy gloves by the case?</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[hsl(var(--primary))] text-white hover:opacity-90">
              <a href="#bulk-order">Build bulk order</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10">
              <Link href="/request-pricing">Request pricing</Link>
            </Button>
          </div>
        </section>

        {MAIN_SITE_URL ? (
          <div className="mt-8 pt-10 border-t border-white/10 text-center pb-8">
            <p className="text-white/45 text-sm mb-4">Prefer shopping the full catalog with cart and account?</p>
            <Button asChild size="lg" variant="secondary">
              <a href={MAIN_SITE_URL} target="_blank" rel="noopener noreferrer">
                <Package className="mr-2 h-4 w-4" />
                Open full GloveCubs site
              </a>
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
