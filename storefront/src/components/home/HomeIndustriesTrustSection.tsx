import { ProcurementSectionShell } from "@/components/procurement";
import { HomeWhoSection } from "@/components/home/HomeWhoSection";

/** §2 — shop where gloves get used, industry cards, brand carousel, one testimonial. */
export function HomeIndustriesTrustSection() {
  return (
    <ProcurementSectionShell
      tone="light"
      borderTop={false}
      ariaLabel="Shop where gloves get used"
      className="!pt-0"
    >
      <HomeWhoSection embedded />
      <figure className="mx-auto mt-12 max-w-3xl">
        <div className="animate-invoice-testimonial-glow rounded-2xl border border-brand bg-white px-6 py-6 sm:px-8 sm:py-7">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
            Invoice upload · verified savings
          </p>
          <blockquote className="m-0 text-base font-medium leading-relaxed text-neutral-900 sm:text-[17px]">
            &ldquo;We uploaded last month&rsquo;s distributor invoice on Tuesday. GloveCubs matched our nitrile and vinyl lines
            by Thursday—we reordered the same SKUs our prep teams already run and started saving on case pricing immediately,
            without re-keying a single line.&rdquo;
          </blockquote>
          <figcaption className="mt-4 border-t border-neutral-100 pt-4 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-800">Marcus T.</span>
            <span className="text-neutral-400"> · </span>
            Director of Procurement, multi-unit restaurant group
          </figcaption>
        </div>
      </figure>
    </ProcurementSectionShell>
  );
}
