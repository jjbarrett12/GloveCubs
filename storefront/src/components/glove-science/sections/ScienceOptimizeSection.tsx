import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { EducationSectionIntro } from "@/components/education/EducationSectionIntro";
import { GLOVE_SCIENCE_OPTIMIZE_SECTION } from "@/config/gloveScienceHub";
import { cn } from "@/lib/utils";

export function ScienceOptimizeSection() {
  const section = GLOVE_SCIENCE_OPTIMIZE_SECTION;

  return (
    <ProcurementSectionShell
      id={section.sectionId}
      tone="light"
      borderTop
      headingId="glove-science-optimize-heading"
      ariaLabel="Optimize glove spend without reducing protection"
      className="scroll-mt-24 !bg-white !py-14 sm:!py-16 lg:!py-20"
      containerClassName="max-w-proc"
    >
      <EducationSectionIntro
        eyebrow="Procurement intelligence"
        title={section.title}
        description={section.subtitle}
        headingId="glove-science-optimize-heading"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <ComparisonColumn
          variant="over"
          title={section.overprotected.title}
          points={section.overprotected.points}
        />
        <ComparisonColumn
          variant="optimized"
          title={section.optimized.title}
          points={section.optimized.points}
        />
      </div>

      <div className="mt-12 rounded-2xl border border-[#ebebea] bg-[#fafaf8] p-6 sm:p-8">
        <h3 className="text-xl font-bold tracking-tight text-[#0a0a0a] sm:text-2xl">{section.cta.headline}</h3>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={section.cta.primary.href} className="home-cta-primary inline-flex min-h-12 items-center rounded-xl px-7 py-3.5 text-sm font-bold">
            {section.cta.primary.label}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
          <Link
            href={section.cta.secondary.href}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d8d8d4] bg-white px-7 py-3.5 text-sm font-bold text-[#0a0a0a] transition hover:border-[var(--color-accent-orange)]/40"
          >
            {section.cta.secondary.label}
          </Link>
        </div>
      </div>
    </ProcurementSectionShell>
  );
}

function ComparisonColumn({
  variant,
  title,
  points,
}: {
  variant: "over" | "optimized";
  title: string;
  points: readonly string[];
}) {
  const isOptimized = variant === "optimized";

  return (
    <div
      className={cn(
        "rounded-2xl border p-6 sm:p-8",
        isOptimized
          ? "border-[var(--color-accent-orange)]/25 bg-[#fffaf7] shadow-[0_8px_30px_rgb(255_106_0/0.06)]"
          : "border-[#ebebea] bg-white shadow-[0_8px_30px_rgb(0_0_0/0.04)]"
      )}
    >
      <p
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.14em]",
          isOptimized ? "text-[var(--color-accent-orange)]" : "text-neutral-500"
        )}
      >
        {title}
      </p>
      <ul className="mt-5 space-y-3">
        {points.map((point) => (
          <li key={point} className="flex gap-3 text-sm leading-relaxed text-neutral-700">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                isOptimized ? "bg-[var(--color-accent-orange)]" : "bg-neutral-300"
              )}
              aria-hidden
            />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
