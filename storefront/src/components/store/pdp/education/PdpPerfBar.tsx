import type { PerfLevel } from "@/lib/catalog/pdp-education";
import { cn } from "@/lib/utils";

const LEVEL_LABELS = ["Low", "Medium", "High"] as const;

export function PdpPerfBar({ label, level }: { label: string; level: PerfLevel }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-white/85">{label}</span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-white/45">{LEVEL_LABELS[level]}</span>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-2 flex-1 rounded-sm",
              i <= level ? "bg-[var(--color-accent-orange)]" : "bg-white/10"
            )}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
