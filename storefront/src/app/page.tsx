import Link from "next/link";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/industries";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Sparkles, ShieldCheck, TrendingDown } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-black shadow-lg shadow-[hsl(var(--primary))]/30">
              GC
            </span>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-white">
              Glove<span className="text-[hsl(var(--primary))]">Cubs</span>
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/store"
              className="text-sm font-medium text-white/75 hover:text-white transition-colors"
            >
              Store
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-[hsl(var(--primary))] px-4 font-semibold text-white shadow-md shadow-[hsl(var(--primary))]/25 hover:opacity-95"
            >
              <Link href="/request-pricing">Request pricing</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/10">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_-20%,hsl(var(--primary))/25,transparent_55%),radial-gradient(ellipse_50%_50%_at_0%_100%,hsl(var(--primary))/12,transparent_50%)]"
            aria-hidden
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <div className="grid gap-12 lg:grid-cols-12 lg:gap-10 lg:items-start">
              <div className="lg:col-span-6 space-y-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-white/90 shadow-sm">
                  <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden />
                  Authorized distributor
                </div>

                <div className="space-y-5">
                  <h1 className="text-4xl sm:text-5xl lg:text-[2.75rem] font-bold text-white tracking-tight leading-[1.08]">
                    Built for operators who buy gloves & PPE by the case.
                  </h1>
                  <p className="text-lg sm:text-xl text-white/70 max-w-xl leading-relaxed">
                    Procurement teams in janitorial, hospitality, healthcare, and industrial — get
                    case-level pricing, fewer SKUs to chase, and a partner who speaks bulk.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    asChild
                    size="lg"
                    className="rounded-full bg-[hsl(var(--primary))] px-8 font-semibold text-white shadow-lg shadow-[hsl(var(--primary))]/30 hover:opacity-95"
                  >
                    <Link href="/find-my-glove">Find my glove</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-full border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href="/request-pricing">Request pricing</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href="/invoice-savings">Invoice savings</Link>
                  </Button>
                </div>
              </div>

              <div className="lg:col-span-6 space-y-5">
                <QuickBulkBuilder />

                <Card className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-black/50 shadow-lg shadow-black/30 ring-1 ring-[hsl(var(--primary))]/15">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-[hsl(var(--primary))]">
                      <Sparkles className="h-5 w-5" aria-hidden />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em]">AI spend snapshot</span>
                    </div>
                    <CardTitle className="text-white text-lg font-semibold">
                      See where your glove spend is leaking
                    </CardTitle>
                    <CardDescription className="text-white/60 text-sm leading-relaxed">
                      Upload invoices or run a quick SKU pass — we surface mismatches, superseded
                      lines, and case-level alternatives so you can rebid with confidence.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-3 text-sm text-white/80">
                      <li className="flex gap-2">
                        <TrendingDown className="h-4 w-4 shrink-0 text-[hsl(var(--primary))] mt-0.5" aria-hidden />
                        <span>Benchmark case cost vs. current supplier mix.</span>
                      </li>
                      <li className="flex gap-2">
                        <Sparkles className="h-4 w-4 shrink-0 text-[hsl(var(--primary))] mt-0.5" aria-hidden />
                        <span>Normalize SKUs across locations before you negotiate.</span>
                      </li>
                    </ul>
                    <Button
                      asChild
                      variant="secondary"
                      className="mt-5 w-full sm:w-auto rounded-full bg-white text-neutral-900 font-semibold hover:bg-white/90"
                    >
                      <Link href="/invoice-savings">Run invoice savings check</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Industries */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--primary))] mb-3">
              Industries
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Shop collections built for your vertical
            </h2>
            <p className="mt-3 text-white/60">
              Every card opens tailored SKUs, use cases, and case-ready paths — not a generic catalog dump.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {INDUSTRY_KEYS.map((key) => {
              const config = INDUSTRIES[key];
              return (
                <Link key={key} href={`/industries/${key}`}>
                  <Card
                    className={`h-full rounded-2xl border-white/10 bg-gradient-to-b from-white/[0.06] to-black/30 transition-all hover:border-[hsl(var(--primary))]/35 hover:shadow-lg hover:shadow-[hsl(var(--primary))]/10 ${config.accentClass}`}
                  >
                    <CardHeader>
                      <CardTitle className="text-white text-lg">{config.name}</CardTitle>
                      <CardDescription className="text-white/65 line-clamp-2">
                        {config.tagline}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <span className="inline-flex items-center text-sm font-medium text-[hsl(var(--primary))]">
                        View collection
                        <ChevronRight className="h-4 w-4 ml-0.5" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="mt-14 flex flex-col sm:flex-row flex-wrap justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-[hsl(var(--primary))] px-8 font-semibold text-white shadow-lg shadow-[hsl(var(--primary))]/25 hover:opacity-95"
            >
              <Link href="/find-my-glove">Find my glove</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/25 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/request-pricing">Request pricing / bulk order</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/25 text-white hover:bg-white/10"
            >
              <Link href="/invoice-savings">Invoice savings</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
