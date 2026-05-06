"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
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
  { value: "cases_6_10", label: "6–10 cases / mo" },
  { value: "cases_11_25", label: "11–25 cases / mo" },
  { value: "cases_26_50", label: "26–50 cases / mo" },
  { value: "cases_51_100", label: "51–100 cases / mo" },
  { value: "cases_100_plus", label: "100+ cases / mo" },
] as const;

const fieldShell =
  "flex min-h-12 w-full rounded-xl border border-white/[0.14] bg-[#0f1218]/80 px-3.5 py-2.5 text-base text-white placeholder:text-white/45 shadow-inner shadow-black/20 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]/50 focus-visible:border-[#FF7A00]/40";

function buildRequestPricingParams(args: {
  industry: IndustryKey | "";
  gloveType: (typeof GLOVE_TYPES)[number]["value"] | "";
  material: (typeof MATERIALS)[number]["value"] | "";
  size: (typeof SIZES)[number]["value"] | "";
  volume: (typeof VOLUMES)[number]["value"] | "";
  buying: string;
  requirements: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (args.industry) params.set("industry", args.industry);
  if (args.gloveType) params.set("type", args.gloveType);
  if (args.material) params.set("material", args.material);
  if (args.size) params.set("size", args.size);
  if (args.volume) params.set("volume", args.volume);
  if (args.volume === "cases_100_plus") params.set("case_range", "100_plus");
  const buy = args.buying.trim();
  if (buy) params.set("buying", buy);
  const req = args.requirements.trim();
  if (req) params.set("requirements", req);
  params.set("source", "homepage_bulk_builder");
  return params;
}

export function QuickBulkBuilder() {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [industry, setIndustry] = React.useState<IndustryKey | "">("");
  const [buying, setBuying] = React.useState("");
  const [volume, setVolume] = React.useState<(typeof VOLUMES)[number]["value"] | "">("");
  const [gloveType, setGloveType] = React.useState<(typeof GLOVE_TYPES)[number]["value"] | "">("");
  const [material, setMaterial] = React.useState<(typeof MATERIALS)[number]["value"] | "">("");
  const [size, setSize] = React.useState<(typeof SIZES)[number]["value"] | "">("");
  const [requirements, setRequirements] = React.useState("");

  function routeWithParams(nextVolume?: (typeof VOLUMES)[number]["value"]) {
    const v = nextVolume ?? volume;
    const params = buildRequestPricingParams({
      industry,
      gloveType,
      material,
      size,
      volume: v,
      buying,
      requirements,
    });
    router.push(`/request-pricing?${params.toString()}`);
  }

  function onVolumePick(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as (typeof VOLUMES)[number]["value"] | "";
    setVolume(val);
    if (val === "cases_100_plus") {
      routeWithParams("cases_100_plus");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (volume === "cases_100_plus") {
      routeWithParams("cases_100_plus");
      return;
    }
    routeWithParams();
  }

  const canAdvance1 = industry !== "" && buying.trim().length >= 1;
  const canAdvance2 = volume !== "" && volume !== "cases_100_plus";

  return (
    <div
      id="bulk-order"
      className="scroll-mt-24"
      role="region"
      aria-labelledby="quick-bulk-title"
    >
      <div
        className={[
          "relative rounded-[28px] p-[1px]",
          "shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,122,0,0.22),0_0_80px_rgba(255,122,0,0.14)]",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-[28px] before:bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,122,0,0.22),transparent_55%)]",
          "after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[27px] after:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        ].join(" ")}
      >
        <div
          className={[
            "relative overflow-hidden rounded-[27px]",
            "border border-white/[0.08]",
            "bg-gradient-to-br from-[#1c212b]/95 via-[#151922]/96 to-[#0e1118]/98",
            "backdrop-blur-xl",
            "px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6",
          ].join(" ")}
        >
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,122,0,0.12)_0%,transparent_70%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,122,0,0.06)_0%,transparent_70%)]"
            aria-hidden
          />

          <div className="relative z-[1]">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#ffb36a]/90">
              <Sparkles className="h-3.5 w-3.5 text-[#FF7A00]" aria-hidden />
              Commercial procurement
            </div>
            <h2 id="quick-bulk-title" className="mb-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">
              Tell us what you need
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-white/70">
              No cart checkout for bulk—this is how operators request distributor-level pricing. Most replies within one
              business day.
            </p>

            <div className="mb-5 flex gap-1.5" aria-hidden>
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={[
                    "h-1 flex-1 rounded-full transition-colors",
                    step >= s ? "bg-[#FF7A00]" : "bg-white/15",
                    step === s ? "ring-1 ring-[#FF7A00]/40" : "",
                  ].join(" ")}
                />
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {step === 1 ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="qb-industry" className="text-sm font-semibold text-white/90">
                      What industry are you buying for?
                    </label>
                    <select
                      id="qb-industry"
                      className={fieldShell}
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value as IndustryKey | "")}
                    >
                      <option value="" className="bg-[#111318]">
                        Select industry
                      </option>
                      {INDUSTRY_KEYS.map((key) => (
                        <option key={key} value={key} className="bg-[#111318]">
                          {INDUSTRIES[key].name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="qb-buying" className="text-sm font-semibold text-white/90">
                      What are you buying today?
                    </label>
                    <input
                      id="qb-buying"
                      type="text"
                      autoComplete="off"
                      placeholder="e.g. Nitrile exam gloves, black industrial 6 mil…"
                      className={fieldShell}
                      value={buying}
                      onChange={(e) => setBuying(e.target.value)}
                    />
                    <p className="text-xs text-white/45">Plain language is fine—we translate it into specs with you.</p>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    disabled={!canAdvance1}
                    className="min-h-12 w-full bg-[#FF7A00] text-base font-bold text-white shadow-[0_12px_36px_rgba(255,122,0,0.35)] hover:bg-[#e56e00] disabled:opacity-40"
                    onClick={() => setStep(2)}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="qb-volume" className="text-sm font-semibold text-white/90">
                      About how much do you use monthly?
                    </label>
                    <select id="qb-volume" className={fieldShell} value={volume} onChange={onVolumePick}>
                      <option value="" className="bg-[#111318]">
                        Select volume
                      </option>
                      {VOLUMES.map((o) => (
                        <option key={o.value} value={o.value} className="bg-[#111318]">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => setStep(1)}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      disabled={!canAdvance2}
                      className="min-h-12 flex-1 bg-[#FF7A00] text-base font-bold text-white shadow-[0_12px_36px_rgba(255,122,0,0.35)] hover:bg-[#e56e00] disabled:opacity-40 sm:max-w-[240px]"
                      onClick={() => setStep(3)}
                    >
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="qb-req" className="text-sm font-semibold text-white/90">
                      Need specific requirements? <span className="font-normal text-white/45">(optional)</span>
                    </label>
                    <textarea
                      id="qb-req"
                      rows={3}
                      placeholder="e.g. Medical / food contact, black, 5–6 mil, powder-free, chemo rated…"
                      className={`${fieldShell} min-h-[96px] resize-y py-3`}
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label htmlFor="qb-type" className="text-xs font-semibold text-white/75">
                        Glove type
                      </label>
                      <select
                        id="qb-type"
                        className={`${fieldShell} min-h-11 text-sm`}
                        value={gloveType}
                        onChange={(e) => setGloveType(e.target.value as (typeof GLOVE_TYPES)[number]["value"] | "")}
                      >
                        <option value="" className="bg-[#111318]">
                          Optional
                        </option>
                        {GLOVE_TYPES.map((o) => (
                          <option key={o.value} value={o.value} className="bg-[#111318]">
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="qb-material" className="text-xs font-semibold text-white/75">
                        Material
                      </label>
                      <select
                        id="qb-material"
                        className={`${fieldShell} min-h-11 text-sm`}
                        value={material}
                        onChange={(e) => setMaterial(e.target.value as (typeof MATERIALS)[number]["value"] | "")}
                      >
                        <option value="" className="bg-[#111318]">
                          Optional
                        </option>
                        {MATERIALS.map((o) => (
                          <option key={o.value} value={o.value} className="bg-[#111318]">
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="qb-size" className="text-xs font-semibold text-white/75">
                        Size
                      </label>
                      <select
                        id="qb-size"
                        className={`${fieldShell} min-h-11 text-sm`}
                        value={size}
                        onChange={(e) => setSize(e.target.value as (typeof SIZES)[number]["value"] | "")}
                      >
                        <option value="" className="bg-[#111318]">
                          Optional
                        </option>
                        {SIZES.map((o) => (
                          <option key={o.value} value={o.value} className="bg-[#111318]">
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-white/70 hover:bg-white/10 hover:text-white"
                      onClick={() => setStep(2)}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      type="submit"
                      size="lg"
                      className="min-h-12 w-full bg-[#FF7A00] text-base font-bold text-white shadow-[0_14px_40px_rgba(255,122,0,0.38)] hover:bg-[#e56e00] sm:w-auto sm:min-w-[220px]"
                    >
                      Get distributor pricing
                    </Button>
                  </div>
                </>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
