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
      <figure className="mx-auto mt-12 max-w-3xl border-l-2 border-brand/50 pl-5">
        <blockquote className="m-0 text-base font-medium leading-relaxed text-neutral-900 sm:text-[17px]">
          &ldquo;We standardized nitrile SKUs across three facilities without re-keying every reorder—quote turnaround matched
          our procurement calendar.&rdquo;
        </blockquote>
        <figcaption className="mt-3 text-sm text-neutral-600">
          Facilities procurement lead, multi-site hospitality operator
        </figcaption>
      </figure>
    </ProcurementSectionShell>
  );
}
