"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import {
  HomeBridge,
  HomePanelDark,
  HomePanelLight,
  HomeSectionIntro,
} from "@/components/home/authority/HomeAuthorityPrimitives";
import { deriveGloveEducationGuidance, type GloveEducationCriteria } from "@/config/homeAuthority";
import { cn } from "@/lib/utils";

const INDUSTRY_OPTIONS = [
  { value: "food-service", label: "Food service" },
  { value: "healthcare", label: "Healthcare" },
  { value: "janitorial", label: "Janitorial" },
  { value: "industrial", label: "Industrial" },
  { value: "automotive", label: "Automotive" },
  { value: "general", label: "General / multi-use" },
] as const;

type ToggleKey = keyof Pick<
  GloveEducationCriteria,
  "foodSafe" | "chemicalExposure" | "latexFree" | "powderFree" | "heavyDuty" | "texturedGrip"
>;

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: "foodSafe", label: "Food-safe" },
  { key: "chemicalExposure", label: "Chemical exposure" },
  { key: "latexFree", label: "Latex-free" },
  { key: "powderFree", label: "Powder-free" },
  { key: "heavyDuty", label: "Heavy-duty" },
  { key: "texturedGrip", label: "Textured grip" },
];

const defaultCriteria: GloveEducationCriteria = {
  industry: "food-service",
  foodSafe: false,
  chemicalExposure: false,
  thickness: "standard",
  dexterity: "standard",
  latexFree: true,
  powderFree: true,
  heavyDuty: false,
  texturedGrip: false,
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("home-chip", active ? "home-chip-active" : "home-chip-inactive")}
    >
      {children}
    </button>
  );
}

function HomeGloveEducationHubSection() {
  const [criteria, setCriteria] = React.useState<GloveEducationCriteria>(defaultCriteria);
  const result = React.useMemo(() => deriveGloveEducationGuidance(criteria), [criteria]);
  const activeCount = TOGGLES.filter((t) => criteria[t.key]).length;

  function setToggle(key: ToggleKey) {
    setCriteria((c) => ({ ...c, [key]: !c[key] }));
  }

  return (
    <ProcurementSectionShell
      tone="light-alt"
      headingId="education-hub-heading"
      ariaLabel="Interactive glove education"
      className="bg-[var(--color-industrial-gray)] !py-16 sm:!py-20"
    >
      <HomeSectionIntro
        headingId="education-hub-heading"
        eyebrow="Glove intelligence"
        title="Find the right glove class—before you pick a SKU"
        description="Configure your operating context. Rule-based educational guidance updates as inputs change—not live AI or automated SKU picks."
        tone="light"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <HomePanelLight className="p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-2 border-b border-[#ebebea] pb-4">
            <SlidersHorizontal className="h-4 w-4 text-[var(--color-accent-orange)]" aria-hidden />
            <span className="text-sm font-bold text-ink">Program inputs</span>
          </div>

          <div className="mb-6">
            <label htmlFor="edu-industry" className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">
              Industry
            </label>
            <select
              id="edu-industry"
              className="w-full rounded-xl border border-[#d8d8d5] bg-[#fafaf8] px-4 py-3.5 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-orange)]/35"
              value={criteria.industry}
              onChange={(e) => setCriteria((c) => ({ ...c, industry: e.target.value }))}
            >
              {INDUSTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">Thickness</span>
            <div className="home-segment w-full sm:w-auto">
              {(["light", "standard", "heavy"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cn(
                    "home-segment-btn flex-1 sm:flex-none",
                    criteria.thickness === t && "home-segment-btn-active"
                  )}
                  onClick={() => setCriteria((c) => ({ ...c, thickness: t }))}
                >
                  {t === "light" ? "Light" : t === "heavy" ? "Heavy" : "Standard"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">Dexterity</span>
            <div className="home-segment w-full sm:w-auto">
              <button
                type="button"
                className={cn("home-segment-btn flex-1", criteria.dexterity === "standard" && "home-segment-btn-active")}
                onClick={() => setCriteria((c) => ({ ...c, dexterity: "standard" }))}
              >
                Standard
              </button>
              <button
                type="button"
                className={cn("home-segment-btn flex-1", criteria.dexterity === "high" && "home-segment-btn-active")}
                onClick={() => setCriteria((c) => ({ ...c, dexterity: "high" }))}
              >
                High
              </button>
            </div>
          </div>

          <div>
            <span className="mb-3 block text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">
              Requirements · {activeCount} active
            </span>
            <div className="flex flex-wrap gap-2">
              {TOGGLES.map(({ key, label }) => (
                <Chip key={key} active={criteria[key]} onClick={() => setToggle(key)}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        </HomePanelLight>

        <HomePanelDark className="flex flex-col p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">
              Output
            </span>
            <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[10px] text-white/45">
              Educational guidance
            </span>
          </div>

          <h3 className="mb-6 text-xl font-bold leading-snug text-white sm:text-2xl">{result.headline}</h3>

          <div className="mb-6">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/45">Material direction</p>
            <ul className="space-y-2">
              {result.materials.map((m) => (
                <li key={m} className="flex items-start gap-2 text-[15px] text-white/88">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent-orange)]" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          </div>

          <div className="mb-6 flex-1">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/45">Operational notes</p>
            <ul className="space-y-3">
              {result.guidance.map((g) => (
                <li key={g} className="border-l border-[var(--color-accent-orange)]/50 pl-4 text-sm leading-relaxed text-white/72">
                  {g}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] leading-relaxed text-white/38">{result.procurementNote}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/glove-finder"
              className="home-cta-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold sm:w-auto"
            >
              Open glove finder
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/request-pricing"
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-white/85 transition hover:border-[var(--color-accent-orange)]/40 sm:w-auto"
            >
              Request pricing
            </Link>
          </div>
        </HomePanelDark>
      </div>
    </ProcurementSectionShell>
  );
}

export function HomeGloveEducationHubWithBridge() {
  return (
    <>
      <HomeGloveEducationHubSection />
      <HomeBridge variant="gray-to-dark" />
    </>
  );
}
