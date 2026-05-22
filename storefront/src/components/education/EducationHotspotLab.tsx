"use client";

import * as React from "react";
import type { DecodeHotspot } from "@/config/gloveScienceHub";
import { cn } from "@/lib/utils";

function GloveSilhouettePanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] shadow-[0_20px_50px_rgb(0_0_0/0.12)]",
        className
      )}
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#0a0a0a] to-[#141414]" />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
      <div className="absolute left-1/2 top-1/2 h-[58%] w-[72%] -translate-x-1/2 -translate-y-[42%]">
        <div className="absolute inset-x-[18%] bottom-0 top-[22%] rounded-t-[3.5rem] rounded-b-2xl border border-white/15 bg-gradient-to-b from-[#1f1f1f] to-[#0d0d0d]" />
        <div className="absolute left-[22%] right-[22%] top-[8%] h-[18%] rounded-t-[2rem] border border-x border-t border-white/10 bg-[#121212]" />
        <div className="absolute left-[28%] right-[28%] top-[24%] h-[3px] rounded-full bg-white/20" />
      </div>
    </div>
  );
}

function HotspotDetailCard({ hotspot }: { hotspot: DecodeHotspot }) {
  return (
    <article
      className="rounded-2xl border border-[#ebebea] bg-white p-6 shadow-[0_8px_30px_rgb(0_0_0/0.04)] sm:p-8"
      aria-labelledby={`decode-detail-${hotspot.id}`}
    >
      <h3 id={`decode-detail-${hotspot.id}`} className="text-xl font-bold tracking-tight text-[#0a0a0a] sm:text-2xl">
        {hotspot.title}
      </h3>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">{hotspot.description}</p>
      <dl className="mt-6 space-y-4 border-t border-[#ebebea] pt-6">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
            Matters when
          </dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-neutral-700">{hotspot.mattersWhen}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">Common mistake</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-neutral-600">{hotspot.commonMistake}</dd>
        </div>
      </dl>
    </article>
  );
}

type EducationHotspotLabProps = {
  hotspots: DecodeHotspot[];
  defaultHotspotId: string;
};

/** lg breakpoint — desktop hotspot buttons vs mobile tab chips. */
function useIsLgDesktop() {
  const [isLg, setIsLg] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLg(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isLg;
}

export function EducationHotspotLab({ hotspots, defaultHotspotId }: EducationHotspotLabProps) {
  const [selectedId, setSelectedId] = React.useState(defaultHotspotId);
  const isLgDesktop = useIsLgDesktop();
  const selected = hotspots.find((h) => h.id === selectedId) ?? hotspots[0]!;
  const activeTabLabelId = isLgDesktop
    ? `decode-desktop-tab-${selected.id}`
    : `decode-mobile-tab-${selected.id}`;

  const positionStyle = (pos: DecodeHotspot["desktopPosition"]): React.CSSProperties => ({
    top: pos.top,
    left: pos.left,
    right: pos.right,
    bottom: pos.bottom,
  });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
      <div className="min-w-0">
        <div className="relative mx-auto max-w-sm lg:max-w-none">
          <GloveSilhouettePanel />
          <div
            className="absolute inset-0 hidden lg:block"
            role="group"
            aria-label="Glove spec hotspots"
          >
            {hotspots.map((hotspot) => {
              const isActive = hotspot.id === selectedId;
              const pos = hotspot.desktopPosition;
              const anchorRight = Boolean(pos.right);
              return (
                <button
                  key={hotspot.id}
                  id={`decode-desktop-tab-${hotspot.id}`}
                  type="button"
                  aria-controls={`decode-panel-${hotspot.id}`}
                  className={cn(
                    "absolute z-[2] min-h-9 min-w-[2.75rem] rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-orange)] motion-reduce:transition-none",
                    anchorRight ? "-translate-y-1/2" : "-translate-x-1/2 -translate-y-1/2",
                    isActive
                      ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)] text-white shadow-[0_0_0_3px_rgb(255_106_0/0.25)]"
                      : "border-white/20 bg-[#111]/90 text-white/75 hover:border-white/35 hover:text-white"
                  )}
                  style={positionStyle(pos)}
                  aria-pressed={isActive}
                  aria-label={`${hotspot.label} spec`}
                  onClick={() => setSelectedId(hotspot.id)}
                >
                  {hotspot.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
          role="tablist"
          aria-label="Glove spec topics"
        >
          {hotspots.map((hotspot) => {
            const isActive = hotspot.id === selectedId;
            return (
              <button
                key={hotspot.id}
                type="button"
                role="tab"
                id={`decode-mobile-tab-${hotspot.id}`}
                aria-selected={isActive}
                aria-controls={`decode-panel-${hotspot.id}`}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-orange)] motion-reduce:transition-none",
                  isActive
                    ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)] text-white"
                    : "border-[#ebebea] bg-white text-neutral-700 hover:border-[var(--color-accent-orange)]/40"
                )}
                onClick={() => setSelectedId(hotspot.id)}
              >
                {hotspot.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`decode-panel-${selected.id}`}
        aria-labelledby={activeTabLabelId}
        aria-live="polite"
        className="min-w-0 lg:sticky lg:top-24"
      >
        <HotspotDetailCard hotspot={selected} />
      </div>
    </div>
  );
}
