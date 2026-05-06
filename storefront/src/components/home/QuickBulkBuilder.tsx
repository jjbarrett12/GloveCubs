"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";

/** Shared with homepage procurement builder — keep values in sync. */
export const HOME_BULK_GLOVE_TYPES = [
  { value: "exam_disposable", label: "Exam / disposable" },
  { value: "industrial", label: "Industrial / mechanical" },
  { value: "food_service", label: "Food service" },
  { value: "cleanroom", label: "Cleanroom / critical" },
  { value: "unsure", label: "Not sure — help me choose" },
] as const;

export const HOME_BULK_MATERIALS = [
  { value: "nitrile", label: "Nitrile" },
  { value: "latex", label: "Latex" },
  { value: "vinyl", label: "Vinyl" },
  { value: "poly", label: "Poly / hybrid" },
  { value: "blend", label: "Blend / specialty" },
] as const;

export const HOME_BULK_SIZES = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
  { value: "xxl", label: "XXL" },
  { value: "mixed", label: "Mixed sizes" },
] as const;

export const HOME_BULK_VOLUMES = [
  { value: "under_1_case", label: "Under 1 case / mo" },
  { value: "cases_1_5", label: "1–5 cases / mo" },
  { value: "cases_6_10", label: "6–10 cases / mo" },
  { value: "cases_11_25", label: "11–25 cases / mo" },
  { value: "cases_26_50", label: "26–50 cases / mo" },
  { value: "cases_51_100", label: "51–100 cases / mo" },
  { value: "cases_100_plus", label: "100+ cases / mo" },
] as const;

const inputClass =
  "flex min-h-12 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-base text-white placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/40 focus-visible:border-white/30";

function buildRequestPricingParams(args: {
  industry: IndustryKey | "";
  gloveType: (typeof HOME_BULK_GLOVE_TYPES)[number]["value"] | "";
  material: (typeof HOME_BULK_MATERIALS)[number]["value"] | "";
  size: (typeof HOME_BULK_SIZES)[number]["value"] | "";
  volume: (typeof HOME_BULK_VOLUMES)[number]["value"] | "";
}): URLSearchParams {
  const params = new URLSearchParams();
  if (args.industry) params.set("industry", args.industry);
  if (args.gloveType) params.set("type", args.gloveType);
  if (args.material) params.set("material", args.material);
  if (args.size) params.set("size", args.size);
  if (args.volume) params.set("volume", args.volume);
  if (args.volume === "cases_100_plus") params.set("case_range", "100_plus");
  params.set("source", "homepage_bulk_builder");
  return params;
}

export function QuickBulkBuilder() {
  const router = useRouter();
  const [industry, setIndustry] = React.useState<IndustryKey | "">("");
  const [gloveType, setGloveType] = React.useState<(typeof HOME_BULK_GLOVE_TYPES)[number]["value"] | "">("");
  const [material, setMaterial] = React.useState<(typeof HOME_BULK_MATERIALS)[number]["value"] | "">("");
  const [size, setSize] = React.useState<(typeof HOME_BULK_SIZES)[number]["value"] | "">("");
  const [volume, setVolume] = React.useState<(typeof HOME_BULK_VOLUMES)[number]["value"] | "">("");

  function routeToLargeVolumeInquiry(nextVolume: (typeof HOME_BULK_VOLUMES)[number]["value"]) {
    const params = buildRequestPricingParams({
      industry,
      gloveType,
      material,
      size,
      volume: nextVolume,
    });
    router.push(`/request-pricing?${params.toString()}`);
  }

  function onVolumeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as (typeof HOME_BULK_VOLUMES)[number]["value"] | "";
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
    const params = buildRequestPricingParams({ industry, gloveType, material, size, volume });
    router.push(`/request-pricing?${params.toString()}`);
  }

  return (
    <div id="bulk-order" className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Build your bulk order</h2>
      <p className="mb-4 text-sm text-white/65">
        Quote-first B2B — no checkout. For <span className="font-semibold text-white/90">100+ cases / mo</span> we
        route you straight to an inquiry so a rep can scope pricing and fulfillment.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="qb-industry" className="text-sm font-medium text-white/90">
            Industry
          </label>
          <select
            id="qb-industry"
            className={inputClass}
            value={industry}
            onChange={(e) => setIndustry(e.target.value as IndustryKey | "")}
          >
            <option value="" className="bg-neutral-900">
              Select industry
            </option>
            {INDUSTRY_KEYS.map((key) => (
              <option key={key} value={key} className="bg-neutral-900">
                {INDUSTRIES[key].name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="qb-type" className="text-sm font-medium text-white/90">
            Glove type
          </label>
          <select
            id="qb-type"
            className={inputClass}
            value={gloveType}
            onChange={(e) => setGloveType(e.target.value as (typeof HOME_BULK_GLOVE_TYPES)[number]["value"] | "")}
          >
            <option value="" className="bg-neutral-900">
              Select type
            </option>
            {HOME_BULK_GLOVE_TYPES.map((o) => (
              <option key={o.value} value={o.value} className="bg-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="qb-material" className="text-sm font-medium text-white/90">
              Material
            </label>
            <select
              id="qb-material"
              className={inputClass}
              value={material}
              onChange={(e) => setMaterial(e.target.value as (typeof HOME_BULK_MATERIALS)[number]["value"] | "")}
            >
              <option value="" className="bg-neutral-900">
                Select material
              </option>
              {HOME_BULK_MATERIALS.map((o) => (
                <option key={o.value} value={o.value} className="bg-neutral-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="qb-size" className="text-sm font-medium text-white/90">
              Size
            </label>
            <select
              id="qb-size"
              className={inputClass}
              value={size}
              onChange={(e) => setSize(e.target.value as (typeof HOME_BULK_SIZES)[number]["value"] | "")}
            >
              <option value="" className="bg-neutral-900">
                Select size
              </option>
              {HOME_BULK_SIZES.map((o) => (
                <option key={o.value} value={o.value} className="bg-neutral-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="qb-volume" className="text-sm font-medium text-white/90">
            Monthly case volume
          </label>
          <select id="qb-volume" className={inputClass} value={volume} onChange={onVolumeChange}>
            <option value="" className="bg-neutral-900">
              Select volume
            </option>
            {HOME_BULK_VOLUMES.map((o) => (
              <option key={o.value} value={o.value} className="bg-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          size="lg"
          className="min-h-12 w-full bg-[hsl(var(--primary))] text-base text-white hover:opacity-90"
        >
          Get bulk pricing
        </Button>
      </form>
    </div>
  );
}
