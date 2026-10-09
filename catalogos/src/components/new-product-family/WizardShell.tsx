"use client";

import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStepId } from "@/lib/new-product-family/types";
import { familySummaryLines } from "@/lib/new-product-family/summary";
import type { NewProductFamilyDraft } from "@/lib/new-product-family/types";

export function WizardShell({
  draft,
  currentStep,
  completedCount,
  savedAt,
  nextDisabled,
  nextReason,
  busy,
  onBack,
  onNext,
  onSave,
  onSelectStep,
  children,
  completeSteps,
}: {
  draft: NewProductFamilyDraft;
  currentStep: WizardStepId;
  completedCount: number;
  completeSteps: number[];
  savedAt: string | null;
  nextDisabled: boolean;
  nextReason: string | null;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
  onSave: () => void;
  onSelectStep: (step: WizardStepId) => void;
  children: React.ReactNode;
}) {
  const summary = familySummaryLines(draft);
  const currentMeta = WIZARD_STEPS.find((s) => s.id === currentStep);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">New product family</h1>
          <p className="text-xs text-muted-foreground">
            {savedAt ? `Draft saved · ${savedAt}` : "Not saved yet"} · {completedCount} of 7 steps complete
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Exit</Link>
        </Button>
      </div>
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        <nav className="border-b border-border p-3 lg:border-b-0 lg:border-r" aria-label="Wizard steps">
          <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
            {WIZARD_STEPS.map((step) => {
              const locked = step.phase !== 1;
              const current = step.id === currentStep;
              const done = completeSteps.includes(step.id) && !current;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    disabled={locked || busy}
                    onClick={() => onSelectStep(step.id)}
                    className={cn(
                      "flex w-full min-w-[9rem] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                      current ? "bg-muted font-medium" : "hover:bg-muted/70",
                      locked && "cursor-not-allowed opacity-60"
                    )}
                  >
                    {locked ? (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : done ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <span className="inline-flex h-4 w-4 items-center justify-center text-[10px]">{step.id}</span>
                    )}
                    {step.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="p-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Step {currentStep} · {currentMeta?.label}
            </h2>
            {children}
          </div>
        </div>
        <aside className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Family summary</p>
          {summary.length === 0 ? (
            <p className="text-xs text-muted-foreground">Selections appear here as you complete each step.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={busy || currentStep <= 1}>
            Back
          </Button>
          <Button type="button" variant="secondary" onClick={onSave} disabled={busy}>
            Save draft
          </Button>
          <div className="ml-auto flex min-w-0 flex-col items-end">
            <Button type="button" onClick={onNext} disabled={busy || nextDisabled}>
              Next
            </Button>
            {nextDisabled && nextReason ? (
              <p className="mt-1 max-w-sm text-right text-[11px] text-amber-700 dark:text-amber-400">{nextReason}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
