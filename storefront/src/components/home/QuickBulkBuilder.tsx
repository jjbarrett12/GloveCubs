"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";

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
  { value: "cases_6_20", label: "6–20 cases / mo" },
  { value: "cases_21_plus", label: "21+ cases / mo" },
] as const;

const inputClass =
  "flex min-h-12 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-base text-white placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/40 focus-visible:border-white/30";

export function QuickBulkBuilder() {
  const router = useRouter();
  const [industry, setIndustry] = React.useState<IndustryKey | "">("");
  const [gloveType, setGloveType] = React.useState<(typeof GLOVE_TYPES)[number]["value"] | "">("");
  const [material, setMaterial] = React.useState<(typeof MATERIALS)[number]["value"] | "">("");
  const [size, setSize] = React.useState<(typeof SIZES)[number]["value"] | "">("");
  const [volume, setVolume] = React.useState<(typeof VOLUMES)[number]["value"] | "">("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (industry) params.set("industry", industry);
    if (gloveType) params.set("type", gloveType);
    if (material) params.set("material", material);
    if (size) params.set("size", size);
    if (volume) params.set("volume", volume);
    params.set("source", "homepage_bulk_builder");
    router.push(`/request-pricing?${params.toString()}`);
  }

  return (
    <div id="bulk-order" className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Build your bulk order</h2>
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
            onChange={(e) => setGloveType(e.target.value as (typeof GLOVE_TYPES)[number]["value"] | "")}
          >
            <option value="" className="bg-neutral-900">
              Select type
            </option>
            {GLOVE_TYPES.map((o) => (
              <option key={o.value} value={o.value} className="bg-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="qb-material" className="text-sm font-medium text-white/90">
              Material
            </label>
            <select
              id="qb-material"
              className={inputClass}
              value={material}
              onChange={(e) => setMaterial(e.target.value as (typeof MATERIALS)[number]["value"] | "")}
            >
              <option value="" className="bg-neutral-900">
                Select material
              </option>
              {MATERIALS.map((o) => (
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
              onChange={(e) => setSize(e.target.value as (typeof SIZES)[number]["value"] | "")}
            >
              <option value="" className="bg-neutral-900">
                Select size
              </option>
              {SIZES.map((o) => (
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
          <select
            id="qb-volume"
            className={inputClass}
            value={volume}
            onChange={(e) => setVolume(e.target.value as (typeof VOLUMES)[number]["value"] | "")}
          >
            <option value="" className="bg-neutral-900">
              Select volume
            </option>
            {VOLUMES.map((o) => (
              <option key={o.value} value={o.value} className="bg-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full bg-[hsl(var(--primary))] text-white hover:opacity-90 text-base min-h-12"
        >
          Get bulk pricing
        </Button>
      </form>
    </div>
  );
}
