"use client";

import * as React from "react";
import { FINDER_STEP_COUNT, FINDER_STEPS } from "@/config/gloveScienceHub";
import {
  DEFAULT_SCIENCE_HUB_INTAKE,
  type ScienceHubIntake,
} from "@/lib/education/glove-science-intake";
import { formatClassRecommendation } from "@/lib/education/glove-science-format";
import { ScienceFinderResult } from "@/components/glove-science/finder/ScienceFinderResult";
import { cn } from "@/lib/utils";

export function ScienceFinderWizard() {
  const [step, setStep] = React.useState(0);
  const [intake, setIntake] = React.useState<ScienceHubIntake>(DEFAULT_SCIENCE_HUB_INTAKE);
  const [showResult, setShowResult] = React.useState(false);

  const current = FINDER_STEPS[step]!;
  const recommendation = React.useMemo(
    () => (showResult ? formatClassRecommendation(intake) : null),
    [showResult, intake]
  );

  const setField = <K extends keyof ScienceHubIntake>(field: K, value: ScienceHubIntake[K]) => {
    setIntake((prev) => ({ ...prev, [field]: value }));
  };

  const reset = () => {
    setIntake(DEFAULT_SCIENCE_HUB_INTAKE);
    setStep(0);
    setShowResult(false);
  };

  if (showResult && recommendation) {
    return <ScienceFinderResult recommendation={recommendation} onAdjust={reset} />;
  }

  const selectedValue = intake[current.field];

  return (
    <div className="rounded-2xl border border-[#ebebea] bg-white p-6 shadow-[0_8px_30px_rgb(0_0_0/0.04)] sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
        Step {step + 1} of {FINDER_STEP_COUNT}
      </p>
      <h3 className="mt-3 text-xl font-bold tracking-tight text-[#0a0a0a] sm:text-2xl">{current.question}</h3>

      <div
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="group"
        aria-label={current.question}
      >
        {current.options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              className={cn(
                "min-h-[3.25rem] rounded-xl border px-4 py-3.5 text-left text-sm font-semibold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-orange)] motion-reduce:transition-none",
                isSelected
                  ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/8 text-[#0a0a0a] ring-1 ring-[var(--color-accent-orange)]/30"
                  : "border-[#ebebea] bg-[#fafaf8] text-neutral-800 hover:border-[var(--color-accent-orange)]/35"
              )}
              onClick={() => setField(current.field, option.value as ScienceHubIntake[typeof current.field])}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8d8d4] bg-white px-6 py-3 text-sm font-bold text-neutral-700 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-orange)]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (step >= FINDER_STEP_COUNT - 1) {
              setShowResult(true);
            } else {
              setStep((s) => s + 1);
            }
          }}
          className="home-cta-primary inline-flex min-h-11 items-center rounded-xl px-7 py-3 text-sm font-bold"
        >
          {step >= FINDER_STEP_COUNT - 1 ? "See profile" : "Next"}
        </button>
      </div>
    </div>
  );
}
