import Link from "next/link";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/industries";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold text-white">
            GloveCubs
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/store" className="text-white/80 hover:text-white text-sm">
              Store
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <section className="mb-16">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-12 lg:items-start">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
                B2B Gloves & PPE by Industry
              </h1>
              <p className="text-xl text-white/70 max-w-2xl mx-auto lg:mx-0">
                Choose your industry to see tailored product collections, case pricing, and quick reorder.
              </p>
            </div>
            <div className="w-full max-w-xl mx-auto lg:mx-0 lg:justify-self-end [&>div]:!mb-0">
              <QuickBulkBuilder />
            </div>
          </div>
        </section>

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

        <div className="mt-16 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="bg-[hsl(var(--primary))] text-white hover:opacity-90">
            <Link href="/find-my-glove">Find my glove</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/invoice-savings">Invoice savings</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/store">Browse full store</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
