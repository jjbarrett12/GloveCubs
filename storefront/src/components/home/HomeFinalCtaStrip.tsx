import Link from "next/link";
import { Boxes, FileText, Tag } from "lucide-react";
import { CTACluster, CTAClusterTertiaryLink, ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";

export function HomeFinalCtaStrip() {
  return (
    <ProcurementSectionShell tone="card" className="border-t border-brand/20 bg-surface-card" headingId="final-cta-heading">
      <SectionEyebrow className="justify-center">Next step</SectionEyebrow>
      <h2 id="final-cta-heading" className="proc-h2 mb-3 text-center">
        Run glove procurement with a clear path forward
      </h2>
      <p className="proc-body mx-auto mb-8 max-w-xl text-center">
        Quote-first commerce—upload spend signals when helpful, or shop the catalog with case context on every listing.
      </p>
      <CTACluster
        align="center"
        primary={{ href: "/request-pricing", label: "Request pricing", icon: Tag }}
        secondary={{ href: "/invoice-savings", label: "Upload invoice", icon: FileText }}
        tertiary={
          <>
            <CTAClusterTertiaryLink href="/#bulk-order">
              <Boxes className="h-3.5 w-3.5" aria-hidden />
              Start bulk order →
            </CTAClusterTertiaryLink>
            <CTAClusterTertiaryLink href="/store">Browse full catalog →</CTAClusterTertiaryLink>
            <CTAClusterTertiaryLink href="/glove-finder" className="text-white/45">
              AI glove finder (optional) →
            </CTAClusterTertiaryLink>
          </>
        }
      />
    </ProcurementSectionShell>
  );
}
