"use client";

import * as React from "react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomePanelDark, HomeSectionIntro } from "@/components/home/authority/HomeAuthorityPrimitives";
import { cn } from "@/lib/utils";

const MATERIALS = [
  {
    id: "nitrile",
    name: "Nitrile",
    body: "Synthetic barrier—strong chemical and puncture resistance vs vinyl. Default for industrial and exam programs.",
  },
  {
    id: "vinyl",
    name: "Vinyl",
    body: "Economical for low-risk, short tasks. Food-safe options common in hospitality—verify SKU claims.",
  },
  {
    id: "latex",
    name: "Latex",
    body: "Elastic fit and tactile sensitivity—use only where policy allows; many facilities standardize latex-free.",
  },
  {
    id: "work",
    name: "Mechanical",
    body: "Cut, chemical, and impact gloves for tasks disposables cannot cover—ANSI levels and coatings matter.",
  },
] as const;

const MIL_LABELS = ["3 mil", "4 mil", "5 mil", "6 mil", "8 mil"];
const MIL_VALUES = [3, 4, 5, 6, 8];

const LEARNINGS = [
  "Thicker mil extends barrier time; thin mil preserves dexterity—match to task cycle and chemical exposure.",
  "Material choice matters more than brand: nitrile for barrier, vinyl for value food-safe, work gloves for mechanical hazards.",
  "Cost per use beats unit price: model changes per shift vs glove price alone.",
] as const;

export function HomeScienceOfGlovesSection() {
  const [milIndex, setMilIndex] = React.useState(2);
  const mil = MIL_VALUES[milIndex] ?? 5;
  const [materialId, setMaterialId] = React.useState<string>("nitrile");
  const material = MATERIALS.find((m) => m.id === materialId) ?? MATERIALS[0];

  const milInsight =
    mil <= 4
      ? "Prioritize tactile sensitivity and fast changeover—acceptable for light chemical contact with short exposure windows."
      : mil <= 6
        ? "Balanced disposable programs for prep lines and general industrial tasks—most standardization lives here."
        : "Extended barrier for harsh chemistry or longer wear—trade dexterity; rotate tasks to avoid fatigue.";

  return (
    <ProcurementSectionShell
      tone="base"
      headingId="science-gloves-heading"
      ariaLabel="The science of gloves"
      className="proc-section-dark !py-16 sm:!py-20"
    >
      <HomeSectionIntro
        headingId="science-gloves-heading"
        eyebrow="Category education"
        title="The science of gloves"
        description="What procurement teams should internalize before locking SKUs—thickness, polymer, and task fit."
        tone="dark"
      />

      <div className="mb-10 rounded-xl border border-[var(--color-accent-orange)]/25 bg-[var(--color-accent-orange)]/[0.06] px-5 py-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-accent-orange)]">What to learn</p>
        <ul className="mt-3 space-y-2">
          {LEARNINGS.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-white/72">
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <HomePanelDark className="p-6 sm:p-8">
          <h3 className="mb-1 text-lg font-bold text-white">Thickness</h3>
          <p className="mb-6 text-sm text-white/50">Illustrative scale—confirm mil on each published SKU.</p>

          <div className="mb-2 flex justify-between text-xs font-semibold text-white/45">
            <span>Dexterity</span>
            <span>Barrier</span>
          </div>
          <input
            id="mil-slider"
            type="range"
            min={0}
            max={MIL_VALUES.length - 1}
            value={milIndex}
            onChange={(e) => setMilIndex(Number(e.target.value))}
            className="mb-8 w-full accent-[var(--color-accent-orange)]"
            aria-valuetext={MIL_LABELS[milIndex]}
          />

          <div className="flex items-end justify-center gap-2 sm:gap-3" aria-hidden="true">
            {MIL_VALUES.map((v, i) => (
              <div key={v} className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "w-8 rounded-t-sm transition-all duration-300 sm:w-10",
                    i === milIndex ? "bg-[var(--color-accent-orange)]" : "bg-white/12"
                  )}
                  style={{ height: `${20 + v * 9}px` }}
                />
                <span className={cn("text-[10px] font-mono", i === milIndex ? "text-[var(--color-accent-orange)]" : "text-white/35")}>
                  {v}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-3xl font-black tracking-tight text-white">{MIL_LABELS[milIndex]}</p>
          <p className="mt-4 text-center text-sm leading-relaxed text-white/58">{milInsight}</p>
        </HomePanelDark>

        <div className="flex flex-col">
          <h3 className="mb-4 text-lg font-bold text-white">Material</h3>
          <div className="mb-6 inline-flex w-full flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1 sm:w-auto">
            {MATERIALS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMaterialId(m.id)}
                className={cn(
                  "rounded-md px-3.5 py-2 text-sm font-semibold transition",
                  materialId === m.id
                    ? "bg-[#1f1f1f] text-white ring-1 ring-white/10"
                    : "text-white/55 hover:text-white/85"
                )}
              >
                {m.name}
              </button>
            ))}
          </div>

          <p className="text-lg leading-relaxed text-white/82">{material.body}</p>

          <dl className="mt-auto space-y-4 border-t border-white/10 pt-8">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-white/45">Puncture</dt>
              <dd className="mt-1 text-sm text-white/65">Material + thickness; mechanical gloves use ANSI ratings.</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-white/45">Chemical holdout</dt>
              <dd className="mt-1 text-sm text-white/65">Match polymer to SDS class—breakthrough time varies by solvent.</dd>
            </div>
          </dl>
        </div>
      </div>
    </ProcurementSectionShell>
  );
}
