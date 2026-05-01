import Link from "next/link";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/industries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Package, FileText, Sparkles } from "lucide-react";

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold text-white">
            GloveCubs
          </Link>
          <nav className="flex items-center gap-4">
            {MAIN_SITE_URL ? (
              <a href={MAIN_SITE_URL} className="text-white/80 hover:text-white text-sm" target="_blank" rel="noopener noreferrer">
                Full site (shop & account)
              </a>
            ) : (
              <Link href="/" className="text-white/80 hover:text-white text-sm">
                Home
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent px-6 py-12 sm:py-16 lg:px-12 lg:py-20 mt-8 mb-16">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--primary))]/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 text-center max-w-3xl mx-auto">
            <p className="inline-block rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/90 mb-6">
              1,000+ SKUs · Net terms · Fast fulfillment
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-4">
              B2B Gloves & PPE by Industry
            </h1>
            <p className="text-lg sm:text-xl text-white/70 mb-8">
              Choose your industry for tailored collections, case pricing, and quick reorder. Or find your glove and upload an invoice for savings.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="bg-[hsl(var(--primary))] text-white hover:opacity-90">
                <Link href="/find-my-glove">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Find my glove
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/invoice-savings">
                  <FileText className="mr-2 h-4 w-4" />
                  Invoice savings
                </Link>
              </Button>
              {MAIN_SITE_URL && (
                <Button asChild variant="secondary" size="lg">
                  <a href={MAIN_SITE_URL} target="_blank" rel="noopener noreferrer">
                    <Package className="mr-2 h-4 w-4" />
                    Full site (shop, cart, account)
                  </a>
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Industry cards */}
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-white mb-2">Choose your industry</h2>
          <p className="text-white/60 text-sm">View tailored product collections and use cases.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {INDUSTRY_KEYS.map((key) => {
            const config = INDUSTRIES[key];
            return (
              <Link key={key} href={`/industries/${key}`}>
                <Card
                  className={`h-full rounded-2xl border-white/10 bg-white/5 transition-all hover:border-white/20 hover:bg-white/10 ${config.accentClass}`}
                >
                  <CardHeader>
                    <CardTitle className="text-white text-lg">{config.name}</CardTitle>
                    <CardDescription className="text-white/70 line-clamp-2">
                      {config.tagline}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button variant="ghost" size="sm" className="text-white/90 hover:text-white p-0 h-auto">
                      View industry page <ChevronRight className="h-4 w-4 inline ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Bottom CTA */}
        {MAIN_SITE_URL && (
          <div className="mt-16 pb-16 text-center border-t border-white/10 pt-12">
            <p className="text-white/50 text-sm mb-4">
              For the full GloveCubs experience — products, cart, checkout, and account — use the main site.
            </p>
            <Button asChild size="lg" variant="secondary">
              <a href={MAIN_SITE_URL} target="_blank" rel="noopener noreferrer">Open full GloveCubs site</a>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
