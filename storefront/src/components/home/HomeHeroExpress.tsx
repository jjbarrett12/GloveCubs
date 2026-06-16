import Link from "next/link";
import { Bot, FileText, Box, Boxes, Layers, Tag } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";
import { CTAClusterTertiaryLink } from "@/components/procurement";
import { HomeBridge, HomeCtaLink } from "@/components/home/authority/HomeAuthorityPrimitives";

export function HomeHeroExpress() {
  return (
    <>
      <section
        data-ui-section="hero"
        className="home-authority-surface home-authority-surface-vignette relative overflow-hidden px-0 pb-0 pt-10 sm:pt-14 lg:pt-16"
        aria-label="Hero"
      >
        <div className="relative z-[1] mx-auto max-w-proc px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 xl:items-center">
            <div className="animate-authority-fade-up lg:pr-4">
              <div
                className="mb-7 inline-flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full border border-[var(--color-accent-orange)] bg-[#0a0a0a] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)] shadow-[0_0_24px_rgb(255_106_0/0.35),inset_0_0_12px_rgb(255_106_0/0.08)]"
              >
                <Box className="h-3.5 w-3.5 shrink-0 stroke-[2.25]" aria-hidden />
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>B2B programs</span>
                  <span aria-hidden>·</span>
                  <span>Case &amp; pallet</span>
                  <span aria-hidden>·</span>
                  <span>Catalog-backed SKUs</span>
                </span>
              </div>

              <h1 className="proc-display-xl mb-5 max-w-xl text-white">
                Built for Operators
                <br />
                Who Buy by the Case
              </h1>
              <p className="mb-8 max-w-lg text-lg leading-relaxed text-white/78 sm:text-xl">
                Category expertise, invoice intelligence, and nationwide B2B programs—lead times and formal pricing confirmed
                per quote for operators who buy by the case and pallet.
              </p>

              <ul className="mb-9 grid grid-cols-1 gap-2.5 text-sm text-white/60 sm:grid-cols-3 sm:gap-3">
                <li className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <Bot className="h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
                  Procurement intelligence
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
