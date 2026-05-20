"use client";

import * as React from "react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HOME_PROCUREMENT_REGIONS } from "@/config/homeAuthority";
import {
  HomeEducationalBadge,
  HomePanelDark,
  HomeSectionIntro,
} from "@/components/home/authority/HomeAuthorityPrimitives";
import { cn } from "@/lib/utils";

const HQ = HOME_PROCUREMENT_REGIONS.find((r) => r.highlight) ?? HOME_PROCUREMENT_REGIONS[5];

export function HomeProcurementMapSection() {
  const [activeId, setActiveId] = React.useState<string>(HOME_PROCUREMENT_REGIONS[0].id);
  const active = HOME_PROCUREMENT_REGIONS.find((r) => r.id === activeId) ?? HOME_PROCUREMENT_REGIONS[0];

  return (
    <ProcurementSectionShell
      tone="base"
      borderTop={false}
      headingId="procurement-map-heading"
      ariaLabel="USA procurement context map"
      className="proc-section-dark home-authority-grid relative overflow-hidden !py-16 sm:!py-24"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,106,0,0.07)_0%,transparent_55%)]" />

      <HomeSectionIntro
        headingId="procurement-map-heading"
        eyebrow="National context"
        title="How glove procurement varies across the U.S."
        description="Regional operating environments shape glove programs—explore illustrative context by corridor."
        tone="dark"
        badge={<HomeEducationalBadge>Educational context only</HomeEducationalBadge>}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
        <div className="home-panel-dark relative min-h-[300px] overflow-hidden sm:min-h-[380px]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,rgba(255,106,0,0.06)_0%,transparent_60%)]" />
          <svg viewBox="0 0 100 65" className="relative h-full min-h-[300px] w-full sm:min-h-[380px]" role="img" aria-label="Illustrative United States regions">
            <defs>
              <filter id="region-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M8 30 L14 24 L24 19 L36 16 L48 14 L60 15 L72 19 L84 25 L92 34 L90 46 L84 52 L72 56 L58 58 L44 58 L30 55 L18 48 L10 38 Z"
              fill="rgb(255 255 255 / 0.03)"
              stroke="rgb(255 255 255 / 0.1)"
              strokeWidth="0.6"
            />
            <line
              x1={HQ.x}
              y1={HQ.y}
              x2={active.x}
              y2={active.y}
              stroke="rgb(255 106 0 / 0.35)"
              strokeWidth="0.8"
              strokeDasharray="2 3"
            />
            {HOME_PROCUREMENT_REGIONS.map((r) => {
              const isActive = activeId === r.id;
              const isHq = r.highlight;
              return (
                <g key={r.id}>
                  {isActive && !isHq ? (
                    <circle cx={r.x} cy={r.y} r="5" fill="rgb(255 106 0 / 0.2)" filter="url(#region-glow)" />
                  ) : null}
                  <circle
                    cx={r.x}
                    cy={r.y}
                    r={isHq ? 3.5 : isActive ? 3 : 2.2}
                    className={cn(
                      "cursor-pointer transition-all duration-300 focus:outline-none focus-visible:stroke-[#ff6a00] focus-visible:stroke-[3px]",
                      isActive || isHq ? "fill-[#ff6a00]" : "fill-white/30 hover:fill-white/50"
                    )}
                    onClick={() => setActiveId(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActiveId(r.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${r.label} region`}
                  />
                </g>
              );
            })}
          </svg>
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-[var(--color-accent-orange)]" aria-hidden />
            <span className="text-xs font-medium text-white/70">Salt Lake City · HQ</span>
          </div>
        </div>

        <HomePanelDark className="flex flex-col p-6 sm:p-8">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">
            {active.label}
          </p>
          <h3 className="mb-4 text-xl font-bold leading-snug text-white sm:text-2xl">{active.summary}</h3>
          <p className="m-0 flex-1 text-[15px] leading-relaxed text-white/68">{active.detail}</p>

          <div className="mt-8 border-t border-white/10 pt-6" role="tablist" aria-label="Regions">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/40">Select region</p>
            <div className="flex flex-wrap gap-2">
              {HOME_PROCUREMENT_REGIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={activeId === r.id}
                  onClick={() => setActiveId(r.id)}
                  className={cn(
                    "rounded-md px-3 py-2 text-xs font-semibold transition",
                    activeId === r.id
                      ? "bg-[var(--color-accent-orange)]/20 text-white ring-1 ring-[var(--color-accent-orange)]/40"
                      : "text-white/50 hover:bg-white/[0.06] hover:text-white/85"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </HomePanelDark>
      </div>
    </ProcurementSectionShell>
  );
}
