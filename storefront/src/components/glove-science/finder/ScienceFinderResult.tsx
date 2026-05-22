import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { ClassRecommendation } from "@/lib/education/glove-science-format";

type ScienceFinderResultProps = {
  recommendation: ClassRecommendation;
  onAdjust: () => void;
};

export function ScienceFinderResult({ recommendation, onAdjust }: ScienceFinderResultProps) {
  const rows: { label: string; value: string }[] = [
    { label: "Material", value: recommendation.material },
    { label: "Thickness range", value: recommendation.thicknessRange },
    { label: "Texture", value: recommendation.texture },
  ];
  if (recommendation.cutLevel) rows.push({ label: "Cut level", value: recommendation.cutLevel });
  if (recommendation.cuff) rows.push({ label: "Cuff", value: recommendation.cuff });

  return (
    <div
      className="rounded-2xl border border-[var(--color-accent-orange)]/25 bg-white p-6 shadow-[0_12px_40px_rgb(0_0_0/0.06)] sm:p-8"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
        Recommended glove profile
      </p>
      <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#0a0a0a]">{recommendation.profileTitle}</h3>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600">{recommendation.useCase}</p>

      <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-[#ebebea] pt-6 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{row.label}</dt>
            <dd className="mt-1 text-sm font-medium leading-relaxed text-neutral-800">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 border-t border-[#ebebea] pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">Why this profile</p>
        <ul className="mt-3 space-y-2">
          {recommendation.rationale.map((line) => (
            <li key={line} className="flex gap-2 text-sm leading-relaxed text-neutral-700">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent-orange)]" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">{recommendation.disclaimer}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={recommendation.nextStepHref}
          className="home-cta-primary inline-flex min-h-12 items-center rounded-xl px-7 py-3.5 text-sm font-bold"
        >
          {recommendation.nextStepLabel}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={onAdjust}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d8d8d4] bg-white px-7 py-3.5 text-sm font-bold text-[#0a0a0a] transition hover:border-[var(--color-accent-orange)]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-orange)]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Adjust answers
        </button>
      </div>
    </div>
  );
}
