"use client";

import { ShieldCheck, Truck, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const CUES = [
  { icon: ShieldCheck, label: "B2B pricing" },
  { icon: Truck, label: "Fast fulfillment" },
  { icon: FileCheck, label: "1,000+ SKUs" },
];

export function TrustCues({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-b border-white/10 pb-4 text-xs text-white/60",
        className
      )}
      role="list"
    >
      {CUES.map(({ icon: Icon, label }) => (
        <span key={label} className="flex items-center gap-2" role="listitem">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
