"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";
import { buildRequestPricingHref, type RequestPricingQueryParams } from "@/lib/discovery/request-pricing-url";

const GLOVE_TYPES = [
  { value: "exam_disposable", label: "Exam / disposable" },
  { value: "industrial", label: "Industrial / mechanical" },
  { value: "food_service", label: "Food service" },
  { value: "cleanroom", label: "Cleanroom / critical" },
  { value: "unsure", label: "Not sure — help me choose" },
] as const;

const MATERIALS = [
  { value: "nitrile", label: "Nitrile" },
  { value: "latex", label: "Latex" },
  { value: "vinyl", label: "Vinyl" },
  { value: "poly", label: "Poly / hybrid" },
  { value: "blend", label: "Blend / specialty" },
] as const;

const SIZES = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
  { value: "xxl", label: "XXL" },
  { value: "mixed", label: "Mixed sizes" },
] as const;

const VOLUMES = [
  { value: "under_1_case", label: "Under 1 case / mo" },
  { value: "cases_1_5", label: "1–5 cases / mo" },
  { value: "cases_6_10", label: "6–10 cases / mo" },
  { value: "cases_11_25", label: "11–25 cases / mo" },
  { value: "cases_26_50", label: "26–50 cases / mo" },
  { value: "cases_51_100", label: "51–100 cases / mo" },
  { value: "cases_100_plus", label: "100+ cases / mo" },
] as const;

const inputClass =
  "flex min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 shadow-sm placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5500]/35 focus-visible:border-[#FF5500]";

function bulkOrderToRfqParams(args: {
  industry: IndustryKey | "";
  gloveType: (typeof GLOVE_TYPES)[number]["value"] | "";
  material: (typeof MATERIALS)[number]["value"] | "";
  size: (typeof SIZES)[number]["value"] | "";
  volume: (typeof VOLUMES)[number]["value"] | "";
}): RequestPricingQueryParams {
  const out: RequestPricingQueryParams = { source: "homepage_bulk_builder" };
  if (args.industry) out.industry = args.industry;
  if (args.gloveType) out.type = args.gloveType;
  if (args.material) out.material = args.material;
  if (args.size) out.size = args.size;
  if (args.volume) out.volume = args.volume;
  if (args.volume === "cases_100_plus") out.case_range = "100_plus";
  return out;
}

export function QuickBulkBuilder() {
  const router = useRouter();
  const [industry, setIndustry] = React.useState<IndustryKey | "">("");
  const [gloveType, setGloveType] = React.useState<(typeof GLOVE_TYPES)[number]["value"] | "">("");
  const [material, setMaterial] = React.useState<(typeof MATERIALS)[number]["value"] | "">("");
  const [size, setSize] = React.useState<(typeof SIZES)[number]["value"] | "">("");
  const [volume, setVolume] = React.useState<(typeof VOLUMES)[number]["value"] | "">("");

  function routeToLargeVolumeInquiry(nextVolume: (typeof VOLUMES)[number]["value"]) {
    router.push(
      buildRequestPricingHref(
        bulkOrderToRfqParams({ industry, gloveType, material, size, volume: nextVolume })
      )
    );
  }

  function onVolumeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as (typeof VOLUMES)[number]["value"] | "";
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
    router.push(buildRequestPricingHref(bulkOrderToRfqParams({ industry, gloveType, material, size, volume })));
  }

  return (
    <div
      id="bulk-order"
      className="scroll-mt-24 rounded-2xl border-2 border-[#FF5500] bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.12)] sm:p-6"
    >
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Build your bulk order</h2>
      <p className="mb-4 text-sm leading-relaxed text-neutral-600">
        Quote-first B2B — no checkout. For <span className="font-semibold text-neutral-900">100+ cases / mo</span> we
        route you straight to an inquiry so a rep can scope pricing and fulfillment.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="qb-industry" className="text-sm font-medium text-neutral-800">
            Industry
          </label>
          <select
            id="qb-industry"
            className={inputClass}
            value={industry}
            onChange={(e) => setIndustry(e.target.value as IndustryKey | "")}
          >
            <option value="" className="bg-white text-neutral-900">
              Select industry
            </option>
            {INDUSTRY_KEYS.map((key) => (
              <option key={key} value={key} className="bg-white text-neutral-900">
                {INDUSTRIES[key].name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="qb-type" className="text-sm font-medium text-neutral-800">
            Glove type
          </label>
          <select
            id="qb-type"
            className={inputClass}
            value={gloveType}
            onChange={(e) => setGloveType(e.target.value as (typeof GLOVE_TYPES)[number]["value"] | "")}
          >
            <option value="" className="bg-white text-neutral-900">
              Select type
            </option>
            {GLOVE_TYPES.map((o) => (
              <option key={o.value} value={o.value} className="bg-white text-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="qb-material" className="text-sm font-medium text-neutral-800">
              Material
            </label>
            <select
              id="qb-material"
              className={inputClass}
              value={material}
              onChange={(e) => setMaterial(e.target.value as (typeof MATERIALS)[number]["value"] | "")}
            >
              <option value="" className="bg-white text-neutral-900">
                Select material
              </option>
              {MATERIALS.map((o) => (
                <option key={o.value} value={o.value} className="bg-white text-neutral-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="qb-size" className="text-sm font-medium text-neutral-800">
              Size
            </label>
            <select
              id="qb-size"
              className={inputClass}
              value={size}
              onChange={(e) => setSize(e.target.value as (typeof SIZES)[number]["value"] | "")}
            >
              <option value="" className="bg-white text-neutral-900">
                Select size
              </option>
              {SIZES.map((o) => (
                <option key={o.value} value={o.value} className="bg-white text-neutral-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="qb-volume" className="text-sm font-medium text-neutral-800">
            Monthly case volume
          </label>
          <select id="qb-volume" className={inputClass} value={volume} onChange={onVolumeChange}>
            <option value="" className="bg-white text-neutral-900">
              Select volume
            </option>
            {VOLUMES.map((o) => (
              <option key={o.value} value={o.value} className="bg-white text-neutral-900">
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
