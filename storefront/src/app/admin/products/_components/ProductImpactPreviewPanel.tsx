"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import { adminFormInput, adminMutedPanel, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import {
  PERF_LEVEL_LABELS,
  SCIENCE_MOCKUP_PERF,
  type PerfLevel,
  type ScienceMockupPerfKey,
} from "@/config/gloveScienceLab";
import {
  deriveProductImpactPerformance,
  type ProductImpactPerformance,
} from "@/lib/admin/derive-product-impact-performance";

const PERF_BAR_FILLS: Record<ScienceMockupPerfKey, string> = {
  grip: "linear-gradient(90deg, rgb(255 106 0 / 0.85), var(--color-accent-orange))",
  abrasion: "linear-gradient(90deg, rgb(245 158 11 / 0.85), rgb(251 191 36))",
  chemical: "linear-gradient(90deg, rgb(56 189 248 / 0.85), rgb(14 165 233))",
  cut: "linear-gradient(90deg, rgb(244 63 94 / 0.85), rgb(225 29 72))",
  comfort: "linear-gradient(90deg, rgb(167 139 250 / 0.85), rgb(139 92 246))",
  costPerUse: "linear-gradient(90deg, rgb(52 211 153 / 0.85), rgb(16 185 129))",
};

const PERF_VALUE_HIGH: Partial<Record<ScienceMockupPerfKey, string>> = {
  grip: "text-[var(--color-accent-orange)]",
  abrasion: "text-amber-600",
  chemical: "text-sky-600",
  cut: "text-rose-600",
  comfort: "text-violet-600",
  costPerUse: "text-emerald-600",
};

const field = cn(adminFormInput, "rounded-lg text-xs shadow-inner");

function ImpactPerfBar({
  metricKey,
  label,
  level,
  onChange,
  disabled,
}: {
  metricKey: ScienceMockupPerfKey;
  label: string;
  level: PerfLevel;
  onChange: (level: PerfLevel) => void;
  disabled?: boolean;
}) {
  const width = level === 0 ? "33%" : level === 1 ? "66%" : "100%";
  const highClass = PERF_VALUE_HIGH[metricKey] ?? "text-admin-accent";

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-admin-secondary">{label}</span>
        <select
          disabled={disabled}
          value={String(level)}
          onChange={(e) => onChange(Number(e.target.value) as PerfLevel)}
          className={cn(field, "h-7 w-[6.5rem] shrink-0 py-0")}
          aria-label={`${label} impact level`}
        >
          <option value="0">{PERF_LEVEL_LABELS[0]}</option>
          <option value="1">{PERF_LEVEL_LABELS[1]}</option>
          <option value="2">{PERF_LEVEL_LABELS[2]}</option>
        </select>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-admin-border-subtle"
        role="img"
        aria-label={`${label}: ${PERF_LEVEL_LABELS[level]}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width, background: PERF_BAR_FILLS[metricKey] }}
        />
      </div>
      <p
        className={cn(
          "mt-0.5 text-right text-[10px] font-extrabold uppercase tracking-[0.06em]",
          level === 2 || (metricKey === "costPerUse" && level === 0) ? highClass : "text-admin-muted",
        )}
      >
        {PERF_LEVEL_LABELS[level]}
      </p>
    </div>
  );
}

type Props = {
  value: ProductImpactPerformance;
  attributes: Record<string, string | string[]>;
  categorySlug: string | null;
  onChange: (next: ProductImpactPerformance) => void;
  disabled?: boolean;
};

export function ProductImpactPreviewPanel({
  value,
  attributes,
  categorySlug,
  onChange,
  disabled,
}: Props) {
  const derived = React.useMemo(
    () => deriveProductImpactPerformance({ attributes, categorySlug }),
    [attributes, categorySlug],
  );

  const isCustom = React.useMemo(
    () => SCIENCE_MOCKUP_PERF.some(({ key }) => value[key] !== derived[key]),
    [value, derived],
  );

  function patchMetric(key: ScienceMockupPerfKey, level: PerfLevel) {
    onChange({ ...value, [key]: level });
  }

  function resetFromAttributes() {
    onChange(derived);
  }

  return (
    <PremiumSectionCard
      title="Recommended impact"
      description="Set directional impact levels for this glove. Saved with the product and used on storefront education surfaces."
      dense
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">
          {isCustom ? "Custom levels" : "Matches attribute-derived defaults"}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={resetFromAttributes}
          className={cn(adminSecondaryButton, "text-[10px]")}
        >
          Reset from attributes
        </button>
      </div>

      <div className={cn(adminMutedPanel, "space-y-2.5 p-3")}>
        {SCIENCE_MOCKUP_PERF.map(({ key, label }) => (
          <ImpactPerfBar
            key={key}
            metricKey={key}
            label={label}
            level={value[key]}
            onChange={(level) => patchMetric(key, level)}
            disabled={disabled}
          />
        ))}
      </div>

      <p className="mt-2 text-[10px] leading-snug text-admin-muted">
        Educational guidance only — not lab-certified scores. Low / medium / high are relative tradeoffs for procurement context.
      </p>
    </PremiumSectionCard>
  );
}
