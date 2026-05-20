import { FileText, Tag } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomeCtaLink } from "@/components/home/authority/HomeAuthorityPrimitives";

export function HomeFinalCtaStrip() {
  return (
    <ProcurementSectionShell
      tone="base"
      className="relative overflow-hidden border-t border-[var(--color-border-muted)] !py-24 sm:!py-32"
      headingId="final-cta-heading"
      ariaLabel="Get started"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,106,0,0.12)_0%,transparent_55%)]" />

      <div className="relative mx-auto max-w-2xl text-center">
        <p className="proc-eyebrow mb-5 justify-center text-[var(--color-accent-orange)]">Next step</p>
        <h2 id="final-cta-heading" className="proc-display-xl mb-5">
          Ready to simplify glove procurement?
        </h2>
        <p className="proc-body mx-auto mb-10 max-w-md text-lg text-white/72">
          Upload spend signals or request scoped pricing—quote-first programs for operators who buy by the case.
        </p>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
          <HomeCtaLink href="/invoice-savings" variant="primary" icon={FileText} className="w-full sm:min-w-[200px]">
            Upload invoice
          </HomeCtaLink>
          <HomeCtaLink
            href="/request-pricing"
            variant="ghost"
            icon={Tag}
            className="w-full border-white/20 sm:min-w-[200px]"
          >
            Request pricing
          </HomeCtaLink>
        </div>
      </div>
    </ProcurementSectionShell>
  );
}
