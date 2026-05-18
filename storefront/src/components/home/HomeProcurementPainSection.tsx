import { AlertTriangle, FileSpreadsheet, MapPin, RefreshCw } from "lucide-react";
import { ProcurementCard, ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";

const PAINS = [
  {
    icon: RefreshCw,
    title: "Repeat buys drift off-spec",
    body: "Monthly restocks re-keyed from memory invite wrong size, material, or pack—and buyers lose confidence in what ships.",
  },
  {
    icon: FileSpreadsheet,
    title: "Invoices do not match the catalog",
    body: "Supplier line descriptions rarely map cleanly to variant SKUs. Someone has to reconcile before you can quote or reorder with certainty.",
  },
  {
    icon: MapPin,
    title: "Multi-site programs multiply variance",
    body: "Facilities, prep lines, and teams each run slightly different gloves. Procurement needs one governed path—not six spreadsheets.",
  },
  {
    icon: AlertTriangle,
    title: "Quote paths get confused with checkout",
    body: "B2B glove buying is quote-first and case-aware. Consumer-style checkout UX creates pricing and fulfillment surprises.",
  },
] as const;

export function HomeProcurementPainSection() {
  return (
    <ProcurementSectionShell tone="base" headingId="procurement-pain-heading">
      <SectionEyebrow icon={AlertTriangle}>Procurement reality</SectionEyebrow>
      <h2 id="procurement-pain-heading" className="proc-h2 mb-3 max-w-3xl">
        Glove procurement is operational—not a one-click purchase
      </h2>
      <p className="proc-body mb-10 max-w-2xl">
        GloveCubs is built for buyers who run recurring supply: variant clarity, honest quotes, and workflows that respect how
        facilities actually purchase.
      </p>
      <ul className="grid grid-cols-1 gap-proc-gap-card sm:grid-cols-2">
        {PAINS.map(({ icon: Icon, title, body }) => (
          <ProcurementCard key={title} as="li" className="list-none">
            <Icon className="mb-3 h-6 w-6 text-brand" aria-hidden />
            <h3 className="proc-h3 mb-2">{title}</h3>
            <p className="m-0 text-sm leading-relaxed text-text-muted">{body}</p>
          </ProcurementCard>
        ))}
      </ul>
    </ProcurementSectionShell>
  );
}
