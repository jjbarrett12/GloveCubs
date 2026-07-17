"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  Hand,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import { cn } from "@/lib/utils";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/industries";
import { STORE_INDUSTRY_FACET_ROWS } from "@/config/store-industry-facet";
import {
  BULK_GLOVE_TYPE_OPTIONS,
  BULK_SIZE_OPTIONS,
  STORE_MATERIAL_BULK_OPTIONS,
  type BulkGloveTypeValue,
  type BulkSizeValue,
  type StoreMaterialBulkValue,
} from "@/config/store-material-bulk-options";
import { buildRequestPricingHref, type RequestPricingQueryParams } from "@/lib/discovery/request-pricing-url";

const VOLUMES = [
  { value: "under_1_case", label: "Under 1 case / mo" },
  { value: "cases_1_5", label: "1–5 cases / mo" },
  { value: "cases_6_10", label: "6–10 cases / mo" },
  { value: "cases_6_20", label: "6–20 cases / mo" },
  { value: "cases_11_25", label: "11–25 cases / mo" },
  { value: "cases_21_plus", label: "21+ cases / mo" },
  { value: "cases_26_50", label: "26–50 cases / mo" },
  { value: "cases_51_100", label: "51–100 cases / mo" },
  { value: "cases_100_plus", label: "100+ cases / mo" },
  { value: "not_sure", label: "Not sure" },
] as const;

const inputClass =
  "flex min-h-12 w-full appearance-none rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-10 text-base text-neutral-900 shadow-sm focus-visible:border-[#f06232] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f06232]/35";

const multiSelectPanelClass =
  "absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg [scrollbar-width:thin]";

/** Industry / store facet options: landing keys first, then catalog facets (aligned with header nav). */
const BULK_INDUSTRY_OPTIONS: { value: string; label: string }[] = (() => {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const key of INDUSTRY_KEYS) {
    seen.add(key);
    out.push({ value: key, label: INDUSTRIES[key].name });
  }
  for (const row of STORE_INDUSTRY_FACET_ROWS) {
    if (seen.has(row.value)) continue;
    seen.add(row.value);
    out.push({ value: row.value, label: row.label });
  }
  return out;
})();

function materialsForGloveType(gloveType: BulkGloveTypeValue | "") {
  if (gloveType === "disposable") {
    return STORE_MATERIAL_BULK_OPTIONS.filter((option) => option.group === "disposable");
  }
  if (gloveType === "reusable") {
    return STORE_MATERIAL_BULK_OPTIONS.filter((option) => option.group === "reusable");
  }
  return STORE_MATERIAL_BULK_OPTIONS;
}

function toggleSelection<T extends string>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

function bulkOrderToRfqParams(args: {
  industry: string;
  gloveType: BulkGloveTypeValue | "";
  materials: StoreMaterialBulkValue[];
  sizes: BulkSizeValue[];
  volume: (typeof VOLUMES)[number]["value"] | "";
}): RequestPricingQueryParams {
  const out: RequestPricingQueryParams = { source: "homepage_bulk_builder" };
  if (args.industry) out.industry = args.industry;
  if (args.gloveType) out.type = args.gloveType;
  if (args.materials.length) out.material = args.materials.join(",");
  if (args.sizes.length) out.size = args.sizes.join(",");
  if (args.volume) out.volume = args.volume;
  if (args.volume === "cases_100_plus") out.case_range = "100_plus";
  return out;
}

function BulkSelectField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  options,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-neutral-900">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <select
          id={id}
          className={cn(inputClass, !value && "text-neutral-500")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" className="bg-white text-neutral-500">
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-white text-neutral-900">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
      </div>
    </div>
  );
}

function BulkMultiSelectDropdown<T extends string>({
  id,
  label,
  hint,
  footerHint,
  placeholder,
  options,
  selected,
  onChange,
  groupSections,
}: {
  id: string;
  label: string;
  hint: string;
  footerHint: string;
  placeholder: string;
  options: readonly { value: T; label: string; group?: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  groupSections?: { key: string; label: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  const selectedLabels = selected
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(", ");

  function renderOption(option: { value: T; label: string }) {
    const isSelected = selected.includes(option.value);
    return (
      <li key={option.value} role="option" aria-selected={isSelected}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-neutral-900 hover:bg-neutral-50",
            isSelected && "bg-[#fff8f3]"
          )}
          onClick={() => onChange(toggleSelection(selected, option.value))}
        >
          <span className={cn(isSelected && "font-medium text-[#c2410c]")}>{option.label}</span>
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded border",
              isSelected ? "border-[#f06232] bg-[#f06232] text-white" : "border-neutral-300 bg-white"
            )}
            aria-hidden
          >
            {isSelected ? <Check className="size-3 stroke-[3]" /> : null}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div ref={rootRef} className="flex h-full flex-col rounded-xl border border-neutral-200 bg-neutral-50/40 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-neutral-900">
          {label}
        </label>
        <span className="text-xs text-neutral-500">{hint}</span>
      </div>

      <div className="relative">
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            inputClass,
            "items-center justify-between gap-2 pl-3 text-left",
            !selected.length && "text-neutral-500"
          )}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{selected.length ? selectedLabels : placeholder}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <ul role="listbox" aria-multiselectable="true" aria-labelledby={id} className={multiSelectPanelClass}>
            {groupSections
              ? groupSections.map((section) => {
                  const sectionOptions = options.filter((option) => option.group === section.key);
                  if (!sectionOptions.length) return null;
                  return (
                    <li key={section.key} role="presentation">
                      <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
                        {section.label}
                      </p>
                      <ul role="group" aria-label={section.label}>
                        {sectionOptions.map(renderOption)}
                      </ul>
                    </li>
                  );
                })
              : options.map(renderOption)}
          </ul>
        ) : null}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {footerHint}
      </p>
    </div>
  );
}

function BulkQuoteSummary() {
  const { lineCount, totalCount, hydrated } = useQuoteCart();

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 px-4 py-3 sm:min-w-[220px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">Bulk quote</div>
      <Link href="/quote-cart" className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-neutral-700 hover:text-neutral-900">
        <span className="tabular-nums">
          <span className="font-semibold text-neutral-900">{hydrated ? lineCount : "—"}</span> lines
        </span>
        <span className="text-neutral-300">·</span>
        <span className="tabular-nums">
          <span className="font-semibold text-neutral-900">{hydrated ? totalCount : "—"}</span> units
        </span>
        <span className="font-bold text-[#f06232]">Review quote →</span>
      </Link>
      <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">Pricing is confirmed during review, not online.</p>
    </div>
  );
}

export function QuickBulkBuilder() {
  const router = useRouter();
  const [industry, setIndustry] = React.useState<string>("");
  const [gloveType, setGloveType] = React.useState<BulkGloveTypeValue | "">("");
  const [materials, setMaterials] = React.useState<StoreMaterialBulkValue[]>([]);
  const [sizes, setSizes] = React.useState<BulkSizeValue[]>([]);
  const [volume, setVolume] = React.useState<(typeof VOLUMES)[number]["value"] | "">("");

  const materialOptions = React.useMemo(() => materialsForGloveType(gloveType), [gloveType]);
  const materialOptionValues = React.useMemo(
    () => new Set(materialOptions.map((option) => option.value)),
    [materialOptions]
  );

  React.useEffect(() => {
    setMaterials((current) => current.filter((value) => materialOptionValues.has(value)));
  }, [materialOptionValues]);

  function routeToLargeVolumeInquiry(nextVolume: (typeof VOLUMES)[number]["value"]) {
    router.push(
      buildRequestPricingHref(
        bulkOrderToRfqParams({ industry, gloveType, materials, sizes, volume: nextVolume })
      )
    );
  }

  function onVolumeChange(value: string) {
    const val = value as (typeof VOLUMES)[number]["value"] | "";
    setVolume(val);
    if (val === "cases_100_plus") {
      routeToLargeVolumeInquiry("cases_100_plus");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (volume === "cases_100_plus") {
      routeToLargeVolumeInquiry("cases_100_plus");
      return;
    }
    router.push(buildRequestPricingHref(bulkOrderToRfqParams({ industry, gloveType, materials, sizes, volume })));
  }

  const materialGroups =
    gloveType === "both"
      ? [
          { key: "disposable", label: "Disposable" },
          { key: "reusable", label: "Reusable" },
        ]
      : undefined;

  return (
    <div
      id="bulk-order"
      className="scroll-mt-24 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] sm:p-6"
    >
      <h2 className="text-xl font-bold text-neutral-900">Build your bulk order</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Quote-first B2B — no checkout. For <span className="font-semibold text-neutral-900">100+ cases / mo</span> we
        route you straight to an inquiry so a rep can scope pricing and fulfillment.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BulkSelectField
            id="qb-industry"
            label="Industry"
            icon={Building2}
            value={industry}
            onChange={setIndustry}
            placeholder="Select industry / program"
            options={BULK_INDUSTRY_OPTIONS}
          />
          <BulkSelectField
            id="qb-type"
            label="Glove type"
            icon={Hand}
            value={gloveType}
            onChange={(value) => setGloveType(value as BulkGloveTypeValue | "")}
            placeholder="Select type"
            options={BULK_GLOVE_TYPE_OPTIONS}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BulkMultiSelectDropdown
            id="qb-material"
            label="Material"
            hint="Select all that apply"
            footerHint="Choose multiple materials"
            placeholder="Select material"
            options={materialOptions}
            selected={materials}
            onChange={setMaterials}
            groupSections={materialGroups}
          />
          <BulkMultiSelectDropdown
            id="qb-size"
            label="Size"
            hint="Select all that apply"
            footerHint="Choose multiple sizes"
            placeholder="Select size"
            options={BULK_SIZE_OPTIONS}
            selected={sizes}
            onChange={setSizes}
          />
        </div>

        <BulkSelectField
          id="qb-volume"
          label="Monthly case volume"
          icon={BarChart3}
          value={volume}
          onChange={onVolumeChange}
          placeholder="Select volume"
          options={VOLUMES}
        />

        <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-stretch sm:justify-between">
          <Button
            type="submit"
            size="lg"
            className="min-h-12 flex-1 bg-[hsl(var(--primary))] text-base text-white hover:opacity-90 sm:max-w-none"
          >
            <Calculator className="mr-2 size-4" aria-hidden />
            Get bulk pricing
          </Button>
          <BulkQuoteSummary />
        </div>
      </form>
    </div>
  );
}
