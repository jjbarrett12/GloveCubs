import Link from "next/link";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/industries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileText, LayoutGrid, Package } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { TrustStrip } from "@/components/home/TrustStrip";
import { ServiceAreaPanel } from "@/components/home/ServiceAreaPanel";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      <SiteHeader />

      {/* Full-bleed hero */}
      <section className="relative border-b border-white/10">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_70%_-10%,hsl(var(--primary))/22,transparent_55%),radial-gradient(ellipse_50%_45%_at_0%_100%,hsl(var(--primary))/10,transparent_48%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="order-2 space-y-6 lg:order-1">
              <p className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/75">
                <span className="text-[hsl(var(--primary))]">●</span>
                Authorized distributor · Case pricing · Fast fulfillment
              </p>
              <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.15rem]">
                Bulk Gloves by the Case — Built for Operators Who Reorder Fast
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-white/70 sm:text-xl">
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
            <div className="order-1 min-w-0 lg:order-2">
              <QuickBulkBuilder />
            </div>
          </div>
        </div>
      </section>

      <BrandCarousel />

      <main className="flex-1">
        <div className="bg-[hsl(222_47%_5.5%)]">
          <CategoryShowcase />
        </div>

        <TrustStrip />

        <section id="industries" className="scroll-mt-24 border-t border-white/10 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center text-xl font-bold text-white sm:text-2xl">Browse by industry</h2>
            <p className="mx-auto mt-2 max-w-lg text-center text-sm text-white/50">
              Tailored collections and use cases—open a vertical to see how we support that program.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {INDUSTRY_KEYS.map((key) => {
                const config = INDUSTRIES[key];
                return (
                  <Link key={key} href={`/industries/${key}`}>
                    <Card
                      className={`group h-full rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg hover:shadow-black/25 ${config.accentClass}`}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base font-bold text-white sm:text-lg">{config.name}</CardTitle>
                        <CardDescription className="text-sm leading-relaxed text-white/55 line-clamp-2">
                          {config.tagline}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <span className="inline-flex items-center text-sm font-semibold text-[hsl(var(--primary))]">
                          View industry
                          <ChevronRight className="ml-0.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-[hsl(222_47%_5%)] py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-xl font-bold text-white sm:text-2xl">
              Already buying gloves? Let&apos;s check your invoice for savings.
            </h2>
            <p className="mt-3 text-sm text-white/55">
              Upload a recent invoice—we&apos;ll review line items and reply with options.
            </p>
            <Button asChild size="lg" className="mt-8 bg-[hsl(var(--primary))] text-white hover:opacity-90">
              <Link href="/invoice-savings">Upload invoice</Link>
            </Button>
          </div>
        </section>

        <div className="bg-[hsl(222_47%_5.5%)]">
          <ServiceAreaPanel />
        </div>

        <section className="border-t border-white/10 py-16">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-white">Ready to buy gloves by the case?</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="bg-[hsl(var(--primary))] text-white hover:opacity-90">
                <a href="#bulk-order">Build bulk order</a>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10">
                <Link href="/request-pricing">Request pricing</Link>
              </Button>
            </div>
          </div>
        </section>

        {MAIN_SITE_URL ? (
          <div className="border-t border-white/10 py-10 text-center">
            <p className="text-sm text-white/45">Prefer shopping the full catalog with cart and account?</p>
            <Button asChild size="lg" variant="secondary" className="mt-4">
              <a href={MAIN_SITE_URL} target="_blank" rel="noopener noreferrer">
                <Package className="mr-2 h-4 w-4" />
                Open full GloveCubs site
              </a>
            </Button>
          </div>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
