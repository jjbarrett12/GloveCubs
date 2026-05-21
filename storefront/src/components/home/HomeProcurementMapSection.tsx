"use client";

import * as React from "react";
import Link from "next/link";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Factory,
  Flame,
  HeartPulse,
  Minus,
  Plus,
  Sparkles,
  Truck,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import {
  HomeEducationalBadge,
  HomePanelDark,
  HomeSectionIntro,
} from "@/components/home/authority/HomeAuthorityPrimitives";
import {
  GLOVE_USAGE_DISCLAIMER,
  GLOVE_USAGE_INDEX_LABEL,
  GLOVE_USAGE_METHODOLOGY,
  NATIONAL_USAGE_INDEX,
  STATE_NAME_TO_ABBR,
  getStateByAbbr,
  getStateByName,
  usageIndexToFill,
  type GloveStateUsage,
} from "@/config/gloveUsageByState";
import { US_STATES_TOPOLOGY } from "@/config/us-states-topology";

const DEFAULT_STATE = getStateByAbbr("TX")!;

function factorIcon(label: string): LucideIcon {
  if (/health|clinical|hospital/i.test(label)) return HeartPulse;
  if (/food|hospitality|beverage|protein|dairy|seafood/i.test(label)) return UtensilsCrossed;
  if (/energy|petro|refin|mining|chemical/i.test(label)) return Flame;
  if (/logistics|port|distribution|transport/i.test(label)) return Truck;
  if (/manufactur|automotive|industrial|aerospace|assembly/i.test(label)) return Factory;
  if (/tech|research|biotech|lab|federal/i.test(label)) return Sparkles;
  return Building2;
}

function formatVsNational(pct: number): string {
  if (pct === 0) return "At national average";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs national average`;
}

type UsStateGeo = {
  rsmKey: string;
  properties: { name?: string };
};

export function HomeProcurementMapSection() {
  const [selectedAbbr, setSelectedAbbr] = React.useState(DEFAULT_STATE.abbreviation);
  const [hoveredAbbr, setHoveredAbbr] = React.useState<string | null>(null);
  const [showMethodology, setShowMethodology] = React.useState(false);

  const displayAbbr = hoveredAbbr ?? selectedAbbr;
  const selected = getStateByAbbr(selectedAbbr) ?? DEFAULT_STATE;
  const display = getStateByAbbr(displayAbbr) ?? selected;

  const handleGeoKeyDown = (e: React.KeyboardEvent, abbr: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedAbbr(abbr);
    }
  };

  return (
    <ProcurementSectionShell
      tone="base"
      borderTop={false}
      headingId="procurement-map-heading"
      ariaLabel="U.S. glove usage educational map"
      className="proc-section-dark home-authority-grid relative overflow-hidden !py-16 sm:!py-24"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,106,0,0.07)_0%,transparent_55%)]" />

      <HomeSectionIntro
        headingId="procurement-map-heading"
        eyebrow="National context"
        title="How glove usage varies across the U.S."
        description="Explore estimated glove demand by state, shaped by industry mix, regulations, and operating conditions."
        tone="dark"
        badge={<HomeEducationalBadge>Educational estimate only</HomeEducationalBadge>}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-stretch lg:gap-10">
        <HomePanelDark className="relative flex h-full flex-col p-4 sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_90%,rgba(255,106,0,0.08)_0%,transparent_55%)]" />

          <div className="relative mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">
              {GLOVE_USAGE_INDEX_LABEL}
            </p>
            <div
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5"
              aria-hidden
            >
              <span className="text-[10px] text-white/40">Lower</span>
              <div
                className="h-2 w-24 rounded-full"
                style={{
                  background: "linear-gradient(90deg, #F3E4CC 0%, #FF6A00 100%)",
                }}
              />
              <span className="text-[10px] text-white/40">Higher</span>
            </div>
          </div>

          <div className="relative min-h-[300px] w-full flex-1 lg:min-h-0">
            <ComposableMap
              projection="geoAlbersUsa"
              projectionConfig={{ scale: 1050 }}
              width={900}
              height={530}
              preserveAspectRatio="xMidYMid meet"
              className="h-full w-full max-h-full"
            >
              <Geographies geography={US_STATES_TOPOLOGY}>
                {({ geographies }) =>
                  (geographies as UsStateGeo[]).map((geo) => {
                    const name = geo.properties?.name ?? "";
                    const abbr = STATE_NAME_TO_ABBR[name];
                    const state = getStateByName(name);
                    if (!abbr || !state) {
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="rgb(255 255 255 / 0.04)"
                          stroke="rgb(255 255 255 / 0.08)"
                          strokeWidth={0.4}
                          tabIndex={-1}
                          aria-label={`${name}, not included in educational state estimates`}
                          style={{
                            default: { outline: "none", pointerEvents: "none" },
                            hover: { outline: "none", pointerEvents: "none" },
                            pressed: { outline: "none", pointerEvents: "none" },
                          }}
                        />
                      );
                    }

                    const isSelected = selectedAbbr === abbr;
                    const isHovered = hoveredAbbr === abbr;
                    const isHighlighted = isSelected || isHovered;

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={usageIndexToFill(state.usageIndex)}
                        stroke={isHighlighted ? "#FF6A00" : "rgb(255 255 255 / 0.18)"}
                        strokeWidth={isHighlighted ? 1.4 : 0.55}
                        tabIndex={0}
                        role="button"
                        aria-label={`${state.name}, ${GLOVE_USAGE_INDEX_LABEL} ${state.usageIndex}`}
                        aria-pressed={isSelected}
                        onMouseEnter={() => setHoveredAbbr(abbr)}
                        onMouseLeave={() => setHoveredAbbr(null)}
                        onFocus={() => setHoveredAbbr(abbr)}
                        onBlur={() => setHoveredAbbr(null)}
                        onClick={() => setSelectedAbbr(abbr)}
                        onKeyDown={(e: React.KeyboardEvent) => handleGeoKeyDown(e, abbr)}
                        style={{
                          default: { outline: "none", transition: "stroke-width 150ms, stroke 150ms" },
                          hover: { outline: "none", cursor: "pointer", fill: usageIndexToFill(state.usageIndex) },
                          pressed: { outline: "none" },
                        }}
                        className="focus-visible:[stroke:#FF6A00] focus-visible:[stroke-width:2px]"
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>

            <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-black/70 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center text-white/50"
              aria-hidden
              tabIndex={-1}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="h-px bg-white/10" />
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center text-white/50"
              aria-hidden
              tabIndex={-1}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            </div>
          </div>

          <p className="relative mt-3 shrink-0 text-[11px] leading-relaxed text-white/38">{GLOVE_USAGE_DISCLAIMER}</p>
        </HomePanelDark>

        <StateDetailPanel
          state={display}
          isPreview={hoveredAbbr !== null && hoveredAbbr !== selectedAbbr}
          showMethodology={showMethodology}
          onToggleMethodology={() => setShowMethodology((v) => !v)}
        />
      </div>
    </ProcurementSectionShell>
  );
}

type StateDetailPanelProps = {
  state: GloveStateUsage;
  isPreview: boolean;
  showMethodology: boolean;
  onToggleMethodology: () => void;
};

function StateDetailPanel({ state, isPreview, showMethodology, onToggleMethodology }: StateDetailPanelProps) {
  return (
    <HomePanelDark className="flex h-full flex-col p-6 sm:p-8">
      {isPreview ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">Preview</p>
      ) : null}

      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">
        {state.region}
      </p>
      <h3 className="mb-2 text-2xl font-black tracking-tight text-white sm:text-[1.65rem]">{state.name}</h3>
      <p className="mb-6 text-[15px] leading-relaxed text-white/68">{state.shortInsight}</p>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 bg-black/30 p-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
            {GLOVE_USAGE_INDEX_LABEL}
          </p>
          <p className="text-3xl font-black tabular-nums text-white">{state.usageIndex}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">National context</p>
          <p className="text-lg font-bold text-[var(--color-accent-orange)]">
            {formatVsNational(state.vsNationalAverage)}
          </p>
          <p className="mt-0.5 text-xs text-white/40">U.S. midpoint ≈ {NATIONAL_USAGE_INDEX}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/40">Top driving factors</p>
        <ul className="m-0 flex flex-col gap-2.5 p-0">
          {state.topFactors.map((factor) => {
            const Icon = factorIcon(factor);
            return (
              <li key={factor} className="flex items-start gap-2.5 text-sm text-white/72">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
                {factor}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/40">Common glove types</p>
        <div className="flex flex-wrap gap-2">
          {state.gloveTypes.map((type) => (
            <span
              key={type}
              className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/75"
            >
              {type}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-white/10 pt-5">
        <button
          type="button"
          onClick={onToggleMethodology}
          className="flex w-full items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white/80 transition hover:border-[var(--color-accent-orange)]/30 hover:text-white"
          aria-expanded={showMethodology}
        >
          View methodology
          {showMethodology ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-white/45" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-white/45" aria-hidden />
          )}
        </button>
        {showMethodology ? (
          <ul className="mt-3 flex flex-col gap-2 pl-4 text-sm leading-relaxed text-white/55">
            {GLOVE_USAGE_METHODOLOGY.map((line) => (
              <li key={line} className="list-disc">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          href="/resources"
          className="mt-3 inline-block text-xs font-medium text-[var(--color-accent-orange)] hover:underline"
        >
          More educational resources →
        </Link>
      </div>
    </HomePanelDark>
  );
}
