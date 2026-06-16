import { Boxes, Building2, Headphones, RefreshCw, Truck, Users } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomeBridge, HomePanelLight, HomeSectionIntro } from "@/components/home/authority/HomeAuthorityPrimitives";

const PILLARS = [
  {
    icon: Building2,
    title: "Industries served",
    body: "Food service, janitorial, healthcare, industrial, automotive, and safety—governed catalog paths per environment.",
  },
  {
    icon: Headphones,
    title: "Operational support",
    body: "Humans on quotes and programs—not chatbots posing as distributors.",
  },
  {
    icon: RefreshCw,
    title: "Repeat procurement",
    body: "Variant-level truth for restocks—quote requests and quicklists, not auto-ship programs.",
  },
  {
    icon: Truck,
    title: "Fulfillment capability",
    body: "Case and pallet context on listings; lead times confirmed per RFQ.",
  },
  {
    icon: Users,
    title: "Multi-location servicing",
    body: "One procurement language across facilities—without six spreadsheets.",
  },
  {
    icon: Boxes,
    title: "Catalog-backed SKUs",
    body: "Published attributes on listings; invoice lines mapped to real variants when possible.",
  },
] as const;

export function HomeOperationalTrustSection() {
  return (
    <>
      <ProcurementSectionShell
        tone="light-alt"
        headingId="operational-trust-heading"
        ariaLabel="Operational trust"
        className="bg-[var(--color-industrial-gray)] !py-16 sm:!py-20"
      >
        <HomeSectionIntro
          headingId="operational-trust-heading"
          eyebrow="Operational proof"
          title="Quiet confidence"
          description="How we show up for procurement teams—without borrowed logos, inflated counters, or startup theater."
          tone="light"
        />

        <HomePanelLight className="divide-y divide-[#ebebea] px-6 sm:px-8">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="home-trust-row">
              <Icon className="h-6 w-6 shrink-0 text-[var(--color-accent-orange)]" strokeWidth={1.5} aria-hidden />
              <div>
                <h3 className="mb-1 text-base font-bold text-ink">{title}</h3>
                <p className="m-0 text-sm leading-relaxed text-text-muted-light">{body}</p>
              </div>
            </div>
          ))}
        </HomePanelLight>
      </ProcurementSectionShell>
      <HomeBridge variant="to-light" />
    </>
  );
}
