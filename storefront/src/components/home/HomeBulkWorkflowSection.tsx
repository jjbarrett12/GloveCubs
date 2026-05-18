import Link from "next/link";
import { Boxes, ClipboardList, FileQuestion, Truck } from "lucide-react";
import { ProcurementCard, ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";

const STEPS = [
  {
    n: "1",
    icon: Boxes,
    title: "Build your bulk request",
    body: "Industry, glove type, sizes, and monthly case volume—quote-first, not checkout.",
  },
  {
    n: "2",
    icon: ClipboardList,
    title: "We scope the RFQ",
    body: "High-volume programs route to a rep; standard bulk paths land in formal pricing review.",
  },
  {
    n: "3",
    icon: FileQuestion,
    title: "Quote with real SKUs",
    body: "Lines carry catalog-backed variants and case context—no parent-only guesses.",
  },
  {
    n: "4",
    icon: Truck,
    title: "Fulfillment in the real world",
    body: "Ship-to, terms, and logistics stay human-led—phones and reps, not a black box.",
  },
] as const;

export function HomeBulkWorkflowSection() {
  return (
    <ProcurementSectionShell id="bulk-workflow" tone="raised" headingId="bulk-workflow-heading">
      <SectionEyebrow icon={Boxes} className="justify-center">
        Bulk-order workflow
      </SectionEyebrow>
      <h2 id="bulk-workflow-heading" className="proc-h2 mb-3 text-center">
        Buy by the case without consumer checkout theater
      </h2>
      <p className="proc-body mx-auto mb-10 max-w-2xl text-center">
        Use the bulk builder in the hero—or jump straight to it—to start a quote request your team can repeat next month.
      </p>
      <ol className="mb-10 grid grid-cols-1 gap-proc-gap-card sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ n, icon: Icon, title, body }) => (
          <ProcurementCard key={n} as="li" className="list-none">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {n}
              </span>
              <Icon className="h-6 w-6 text-brand" aria-hidden />
            </div>
            <h3 className="proc-h3 mb-2">{title}</h3>
            <p className="m-0 text-sm leading-relaxed text-text-muted">{body}</p>
          </ProcurementCard>
        ))}
      </ol>
      <p className="text-center">
        <Link
          href="/#bulk-order"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white shadow-proc-brand transition hover:bg-brand-hover"
        >
          Open bulk builder
        </Link>
      </p>
    </ProcurementSectionShell>
  );
}
