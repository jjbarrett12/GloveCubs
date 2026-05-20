import Link from "next/link";
import { Bot, FileText, Boxes, Layers, Sparkles, Tag } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";
import { CTAClusterTertiaryLink } from "@/components/procurement";
import { HomeBridge, HomeCtaLink } from "@/components/home/authority/HomeAuthorityPrimitives";

export function HomeHeroExpress() {
  return (
    <>
      <section
        className="home-authority-grid relative overflow-hidden bg-[#0a0a0a] px-0 pb-0 pt-10 sm:pt-14 lg:pt-16"
        aria-label="Hero"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_20%_0%,rgba(255,106,0,0.14)_0%,transparent_50%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_100%_50%,rgba(255,106,0,0.05)_0%,transparent_60%)]" />

        <div className="relative z-[1] mx-auto max-w-proc px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 xl:items-center">
            <div className="animate-authority-fade-up lg:pr-4">
              <div
                className="mb-7 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--color-border-muted)] bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>AI-assisted industrial glove procurement</span>
              </div>

              <h1 className="proc-display-xl mb-5 max-w-xl">
                The procurement platform for glove programs
              </h1>
              <p className="mb-8 max-w-lg text-lg leading-relaxed text-white/78 sm:text-xl">
                Category expertise, invoice intelligence, and nationwide B2B programs—for operators who buy by the case
                and pallet.
              </p>

              <ul className="mb-9 grid grid-cols-1 gap-2.5 text-sm text-white/60 sm:grid-cols-3 sm:gap-3">
                <li className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <Bot className="h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
                  Sourcing intelligence
                </li>
                <li className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <Layers className="h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
                  Case &amp; pallet
                </li>
                <li className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
                  Catalog-backed SKUs
                </li>
              </ul>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <HomeCtaLink href="/invoice-savings" variant="primary" icon={FileText}>
                    Upload invoice for review
                  </HomeCtaLink>
                  <HomeCtaLink href="/request-pricing" variant="ghost" icon={Tag}>
                    Request pricing
                  </HomeCtaLink>
                </div>
                <CTAClusterTertiaryLink
                  href="/#bulk-order"
                  className="font-semibold text-[var(--color-accent-orange)] hover:underline"
                >
                  <Boxes className="h-3.5 w-3.5" aria-hidden />
                  Quick order below →
                </CTAClusterTertiaryLink>
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:gap-5">
              <QuickBulkBuilder />
              <div className="home-panel-dark p-5 sm:p-6">
                <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-white">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
                  Invoice intelligence
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-white/58">
                  Task fit, spend patterns, and consolidation—mapped to catalog variants where lines allow.
                </p>
                <Link href="/invoice-savings" className="home-cta-primary block w-full py-3.5 text-center text-sm">
                  Upload invoice for review
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <HomeBridge variant="to-light" />
    </>
  );
}
