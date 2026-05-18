import Link from "next/link";
import { Package, RefreshCw, Tag } from "lucide-react";
import { CTACluster, ProcurementCard, ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";

export function HomeBulkPricingSection() {
  return (
    <ProcurementSectionShell tone="raised" headingId="bulk-pricing-heading">
      <SectionEyebrow icon={Tag}>Distributor pricing</SectionEyebrow>
      <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-center">
        <div>
          <h2 id="bulk-pricing-heading" className="proc-h2 mb-3">
            Built for business buyers—not consumer checkout
          </h2>
          <p className="proc-body max-w-2xl">
            Case and pallet context on listings, quote paths when pricing is program-specific, and humans on the other side of
            requests. No toy dashboards—commerce that respects how facilities and operators actually purchase.
          </p>
          <div className="mt-8">
            <CTACluster
              primary={{ href: "/request-pricing", label: "Get distributor pricing", icon: Tag }}
              secondary={{ href: "/store", label: "Browse catalog" }}
            />
          </div>
        </div>
        <ProcurementCard className="space-y-4">
          <ul className="space-y-4 text-sm text-white/85">
            <li className="flex gap-3">
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>
                <strong className="text-white">Pack-aware browsing</strong> — materials, mil, and use-case signals before lines
                hit your quote request.
              </span>
            </li>
            <li className="flex gap-3">
              <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>
                <strong className="text-white">Reorder-friendly</strong> —{" "}
                <Link href="/login" className="font-semibold text-brand-soft hover:underline">
                  sign in
                </Link>{" "}
                for account tools; build quotes from the store the same way you already buy.
              </span>
            </li>
            <li className="flex gap-3">
              <Tag className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>
                <strong className="text-white">Quote-first honesty</strong> — request pricing when list price is not published;
                we follow up on every saved request.
              </span>
            </li>
          </ul>
        </ProcurementCard>
      </div>
    </ProcurementSectionShell>
  );
}
