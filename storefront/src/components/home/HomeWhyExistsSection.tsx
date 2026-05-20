import { ProcurementSectionShell } from "@/components/procurement";
import { HomeSectionIntro } from "@/components/home/authority/HomeAuthorityPrimitives";

const FRAGMENTS = [
  {
    title: "Fragmented procurement",
    body: "Spreadsheets, distributor portals, and site-level habits hide true spend—and invite wrong SKUs on reorder.",
  },
  {
    title: "Confusing specifications",
    body: "Mil, material, texture, and compliance claims rarely line up across suppliers. Buyers guess instead of govern.",
  },
  {
    title: "Pricing opacity",
    body: "Case economics get lost in mixed units and line descriptions. Without mapping, you cannot compare honestly.",
  },
  {
    title: "Operational downtime",
    body: "Wrong glove class slows crews, violates SOPs, and burns trust with safety and quality teams.",
  },
] as const;

export function HomeWhyExistsSection() {
  return (
    <ProcurementSectionShell
      tone="light"
      borderTop={false}
      headingId="why-exists-heading"
      ariaLabel="Why GloveCubs exists"
      className="proc-section-light !pt-12 sm:!pt-16"
      containerClassName="max-w-proc"
    >
      <HomeSectionIntro
        headingId="why-exists-heading"
        eyebrow="Why we exist"
        title="Glove procurement should not feel like guesswork"
        description="GloveCubs is the sourcing intelligence layer for industrial glove programs—how serious operators buy by the case, reconcile invoices, and keep teams on-spec."
        tone="light"
      />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
        <ol className="space-y-0">
          {FRAGMENTS.map(({ title, body }, i) => (
            <li
              key={title}
              className="grid grid-cols-[3rem_1fr] gap-4 border-t border-[#ebebea] py-8 first:border-t-0 first:pt-0 sm:grid-cols-[4rem_1fr] sm:gap-6 sm:py-9"
            >
              <span className="font-mono text-2xl font-light tabular-nums text-neutral-300 sm:text-3xl">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="mb-2 text-lg font-bold tracking-tight text-ink sm:text-xl">{title}</h3>
                <p className="m-0 max-w-lg text-base leading-relaxed text-text-muted-light">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <aside className="flex flex-col justify-end border-t border-[#ebebea] pt-10 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
          <p className="proc-eyebrow-light mb-5">Our role</p>
          <blockquote className="m-0 border-l-4 border-[var(--color-accent-orange)] pl-6">
            <p className="text-2xl font-bold leading-[1.2] tracking-tight text-ink sm:text-[1.65rem]">
              Procurement simplifier. Sourcing intelligence. Operational partner.
            </p>
          </blockquote>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-text-muted-light">
            Operating context connected to catalog truth—quote-first commerce, governed alternates, humans on programs that
            matter. Infrastructure, not a coupon store.
          </p>
        </aside>
      </div>
    </ProcurementSectionShell>
  );
}
