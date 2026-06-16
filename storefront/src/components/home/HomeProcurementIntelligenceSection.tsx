import Link from "next/link";
import { Boxes, FileText, Tag } from "lucide-react";
import {
  CTACluster,
  CTAClusterTertiaryLink,
  ProcurementSectionShell,
  SectionEyebrow,
} from "@/components/procurement";
import { HomeProductFinderSection } from "@/components/home/HomeProductFinderSection";
import {
  HomeHowInvoiceWorksSection,
  HomeRecommendationExplainerSection,
  HomeHumanAdvisorSection,
} from "@/components/home/HomeConversionJourneySections";

/** §4 — spec shopping + condensed procurement intelligence (white, light sub-panels). */
export function HomeProcurementIntelligenceSection() {
  return (
    <ProcurementSectionShell tone="light" headingId="procurement-intelligence-heading">
      <SectionEyebrow tone="light">Procurement intelligence</SectionEyebrow>
      <h2 id="procurement-intelligence-heading" className="proc-h2-light mb-3 max-w-3xl">
        Spec shopping &amp; procurement intelligence
      </h2>
      <p className="proc-body-light mb-10 max-w-2xl">
        Attributes on listings, governed alternates when we suggest a swap, and optional invoice matching—without retail noise.
      </p>

      <div id="bulk-workflow" className="scroll-mt-28" aria-hidden />

      <HomeProductFinderSection embedded hideHeading />

      <div className="mt-14 rounded-xl border border-[#e7e7e7] bg-[#fafafa] p-6 sm:p-8">
        <HomeHowInvoiceWorksSection embedded />
      </div>

      <div className="mt-8 rounded-xl border border-[#e7e7e7] bg-[#fafafa] p-6 sm:p-8">
        <HomeRecommendationExplainerSection embedded />
        <div className="mt-8 border-t border-[#e7e7e7] pt-8">
          <HomeHumanAdvisorSection embedded />
        </div>
      </div>

      <div className="mt-14 border-t border-[#e7e7e7] pt-10">
        <SectionEyebrow tone="light" className="justify-center">
          Next step
        </SectionEyebrow>
        <h3 className="proc-h2-light mb-3 text-center">Run glove procurement with a clear path forward</h3>
        <p className="proc-body-light mx-auto mb-8 max-w-xl text-center">
          Quote-first commerce—upload spend signals when helpful, or shop the catalog with case context on every listing.
        </p>
        <CTACluster
          align="center"
          primary={{ href: "/request-pricing", label: "Request pricing", icon: Tag }}
          secondary={{ href: "/invoice-savings", label: "Upload invoice", icon: FileText }}
          tertiary={
            <>
              <CTAClusterTertiaryLink href="/#bulk-order" className="text-neutral-600 hover:text-neutral-900">
                <Boxes className="h-3.5 w-3.5" aria-hidden />
                Start bulk order →
              </CTAClusterTertiaryLink>
              <CTAClusterTertiaryLink href="/store" className="text-neutral-600 hover:text-neutral-900">
                Browse full catalog →
              </CTAClusterTertiaryLink>
              <Link href="/glove-finder" className="text-sm text-neutral-500 hover:text-brand">
                Guided glove finder (optional) →
              </Link>
            </>
          }
        />
      </div>
    </ProcurementSectionShell>
  );
}
