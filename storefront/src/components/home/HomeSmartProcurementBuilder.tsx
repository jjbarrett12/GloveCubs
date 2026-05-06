"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";
import {
  HOME_BULK_GLOVE_TYPES,
  HOME_BULK_MATERIALS,
  HOME_BULK_SIZES,
  HOME_BULK_VOLUMES,
} from "@/components/home/QuickBulkBuilder";

const inputClass =
  "flex min-h-11 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]/35 focus-visible:border-white/25";

function buildSmartProcurementParams(args: {
  industry: IndustryKey | "";
  gloveType: (typeof HOME_BULK_GLOVE_TYPES)[number]["value"] | "";
  material: (typeof HOME_BULK_MATERIALS)[number]["value"] | "";
  size: (typeof HOME_BULK_SIZES)[number]["value"] | "";
  volume: (typeof HOME_BULK_VOLUMES)[number]["value"] | "";
  supplier: string;
  useCase: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (args.industry) params.set("industry", args.industry);
  if (args.gloveType) params.set("type", args.gloveType);
  if (args.material) params.set("material", args.material);
  if (args.size) params.set("size", args.size);
  if (args.volume) params.set("volume", args.volume);
  if (args.volume === "cases_100_plus") params.set("case_range", "100_plus");
  params.set("source", "homepage_smart_procurement");
  const noteParts: string[] = [];
  const s = args.supplier.trim();
  const u = args.useCase.trim();
  if (s) noteParts.push(`Current supplier: ${s}`);
  if (u) noteParts.push(`Use case: ${u}`);
  if (noteParts.length) params.set("product", noteParts.join("\n"));
  return params;
}

function storeSearchFromSelections(
  gloveType: (typeof HOME_BULK_GLOVE_TYPES)[number]["value"] | "",
  material: (typeof HOME_BULK_MATERIALS)[number]["value"] | "",
): string {
  const bits: string[] = [];
  if (material) {
    const m = HOME_BULK_MATERIALS.find((o) => o.value === material)?.label;
    if (m) bits.push(m.toLowerCase());
  }
  if (gloveType && gloveType !== "unsure") {
    const t = HOME_BULK_GLOVE_TYPES.find((o) => o.value === gloveType)?.label;
    if (t) bits.push(t.replace(/\s*\/\s*/g, " ").toLowerCase());
  }
  return bits.join(" ").trim();
}

export function HomeSmartProcurementBuilder() {
  const router = useRouter();
  const [industry, setIndustry] = React.useState<IndustryKey | "">("");
  const [gloveType, setGloveType] = React.useState<(typeof HOME_BULK_GLOVE_TYPES)[number]["value"] | "">("");
  const [material, setMaterial] = React.useState<(typeof HOME_BULK_MATERIALS)[number]["value"] | "">("");
  const [size, setSize] = React.useState<(typeof HOME_BULK_SIZES)[number]["value"] | "">("");
  const [volume, setVolume] = React.useState<(typeof HOME_BULK_VOLUMES)[number]["value"] | "">("");
  const [supplier, setSupplier] = React.useState("");
  const [useCase, setUseCase] = React.useState("");

  function routePricing(nextVolume: (typeof HOME_BULK_VOLUMES)[number]["value"] | "") {
    const params = buildSmartProcurementParams({
      industry,
      gloveType,
      material,
      size,
      volume: nextVolume,
      supplier,
      useCase,
    });
    router.push(`/request-pricing?${params.toString()}`);
  }

  function onVolumeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as (typeof HOME_BULK_VOLUMES)[number]["value"] | "";
    setVolume(val);
    if (val === "cases_100_plus") routePricing("cases_100_plus");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (volume === "cases_100_plus") {
      routePricing("cases_100_plus");
      return;
    }
    routePricing(volume);
  }

  function onFindInStore() {
    const q = storeSearchFromSelections(gloveType, material);
    if (q) router.push(`/store?q=${encodeURIComponent(q)}`);
    else router.push("/store");
  }

  return (
    <div
      id="procurement-builder"
      className="relative scroll-mt-24 rounded-2xl border border-white/10 bg-[#0a0a0a] p-5 shadow-[0_0_0_1px_rgba(255,122,0,0.12),0_20px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,122,0,0.14),transparent_55%)]"
        aria-hidden
      />
      <div className="relative z-[1]">
        <h2 className="text-lg font-semibold tracking-tight text-white">Build your bulk pricing request</h2>
        <p className="mt-1.5 text-sm leading-snug text-white/65">
          Tell us what you buy and we&apos;ll help scope pricing, alternatives and fulfillment options.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3.5">
          <div className="space-y-1">
            <label htmlFor="spb-industry" className="text-xs font-semibold uppercase tracking-wide text-white/55">
              Industry
            </label>
            <select
              id="spb-industry"
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

          <div className="space-y-1">
            <label htmlFor="spb-volume" className="text-xs font-semibold uppercase tracking-wide text-white/55">
              Cases / month
            </label>
            <select id="spb-volume" className={inputClass} value={volume} onChange={onVolumeChange}>
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

          <div className="space-y-1">
            <label htmlFor="spb-type" className="text-xs font-semibold uppercase tracking-wide text-white/55">
              Glove type
            </label>
            <select
              id="spb-type"
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

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="spb-material" className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Material
              </label>
              <select
                id="spb-material"
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
            <div className="space-y-1">
              <label htmlFor="spb-size" className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Size
              </label>
              <select
                id="spb-size"
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

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="spb-supplier" className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Current supplier <span className="font-normal normal-case text-white/40">(optional)</span>
              </label>
              <input
                id="spb-supplier"
                className={inputClass}
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. broadline distributor"
                maxLength={200}
                autoComplete="organization"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="spb-usecase" className="text-xs font-semibold uppercase tracking-wide text-white/55">
                Use case <span className="font-normal normal-case text-white/40">(optional)</span>
              </label>
              <input
                id="spb-usecase"
                className={inputClass}
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                placeholder="e.g. dishwashing, patient care"
                maxLength={200}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            <Button
              type="submit"
              size="lg"
              className="min-h-11 w-full bg-[#FF7A00] text-sm font-semibold text-white hover:bg-[#e56e00]"
            >
              Start Pricing Request
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onFindInStore}
              className="min-h-11 w-full border-white/20 bg-transparent text-sm font-semibold text-white hover:bg-white/[0.06]"
            >
              Find Matching Gloves
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
