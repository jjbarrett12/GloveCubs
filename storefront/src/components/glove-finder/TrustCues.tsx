"use client";

import { ShieldCheck, Truck, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrepLineOperationalCopy } from "@/lib/prep-line/operational-copy";

const CUES = [
  { icon: ShieldCheck, label: "B2B pricing" },
  { icon: Truck, label: "Case & pallet programs" },
  { icon: FileCheck, label: "Published catalog SKUs" },
];

const PREP_LINE_CUES = [
  { icon: ShieldCheck, label: PrepLineOperationalCopy.trustCueSpecs },
  { icon: Truck, label: PrepLineOperationalCopy.trustCueQuote },
  { icon: FileCheck, label: PrepLineOperationalCopy.trustCueVerify },
];

export type TrustCueVariant = "default" | "prep_line";

export function TrustCues({ className, variant = "default" }: { className?: string; variant?: TrustCueVariant }) {
  const cues = variant === "prep_line" ? PREP_LINE_CUES : CUES;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-b border-white/10 pb-4 text-xs text-white/60",
        className
      )}
      role="list"
    >
      {cues.map(({ icon: Icon, label }) => (
        <span key={label} className="flex items-center gap-2" role="listitem">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
