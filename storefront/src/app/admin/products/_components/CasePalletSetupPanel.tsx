"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import { PresetNumericInput } from "@/app/admin/products/_components/PresetNumericInput";
import type { CommercePackagingV1, InnerUnitType, PackagingFieldKey } from "@commerce-packaging/types";
import { normalizeCommercePackaging, hasPackagingMathConflict } from "@commerce-packaging/labels";
import { CASES_PER_PALLET_BUCKETS, UNITS_PER_CASE_BUCKETS } from "@/lib/admin/commerce-packaging-editor";

const INNER_UNIT_OPTIONS: { value: InnerUnitType; label: string }[] = [
  { value: "box", label: "Box" },
  { value: "bag", label: "Bag" },
  { value: "pack", label: "Pack" },
  { value: "dozen", label: "Dozen" },
  { value: "pair", label: "Pair" },
  { value: "each", label: "Each" },
  { value: "roll", label: "Roll" },
  { value: "sleeve", label: "Sleeve" },
  { value: "carton", label: "Carton" },
];

const UNITS_PER_INNER_PRESETS = [50, 90, 100, 150, 200, 250, 300];
const INNERS_PER_CASE_PRESETS = [1, 2, 4, 5, 6, 8, 10, 12, 20, 24];
const CASES_PER_PALLET_PRESETS = CASES_PER_PALLET_BUCKETS.map(Number);

const lbl = "text-[11px] font-semibold text-slate-600";
const field =
  "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums shadow-inner focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20";
const fieldBlocking =
  "mt-0.5 w-full rounded-lg border-2 border-red-400 bg-red-50/40 px-2 py-1.5 text-sm tabular-nums shadow-inner focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200";
const wrapBlocking = "rounded-lg border-2 border-red-400 bg-red-50/40 p-2";

type Props = {
  value: CommercePackagingV1;
  categorySlug: string | null;
  onChange: (next: CommercePackagingV1) => void;
  onApplySuggestions?: () => void;
  hasSuggestions?: boolean;
  disabled?: boolean;
  blockingKeys?: string[];
};

function formatProv(field: PackagingFieldKey, cp: CommercePackagingV1): string | null {
  const p = cp.field_provenance[field];
  if (!p) return null;
  const conf = Math.round(p.confidence * 100);
  return `${p.source.replace(/_/g, " ")} · ${conf}%${p.evidence_text ? ` · "${p.evidence_text.slice(0, 48)}"` : ""}`;
}

function missingPricing(cp: CommercePackagingV1): string[] {
  const missing: string[] = [];
  const hasCasePrice =
    (cp.case_price != null && cp.case_price > 0) ||
    (cp.compare_at_case_price != null && cp.compare_at_case_price > 0);
  if (!hasCasePrice) missing.push("Case price");
  if (cp.sell_by_pallet_enabled) {
    const hasPalletPrice =
      (cp.pallet_price != null && cp.pallet_price > 0) ||
      (cp.compare_at_pallet_price != null && cp.compare_at_pallet_price > 0);
    if (!hasPalletPrice) missing.push("Pallet price");
  }
  return missing;
}

function missingPackaging(cp: CommercePackagingV1): string[] {
  const missing: string[] = [];
  if (cp.units_per_case == null || cp.units_per_case <= 0) missing.push("Units/case");
  if (cp.sell_by_pallet_enabled && (cp.cases_per_pallet == null || cp.cases_per_pallet <= 0)) {
    missing.push("Cases/pallet");
  }
  return missing;
}

function priceInput(
  value: number | null | undefined,
  onChange: (n: number | null) => void,
  opts: { disabled?: boolean; blocking?: boolean; title?: string }
) {
  return (
    <input
      type="number"
      min={0}
      step="0.01"
      title={opts.title}
      disabled={opts.disabled}
      value={value ?? ""}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) && n >= 0 ? n : null);
      }}
      className={opts.blocking ? fieldBlocking : field}
      placeholder="0.00"
    />
  );
}

function SetupToolbar({
  value,
  disabled,
  missing,
  hasSuggestions,
  onApplySuggestions,
  onTogglePallet,
}: {
  value: CommercePackagingV1;
  disabled?: boolean;
  missing: string[];
  hasSuggestions?: boolean;
  onApplySuggestions?: () => void;
  onTogglePallet: (enabled: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
        Sell by case
      </span>
      <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
        <input
          type="checkbox"
          checked={value.sell_by_pallet_enabled}
          disabled={disabled}
          onChange={(e) => onTogglePallet(e.target.checked)}
          className="rounded border-slate-300 text-[#f06232]"
        />
        Sell by pallet
      </label>
      {missing.length > 0 ? (
        <span className="text-[10px] font-medium text-amber-800">
          Missing: {missing.join(" · ")}
        </span>
      ) : (
        <span className="text-[10px] font-semibold text-emerald-700">Complete</span>
      )}
      {hasSuggestions && onApplySuggestions ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onApplySuggestions}
          className="ml-auto rounded-md bg-[#f06232] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#e5582d]"
        >
          Apply parser suggestions
        </button>
      ) : null}
    </div>
  );
}

export function CasePalletSetupPanel({
  value,
  categorySlug,
  onChange,
  onApplySuggestions,
  hasSuggestions,
  disabled,
  blockingKeys = [],
}: Props) {
  const blockingSet = React.useMemo(() => new Set(blockingKeys), [blockingKeys]);
  const patch = React.useCallback(
    (partial: Partial<CommercePackagingV1>) => {
      onChange(normalizeCommercePackaging({ ...value, ...partial }, categorySlug));
    },
    [value, categorySlug, onChange]
  );

  const missingPrice = missingPricing(value);
  const missingPack = missingPackaging(value);
  const mathConflict = hasPackagingMathConflict(value);
  const casePriceBlocking = blockingSet.has("__case_price__");
  const unitsBlocking = blockingSet.has("__units_per_case__");

  return (
    <div className="space-y-3">
      <PremiumSectionCard
        title="Pricing & sales"
        description="List and sale prices for case and pallet. Sale price below list shows as a discount on the storefront."
        dense
        className="border-[#f06232]/15 bg-gradient-to-b from-[#fffaf7] to-white"
      >
        <SetupToolbar
          value={value}
          disabled={disabled}
          missing={missingPrice}
          hasSuggestions={hasSuggestions}
          onApplySuggestions={onApplySuggestions}
          onTogglePallet={(enabled) => patch({ sell_by_pallet_enabled: enabled })}
        />

        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label className="block" title="Internal cost per case — not shown to customers">
            <span className={lbl}>Standard cost</span>
            {priceInput(value.standard_cost_per_case, (n) => patch({ standard_cost_per_case: n }), {
              disabled,
              title: "Your cost per case",
            })}
          </label>
          <label className={`block ${casePriceBlocking ? wrapBlocking : ""}`} title="Regular list price per case">
            <span className={lbl}>
              Product price / case
              {casePriceBlocking ? (
                <span className="ml-1 text-[10px] font-bold uppercase text-red-700">Req</span>
              ) : null}
            </span>
            {priceInput(
              value.compare_at_case_price,
              (n) => patch({ compare_at_case_price: n }),
              { disabled, blocking: casePriceBlocking }
            )}
          </label>
          <label className={`block ${casePriceBlocking ? wrapBlocking : ""}`} title="Active sale price per case">
            <span className={lbl}>Sale price / case</span>
            {priceInput(value.case_price, (n) => patch({ case_price: n }), {
              disabled,
              blocking: casePriceBlocking,
            })}
            {formatProv("case_price", value) ? (
              <p className="mt-0.5 text-[10px] text-slate-500">{formatProv("case_price", value)}</p>
            ) : null}
          </label>
          <label
            className="block"
            title="Regular list price per pallet"
          >
            <span className={lbl}>Product price / pallet</span>
            {priceInput(
              value.compare_at_pallet_price,
              (n) => patch({ compare_at_pallet_price: n }),
              { disabled: disabled || !value.sell_by_pallet_enabled }
            )}
          </label>
          <label className="block" title="Active sale price per pallet">
            <span className={lbl}>Sale price / pallet</span>
            {priceInput(value.pallet_price, (n) => patch({ pallet_price: n }), {
              disabled: disabled || !value.sell_by_pallet_enabled,
            })}
            {formatProv("pallet_price", value) ? (
              <p className="mt-0.5 text-[10px] text-slate-500">{formatProv("pallet_price", value)}</p>
            ) : null}
          </label>
        </div>
      </PremiumSectionCard>

      <PremiumSectionCard
        title="UOM & packaging"
        description="How gloves are packed inside a case and on a pallet. Inner units are operational detail — customers buy by case or pallet."
        dense
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
          {(value.case_label || value.pallet_label) && (
            <div className="min-w-0 flex-1 rounded-md border border-sky-100 bg-sky-50/80 px-2 py-1 text-[10px] leading-snug text-sky-900">
              {value.case_label ? <span>{value.case_label}</span> : null}
              {value.case_label && value.pallet_label ? <span className="mx-1.5 text-sky-400">·</span> : null}
              {value.pallet_label ? <span>{value.pallet_label}</span> : null}
            </div>
          )}
          {missingPack.length > 0 ? (
            <span className="text-[10px] font-medium text-amber-800">Missing: {missingPack.join(" · ")}</span>
          ) : (
            <span className="text-[10px] font-semibold text-emerald-700">Packaging complete</span>
          )}
        </div>

        <div className="mt-2 grid gap-3 xl:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Case pack</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={`block sm:col-span-2 ${unitsBlocking ? wrapBlocking : ""}`}>
                <span className={lbl}>
                  Units per case
                  {unitsBlocking ? (
                    <span className="ml-1 text-[10px] font-bold uppercase text-red-700">Req</span>
                  ) : null}
                </span>
                <input
                  type="number"
                  min={1}
                  disabled={disabled}
                  value={value.units_per_case ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    patch({
                      units_per_case: Number.isFinite(n) && n > 0 ? n : null,
                      units_per_case_overridden: true,
                    });
                  }}
                  className={unitsBlocking ? fieldBlocking : field}
                />
                {formatProv("units_per_case", value) ? (
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatProv("units_per_case", value)}</p>
                ) : null}
              </label>
              <PresetNumericInput
                compact
                label="Inners per case"
                value={value.inners_per_case}
                presets={INNERS_PER_CASE_PRESETS}
                disabled={disabled}
                onChange={(n) => patch({ inners_per_case: n, units_per_case_overridden: false })}
              />
              <PresetNumericInput
                compact
                label="Units per inner"
                value={value.units_per_inner}
                presets={UNITS_PER_INNER_PRESETS}
                disabled={disabled}
                onChange={(n) => patch({ units_per_inner: n, units_per_case_overridden: false })}
              />
              <label className="block sm:col-span-2">
                <span className={lbl}>Inner unit type</span>
                <select
                  disabled={disabled}
                  value={value.inner_unit_type ?? ""}
                  onChange={(e) =>
                    patch({ inner_unit_type: (e.target.value || null) as InnerUnitType | null })
                  }
                  className={field}
                >
                  <option value="">Select…</option>
                  {INNER_UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div
            className={`space-y-2 rounded-lg border p-2.5 ${
              value.sell_by_pallet_enabled
                ? "border-slate-100 bg-slate-50/50"
                : "border-dashed border-slate-200 bg-slate-50/30 opacity-60"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pallet load</p>
            {!value.sell_by_pallet_enabled ? (
              <p className="text-[10px] text-slate-500">Enable “Sell by pallet” above to configure pallet UOM.</p>
            ) : (
              <div className="grid gap-2">
                <PresetNumericInput
                  compact
                  label="Cases per pallet"
                  value={value.cases_per_pallet}
                  presets={CASES_PER_PALLET_PRESETS}
                  disabled={disabled}
                  onChange={(n) => patch({ cases_per_pallet: n })}
                />
                <label className="block">
                  <span className={lbl}>Units per pallet</span>
                  <input
                    type="number"
                    min={1}
                    disabled={disabled}
                    value={value.units_per_pallet ?? ""}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      patch({
                        units_per_pallet: Number.isFinite(n) && n > 0 ? n : null,
                        units_per_pallet_overridden: true,
                      });
                    }}
                    className={field}
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">Auto-calculated unless overridden.</p>
                </label>
              </div>
            )}
          </div>
        </div>

        {value.parse_warnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[10px] text-amber-800">
            {value.parse_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        {mathConflict ? (
          <p className="mt-2 text-[10px] font-medium text-amber-700">
            Inner packaging math does not match units per case — adjust inners × units or override units/case.
          </p>
        ) : null}
      </PremiumSectionCard>
    </div>
  );
}

export { UNITS_PER_CASE_BUCKETS };
