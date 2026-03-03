"use client";

import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStepId } from "@/config/gloveFinder";
import { Check } from "lucide-react";
import { TrustCues } from "./TrustCues";

const TRANSITION = "transition-all duration-200";

interface WizardLayoutProps {
  currentStep: WizardStepId;
  title: string;
  subtext: string;
  children: React.ReactNode;
  className?: string;
  showTrustCues?: boolean;
}

export function WizardLayout({ currentStep, title, subtext, children, className, showTrustCues = true }: WizardLayoutProps) {
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className={cn("flex flex-col gap-6 lg:flex-row lg:gap-8", className)}>
      {/* Left: sticky progress (desktop) */}
      <aside className="shrink-0 lg:w-52 lg:sticky lg:top-6 lg:self-start">
        <nav aria-label="Progress">
          <ol className="flex flex-row gap-2 lg:flex-col lg:gap-1">
            {WIZARD_STEPS.map((step, i) => {
              const isComplete = i < currentIndex;
              const isCurrent = step.id === currentStep;
              return (
                <li key={step.id} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      TRANSITION,
                      isComplete && "bg-primary text-primary-foreground",
                      isCurrent && "border-2 border-primary bg-primary/10 text-primary",
                      !isComplete && !isCurrent && "border border-white/20 bg-white/5 text-white/60"
                    )}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "hidden text-sm lg:inline",
                      isCurrent ? "font-medium text-white" : "text-white/60"
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>

      {/* Right: content card */}
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <header className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {title}
            </h1>
            <p className="mt-1 text-sm text-white/60">{subtext}</p>
            {showTrustCues && <TrustCues className="mt-4" />}
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
