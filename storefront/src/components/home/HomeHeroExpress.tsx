import Link from "next/link";
import { Package, Tag, Bot, Bolt, Headphones, FileText, Boxes, UserRound, LineChart } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";
import { CTACluster, CTAClusterTertiaryLink } from "@/components/procurement";

export function HomeHeroExpress() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#111111] via-surface-card to-surface-base px-0 pb-16 pt-9 sm:pb-20 sm:pt-11 lg:pb-24 lg:pt-12"
      aria-label="Hero"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(240,98,50,0.06)_0%,transparent_72%)]" />
      <div className="pointer-events-none absolute -bottom-36 -left-36 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(240,98,50,0.035)_0%,transparent_72%)]" />

      <div className="relative z-[1] mx-auto max-w-proc px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-white/[0.06] px-4 py-1.5 proc-eyebrow shadow-sm ring-1 ring-brand/20"
              role="status"
              aria-live="polite"
            >
              <Package className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
              <span>B2B programs · case &amp; pallet</span>
            </div>
            <h1 className="proc-display mb-4">Built for Operators Who Buy by the Case</h1>
            <p className="mb-6 text-base font-normal leading-relaxed text-white/88 sm:text-lg">
              Distributor-level pricing. No contracts. No games.
            </p>
            <CTACluster
              className="mb-2"
              primary={{ href: "/request-pricing", label: "Get Distributor Pricing", icon: Tag }}
              secondary={{ href: "/#bulk-order", label: "Start bulk order", icon: Boxes }}
              tertiary={
                <>
                  <CTAClusterTertiaryLink href="/request-pricing" className="font-semibold text-brand hover:text-brand-soft">
                    <Bolt className="h-3.5 w-3.5" aria-hidden />
                    Request an RFQ in 60 seconds →
                  </CTAClusterTertiaryLink>
                  <CTAClusterTertiaryLink href="/contact">
                    <Headphones className="h-3.5 w-3.5" aria-hidden />
                    Talk to a glove specialist →
                  </CTAClusterTertiaryLink>
                  <CTAClusterTertiaryLink href="/glove-finder" className="text-white/50">
                    <Bot className="h-3.5 w-3.5 opacity-80" aria-hidden />
                    AI glove finder (optional) →
                  </CTAClusterTertiaryLink>
                </>
              }
            />
            <div className="mt-7 max-w-[500px] rounded-2xl border border-brand/25 bg-white p-5 shadow-proc-sm">
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div className="rounded-lg p-3 transition hover:bg-brand/8">
                  <FileText className="mx-auto mb-1.5 h-5 w-5 text-brand" />
                  <div className="font-semibold text-neutral-900">Net Terms</div>
                  <div className="text-xs text-neutral-600">Approved accounts</div>
                </div>
                <div className="rounded-lg p-3 transition hover:bg-brand/8">
                  <Boxes className="mx-auto mb-1.5 h-5 w-5 text-brand" />
                  <div className="font-semibold text-neutral-900">Case &amp; Pallet</div>
                  <div className="text-xs text-neutral-600">Bulk ordering</div>
                </div>
                <div className="rounded-lg p-3 transition hover:bg-brand/8">
                  <UserRound className="mx-auto mb-1.5 h-5 w-5 text-brand" />
                  <div className="font-semibold text-neutral-900">Dedicated Rep</div>
                  <div className="text-xs text-neutral-600">Repeat ordering</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <QuickBulkBuilder />
            <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-br from-brand to-brand-hover p-5 text-white shadow-proc-md">
              <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
                <LineChart className="h-5 w-5 shrink-0" aria-hidden />
                Invoice intelligence
              </h3>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/75">What we review</p>
              <ul className="mb-4 space-y-2 rounded-lg border border-white/15 bg-black/15 px-3 py-3 text-sm leading-snug backdrop-blur-sm">
                <li>Task fit vs. glove thickness and chemistry</li>
                <li>Spend patterns across suppliers and lines</li>
                <li>SKU consolidation where it reduces variance</li>
              </ul>
              <Link
                href="/invoice-savings"
                className="block w-full rounded-xl bg-white py-3 text-center text-sm font-semibold text-brand shadow-proc-sm transition hover:bg-white/95"
              >
                Upload invoice for review
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
