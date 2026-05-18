import { Award, ClipboardCheck, FileText, Truck, UserRound, Warehouse } from "lucide-react";
import {
  OperationalProofStrip,
  ProcurementCard,
  ProcurementSectionShell,
  SectionEyebrow,
  TrustBand,
} from "@/components/procurement";

const TRUST_GRID = [
  "Case pricing for business accounts",
  "Supplier-direct sourcing",
  "Reorder the same SKUs fast",
  "Net terms available for qualified buyers",
] as const;

const OPS_TILES = [
  { icon: Award, label: "Authorized distributor" },
  { icon: Warehouse, label: "Repeatable supply programs" },
  { icon: Truck, label: "Fast fulfillment" },
  { icon: ClipboardCheck, label: "Reviewed sourcing paths" },
  { icon: FileText, label: "Net terms (approved accounts)" },
  { icon: UserRound, label: "Dedicated account support" },
] as const;

/** Consolidated trust grid + operational tiles (replaces separate trust line + tiles bands). */
export function HomeConsolidatedTrustSection() {
  return (
    <ProcurementSectionShell tone="base" borderTop={false} headingId="ops-trust-heading">
      <SectionEyebrow icon={ClipboardCheck} className="justify-center">
        Operational trust
      </SectionEyebrow>
      <h2 id="ops-trust-heading" className="proc-h2 mb-3 text-center">
        How we show up for business buyers
      </h2>
      <p className="proc-body mx-auto mb-8 max-w-2xl text-center">
        Without inflated metrics or borrowed testimonials—catalog-backed SKUs, quote-first commerce, and humans on requests.
      </p>
      <TrustBand variant="grid" items={TRUST_GRID} className="border-y-0 py-0" />
      <div className="mt-10">
        <OperationalProofStrip
          className="mb-8 justify-center"
          items={OPS_TILES.map(({ icon, label }) => ({ icon, label }))}
        />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6 lg:gap-5">
          {OPS_TILES.map(({ icon: Icon, label }) => (
            <ProcurementCard key={label} className="bg-surface-card-alt p-4 text-center sm:p-5">
              <Icon className="mx-auto mb-3 h-9 w-9 text-brand sm:h-10 sm:w-10" strokeWidth={2} aria-hidden />
              <div className="text-sm font-semibold leading-snug text-white/90">{label}</div>
            </ProcurementCard>
          ))}
        </div>
      </div>
    </ProcurementSectionShell>
  );
}
