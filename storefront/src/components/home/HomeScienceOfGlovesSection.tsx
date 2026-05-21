"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Beaker,
  Calculator,
  Check,
  ChevronDown,
  Factory,
  Hand,
  Info,
  Layers,
  Lock,
  RefreshCw,
  Ruler,
  Scale,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomeEducationalBadge } from "@/components/home/authority/HomeAuthorityPrimitives";
import { cn } from "@/lib/utils";
import {
  type LabMode,
  type PerfLevel,
  type DispMaterial,
  type DispThickness,
  type DispTexture,
  type DispCuff,
  type DispTask,
  type ReuseCategory,
  type DippedCoating,
  type KnitShell,
  type CutLevel,
  type ReuseTexture,
  type GripEnv,
  type ReuseTask,
  DISP_DEFAULT,
  REUSE_DEFAULT,
  DISP_MATERIALS,
  DISP_THICKNESS_GUIDE,
  DISP_TEXTURE_GUIDE,
  DISP_PERF,
  DISP_GLOVE_CLASSES_BY_MATERIAL,
  DISP_BOTTOM,
  REUSE_CATEGORIES,
  REUSE_CUT_GUIDE,
  REUSE_TEXTURE_GUIDE,
  REUSE_PERF,
  REUSE_BOTTOM,
  TRUST_CARDS,
  SCIENCE_DISCLAIMER,
  SCIENCE_PERF_FOOTNOTE,
  PERF_LEVEL_LABELS,
  deriveDisposableProfile,
  deriveReusableProfile,
  defaultGloveClassForMaterial,
} from "@/config/gloveScienceLab";

function ScienceEyebrow() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-3">
        <span className="h-px w-8 shrink-0 bg-[var(--color-accent-orange)]" aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent-orange)]">Category education</p>
      </div>
      <HomeEducationalBadge>Educational guidance only</HomeEducationalBadge>
    </div>
  );
}

function ColumnHeading({ step, title }: { step: 1 | 2 | 3; title: string }) {
  return (
    <p className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent-orange)]/20 text-[10px] text-[var(--color-accent-orange)]">
        {step}
      </span>
      {title}
    </p>
  );
}

function PerfBar({ label, level }: { label: string; level: PerfLevel }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-white/75">{label}</span>
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wide",
            level === 2 ? "text-[var(--color-accent-orange)]" : level === 1 ? "text-white/55" : "text-white/35"
          )}
        >
          {PERF_LEVEL_LABELS[level]}
        </span>
      </div>
      <div className="mb-1 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-white/30">
        <span>Low</span>
        <span>High</span>
      </div>
      <div className="flex h-2.5 gap-1" role="img" aria-label={`${label}: ${PERF_LEVEL_LABELS[level]}`}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-full flex-1 rounded-sm transition-colors duration-300",
              i <= level ? "bg-[var(--color-accent-orange)]" : "bg-white/10"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ProfileRow<T extends string>({
  icon: Icon,
  label,
  options,
  value,
  onChange,
  locked,
  lockedHint,
}: {
  icon: LucideIcon;
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  locked?: boolean;
  lockedHint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.id === value);

  if (locked) {
    return (
      <div className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
          <Lock className="h-4 w-4 text-white/30" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-white/40">{label}</span>
          <span className="block text-sm text-white/40">{lockedHint ?? "Select a material first"}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.06] py-3 last:border-0">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
          <Icon className="h-4 w-4 text-[var(--color-accent-orange)]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-white/40">{label}</span>
          <span className="block text-sm font-semibold text-white/90">{selected?.label ?? value}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/40 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              aria-pressed={value === opt.id}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition",
                value === opt.id
                  ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/85"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MaterialSubTabs<T extends string>({
  items,
  activeId,
  onSelect,
  ariaLabel,
}: {
  items: { id: T; label: string }[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          onClick={() => onSelect(item.id)}
          className={cn(
            "rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
            activeId === item.id
              ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/12 text-white"
              : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ThicknessHandRow({
  activeMil,
  materialLabel,
  onSelect,
}: {
  activeMil: DispThickness;
  materialLabel: string;
  onSelect: (mil: DispThickness) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 lg:col-span-1">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">
        Thickness comparison
      </p>
      <p className="mb-4 text-[10px] text-white/40">({materialLabel})</p>
      <div className="grid grid-cols-5 gap-2">
        {DISP_THICKNESS_GUIDE.map(({ mil, tagline, duty, highlight }) => {
          const active = activeMil === mil;
          return (
            <button
              key={mil}
              type="button"
              onClick={() => onSelect(mil)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center rounded-lg border p-2 text-center transition",
                active
                  ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/10"
                  : "border-white/10 hover:border-white/25"
              )}
            >
              <HandIcon mil={mil} active={active} />
              <span className={cn("mt-2 text-xs font-extrabold", active ? "text-[var(--color-accent-orange)]" : "text-white/70")}>
                {mil} mil
              </span>
              <span className="mt-0.5 text-[9px] font-semibold leading-tight text-white/50">{tagline}</span>
              <span className="mt-0.5 text-[8px] text-white/35">{duty}</span>
              {highlight ? (
                <span className="mt-1 rounded bg-[var(--color-accent-orange)]/20 px-1 py-0.5 text-[7px] font-bold uppercase text-[var(--color-accent-orange)]">
                  Popular
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HandIcon({ mil, active }: { mil: number; active: boolean }) {
  const stroke = mil <= 3 ? 1 : mil <= 5 ? 1.5 : mil <= 6 ? 2 : 2.5;
  return (
    <svg viewBox="0 0 24 32" className="h-10 w-8" aria-hidden>
      <path
        d="M10 4 C7 4 5 8 5 14 L4 24 C3 28 6 30 10 30 C13 29 15 26 15 22 L16 14 L17 8 C18 4 14 4 10 4 Z"
        fill="none"
        stroke={active ? "var(--color-accent-orange)" : "rgb(255 255 255 / 0.35)"}
        strokeWidth={stroke}
      />
    </svg>
  );
}

function PolymerGlanceCard({ activeId, onSelect }: { activeId: DispMaterial; onSelect: (id: DispMaterial) => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">Polymer at a glance</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
        {DISP_MATERIALS.map((mat) => {
          const active = activeId === mat.id;
          return (
            <button
              key={mat.id}
              type="button"
              onClick={() => onSelect(mat.id)}
              aria-pressed={active}
              className={cn(
                "rounded-lg border p-3 text-left transition",
                active ? "border-[var(--color-accent-orange)]/60 bg-[var(--color-accent-orange)]/[0.08]" : "border-white/10 hover:border-white/20"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: mat.color }} aria-hidden />
                <span className={cn("text-sm font-extrabold", active ? "text-white" : "text-white/70")}>{mat.label}</span>
              </div>
              <ul className="mt-2 space-y-0.5">
                {mat.traits.map((t) => (
                  <li key={t} className="text-[10px] leading-snug text-white/45">
                    {t}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextureGuideCard({
  items,
  activeId,
  onSelect,
}: {
  items: { id: string; label: string; detail: string }[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">Texture guide</p>
      <div className="space-y-2">
        {items.map((tex) => {
          const active = activeId === tex.id;
          return (
            <button
              key={tex.id}
              type="button"
              onClick={() => onSelect(tex.id)}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                active ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/10" : "border-white/10 hover:border-white/20"
              )}
            >
              <TextureSwatch id={tex.id} />
              <div>
                <p className="text-sm font-extrabold text-white/90">{tex.label}</p>
                <p className="text-[10px] text-white/45">{tex.detail}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextureSwatch({ id }: { id: string }) {
  const base = "h-10 w-10 shrink-0 rounded-md border border-white/15";
  if (id === "smooth" || id === "smooth-coat") {
    return <div className={cn(base, "bg-white/[0.08]")} aria-hidden />;
  }
  if (id === "fingertip" || id === "microfoam") {
    return (
      <div
        className={cn(base, "bg-white/[0.06]")}
        style={{
          backgroundImage: "radial-gradient(circle, rgb(255 255 255 / 0.25) 1px, transparent 1px)",
          backgroundSize: "4px 4px",
        }}
        aria-hidden
      />
    );
  }
  return (
    <div
      className={cn(base, "bg-white/[0.06]")}
      style={{
        backgroundImage:
          "linear-gradient(45deg, rgb(255 255 255 / 0.12) 25%, transparent 25%), linear-gradient(-45deg, rgb(255 255 255 / 0.12) 25%, transparent 25%)",
        backgroundSize: "6px 6px",
      }}
      aria-hidden
    />
  );
}

function CutLevelGuideCard({ activeLevel, onSelect }: { activeLevel: CutLevel; onSelect: (l: CutLevel) => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">Cut level comparison</p>
      <p className="mb-4 text-[10px] text-white/40">ANSI/ISEA 105 — directional grams</p>
      <div className="space-y-1.5">
        {REUSE_CUT_GUIDE.map(({ level, grams, taskFit }) => {
          const active = activeLevel === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onSelect(level)}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                active ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/10" : "border-white/10 hover:border-white/20"
              )}
            >
              <span
                className={cn(
                  "w-8 shrink-0 text-sm font-black",
                  active ? "text-[var(--color-accent-orange)]" : "text-white/55"
                )}
              >
                {level}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold text-white/50">{grams} cut force</span>
                <span className="block text-xs text-white/75">{taskFit}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReuseCategoryGlance({ activeId, onSelect }: { activeId: ReuseCategory; onSelect: (id: ReuseCategory) => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">Work glove types</p>
      <div className="space-y-2">
        {REUSE_CATEGORIES.map((cat) => {
          const active = activeId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              aria-pressed={active}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition",
                active ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/10" : "border-white/10 hover:border-white/20"
              )}
            >
              <p className="text-sm font-extrabold text-white/90">{cat.label}</p>
              <p className="mt-0.5 text-[10px] text-white/45">{cat.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const BOTTOM_ICONS = {
  thickness: Ruler,
  material: Beaker,
  cost: Calculator,
  cut: Shield,
  coating: Layers,
  durability: Scale,
} as const;

export function HomeScienceOfGlovesSection() {
  const [mode, setMode] = React.useState<LabMode>("disposable");
  const [disp, setDisp] = React.useState(DISP_DEFAULT);
  const [reuse, setReuse] = React.useState(REUSE_DEFAULT);

  const dispProfile = React.useMemo(() => deriveDisposableProfile(disp), [disp]);
  const reuseProfile = React.useMemo(() => deriveReusableProfile(reuse), [reuse]);
  const profile = mode === "disposable" ? dispProfile : reuseProfile;
  const perfKeys = mode === "disposable" ? DISP_PERF : REUSE_PERF;
  const bottomCards = mode === "disposable" ? DISP_BOTTOM : REUSE_BOTTOM;

  const setDispMaterial = (material: DispMaterial) => {
    setDisp((s) => ({
      ...s,
      material,
      gloveClass: defaultGloveClassForMaterial(material),
    }));
  };

  const reset = () => {
    if (mode === "disposable") setDisp(DISP_DEFAULT);
    else setReuse(REUSE_DEFAULT);
  };

  const materialLabel = DISP_MATERIALS.find((m) => m.id === disp.material)?.label ?? "Nitrile";

  return (
    <ProcurementSectionShell
      tone="base"
      headingId="science-gloves-heading"
      ariaLabel="The science behind the right glove"
      className="proc-section-dark !py-16 sm:!py-20"
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0a] px-6 py-10 shadow-[0_16px_48px_rgb(0_0_0/0.35)] sm:px-10 sm:py-12 lg:px-12 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,106,0,0.09)_0%,transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.02)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.02)_1px,transparent_1px)] bg-[length:24px_24px]" />

        <header className="relative mb-10 lg:mb-12">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
            <div>
              <ScienceEyebrow />
              <h2
                id="science-gloves-heading"
                className="text-[2rem] font-black leading-[1.02] tracking-tight text-white sm:text-[2.75rem] lg:text-[3.25rem]"
              >
                The science behind the right glove<span className="text-[var(--color-accent-orange)]">.</span>
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
                Compare materials, thicknesses, and designs to understand how gloves perform so you can standardize with
                confidence.
              </p>
            </div>
            <ul className="m-0 grid grid-cols-1 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-1 lg:gap-5">
              {TRUST_CARDS.map(({ title, body }, i) => {
                const Icon = [Sparkles, Scale, Shield][i]!;
                return (
                  <li key={title} className="flex list-none gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#FFF8F0]/10">
                      <Icon className="h-4 w-4 text-[var(--color-accent-orange)]" aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-white">{title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/50">{body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </header>

        <div
          className="relative mb-8 flex border-b border-white/10"
          role="tablist"
          aria-label="Glove type"
        >
          {(
            [
              { id: "disposable" as const, label: "Disposable gloves" },
              { id: "reusable" as const, label: "Reusable (work) gloves" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={cn(
                "flex-1 border-b-2 px-4 py-3.5 text-xs font-bold uppercase tracking-[0.12em] transition sm:flex-none sm:px-8 sm:text-sm",
                mode === tab.id
                  ? "border-[var(--color-accent-orange)] text-[var(--color-accent-orange)]"
                  : "border-transparent text-white/45 hover:text-white/70"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "disposable" ? (
          <MaterialSubTabs
            items={DISP_MATERIALS.map((m) => ({ id: m.id, label: m.label }))}
            activeId={disp.material}
            onSelect={setDispMaterial}
            ariaLabel="Disposable glove material"
          />
        ) : (
          <MaterialSubTabs
            items={REUSE_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
            activeId={reuse.category}
            onSelect={(id) => setReuse((s) => ({ ...s, category: id }))}
            ariaLabel="Reusable glove category"
          />
        )}

        <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6" aria-live="polite">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <div className="mb-1 flex items-center justify-between gap-3">
              <ColumnHeading step={1} title="Build your glove profile" />
              <button
                type="button"
                onClick={reset}
                className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-white/45 transition hover:text-white/75"
              >
                <RefreshCw className="h-3 w-3" aria-hidden />
                Reset to defaults
              </button>
            </div>

            {mode === "disposable" ? (
              <>
                <ProfileRow
                  icon={Hand}
                  label="Material"
                  options={DISP_MATERIALS.map((m) => ({ id: m.id, label: m.label }))}
                  value={disp.material}
                  onChange={setDispMaterial}
                />
                <ProfileRow
                  icon={Layers}
                  label="Thickness"
                  options={([3, 4, 5, 6, 8] as const).map((m) => ({ id: String(m), label: `${m} mil` }))}
                  value={String(disp.thickness)}
                  onChange={(id) => setDisp((s) => ({ ...s, thickness: Number(id) as DispThickness }))}
                />
                <ProfileRow
                  icon={Sparkles}
                  label="Texture"
                  options={DISP_TEXTURE_GUIDE.map((t) => ({ id: t.id, label: t.label }))}
                  value={disp.texture}
                  onChange={(id) => setDisp((s) => ({ ...s, texture: id }))}
                />
                <ProfileRow
                  icon={Shield}
                  label="Cuff"
                  options={[
                    { id: "standard" as DispCuff, label: "Standard" },
                    { id: "extended" as DispCuff, label: "Extended" },
                  ]}
                  value={disp.cuff}
                  onChange={(id) => setDisp((s) => ({ ...s, cuff: id }))}
                />
                <ProfileRow
                  icon={Factory}
                  label="Task / environment"
                  options={[
                    { id: "food-prep" as DispTask, label: "Food prep" },
                    { id: "cleaning" as DispTask, label: "Cleaning" },
                    { id: "assembly" as DispTask, label: "Assembly" },
                    { id: "chemical" as DispTask, label: "Chemical handling" },
                    { id: "exam" as DispTask, label: "Exam / patient care" },
                  ]}
                  value={disp.task}
                  onChange={(id) => setDisp((s) => ({ ...s, task: id }))}
                />
                <ProfileRow
                  icon={Shield}
                  label="Glove class"
                  options={DISP_GLOVE_CLASSES_BY_MATERIAL[disp.material].map((c) => ({ id: c.id, label: c.label }))}
                  value={disp.gloveClass}
                  onChange={(id) => setDisp((s) => ({ ...s, gloveClass: id }))}
                />
              </>
            ) : (
              <>
                {reuse.category === "dipped" ? (
                  <ProfileRow
                    icon={Layers}
                    label="Dip coating"
                    options={[
                      { id: "nitrile" as DippedCoating, label: "Nitrile" },
                      { id: "latex" as DippedCoating, label: "Latex" },
                      { id: "pu" as DippedCoating, label: "PU" },
                      { id: "pvc" as DippedCoating, label: "PVC" },
                      { id: "foam-nitrile" as DippedCoating, label: "Foam nitrile" },
                    ]}
                    value={reuse.dippedCoating}
                    onChange={(id) => setReuse((s) => ({ ...s, dippedCoating: id }))}
                  />
                ) : null}
                {reuse.category === "knit-cut" ? (
                  <ProfileRow
                    icon={Hand}
                    label="Shell material"
                    options={[
                      { id: "hppe" as KnitShell, label: "HPPE" },
                      { id: "nylon" as KnitShell, label: "Nylon" },
                      { id: "polyester" as KnitShell, label: "Polyester" },
                      { id: "aramid-blend" as KnitShell, label: "Aramid blend" },
                    ]}
                    value={reuse.knitShell}
                    onChange={(id) => setReuse((s) => ({ ...s, knitShell: id }))}
                  />
                ) : null}
                {reuse.category === "cotton" ? (
                  <ProfileRow
                    icon={Shield}
                    label="Cut level (ANSI)"
                    options={[]}
                    value={reuse.cutLevel}
                    onChange={() => {}}
                    locked
                    lockedHint="Cotton/canvas is typically un-rated — use knit/cut class for ANSI A1–A5"
                  />
                ) : (
                  <ProfileRow
                    icon={Shield}
                    label="Cut level (ANSI)"
                    options={REUSE_CUT_GUIDE.map((c) => ({ id: c.level, label: `${c.level} · ${c.grams}` }))}
                    value={reuse.cutLevel}
                    onChange={(id) => setReuse((s) => ({ ...s, cutLevel: id }))}
                  />
                )}
                <ProfileRow
                  icon={Sparkles}
                  label="Texture / finish"
                  options={REUSE_TEXTURE_GUIDE.map((t) => ({ id: t.id, label: t.label }))}
                  value={reuse.texture}
                  onChange={(id) => setReuse((s) => ({ ...s, texture: id }))}
                />
                <ProfileRow
                  icon={Factory}
                  label="Grip environment"
                  options={[
                    { id: "dry" as GripEnv, label: "Dry" },
                    { id: "wet" as GripEnv, label: "Wet" },
                    { id: "oil" as GripEnv, label: "Oil" },
                    { id: "abrasion" as GripEnv, label: "Abrasion" },
                  ]}
                  value={reuse.gripEnv}
                  onChange={(id) => setReuse((s) => ({ ...s, gripEnv: id }))}
                />
                <ProfileRow
                  icon={Factory}
                  label="Task / environment"
                  options={[
                    { id: "construction" as ReuseTask, label: "Construction" },
                    { id: "warehouse" as ReuseTask, label: "Warehouse" },
                    { id: "automotive" as ReuseTask, label: "Automotive" },
                    { id: "manufacturing" as ReuseTask, label: "Manufacturing" },
                    { id: "oil-gas" as ReuseTask, label: "Oil & gas" },
                    { id: "agriculture" as ReuseTask, label: "Agriculture" },
                  ]}
                  value={reuse.task}
                  onChange={(id) => setReuse((s) => ({ ...s, task: id }))}
                />
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <ColumnHeading step={2} title="Performance impact" />
            <p className="-mt-2 mb-6 text-xs text-white/45">{SCIENCE_PERF_FOOTNOTE}</p>
            <div className="space-y-4">
              {perfKeys.map(({ key, label }) => (
                <PerfBar key={key} label={label} level={profile.performance[key as keyof typeof profile.performance]} />
              ))}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--color-accent-orange)]/25 bg-[#111] lg:row-span-1">
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <ColumnHeading step={3} title="Buyer takeaway" />
              <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Best fit
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <h3 className="text-xl font-extrabold leading-tight text-white sm:text-2xl">{profile.profileTitle}</h3>
                  <p className="mt-1 text-sm font-medium text-white/55">{profile.profileSubtitle}</p>
                  <p className="mt-3 text-sm leading-relaxed text-white/72">{profile.summary}</p>
                </div>
                <div className="relative mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 sm:mx-0 sm:h-32 sm:w-32">
                  <Image src={profile.visual} alt="" fill className="object-cover" sizes="128px" unoptimized />
                </div>
              </div>
              <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
                <div>
                  <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-400/90">
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Best for
                  </p>
                  <p className="text-sm text-white/80">{profile.takeaway.best}</p>
                </div>
                <div>
                  <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-400/90">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Watch out for
                  </p>
                  <p className="text-sm text-white/80">{profile.takeaway.watch}</p>
                </div>
                <div>
                  <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/45">
                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Procurement note
                  </p>
                  <p className="text-sm text-white/65">{profile.takeaway.note}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:mt-8">
          {mode === "disposable" ? (
            <>
              <ThicknessHandRow
                activeMil={disp.thickness}
                materialLabel={materialLabel}
                onSelect={(mil) => setDisp((s) => ({ ...s, thickness: mil }))}
              />
              <PolymerGlanceCard activeId={disp.material} onSelect={setDispMaterial} />
              <TextureGuideCard
                items={DISP_TEXTURE_GUIDE.map((t) => ({ id: t.id, label: t.label, detail: `${t.grip} · ${t.dexterity}` }))}
                activeId={disp.texture}
                onSelect={(id) => setDisp((s) => ({ ...s, texture: id as DispTexture }))}
              />
            </>
          ) : (
            <>
              <CutLevelGuideCard activeLevel={reuse.cutLevel} onSelect={(l) => setReuse((s) => ({ ...s, cutLevel: l }))} />
              <ReuseCategoryGlance activeId={reuse.category} onSelect={(id) => setReuse((s) => ({ ...s, category: id }))} />
              <TextureGuideCard
                items={REUSE_TEXTURE_GUIDE.map((t) => ({ id: t.id, label: t.label, detail: `${t.grip} · ${t.environments}` }))}
                activeId={reuse.texture}
                onSelect={(id) => setReuse((s) => ({ ...s, texture: id as ReuseTexture }))}
              />
            </>
          )}
        </div>

        <div className="relative mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 lg:mt-10">
          {bottomCards.map((card, i) => {
            const Icon = BOTTOM_ICONS[card.icon];
            return (
              <article key={card.title} className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-accent-orange)]/30 bg-[var(--color-accent-orange)]/10 text-sm font-black text-[var(--color-accent-orange)]">
                  {i + 1}
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-[var(--color-accent-orange)]" aria-hidden />
                    <h3 className="text-sm font-extrabold text-white">{card.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-white/55">{card.body}</p>
                </div>
              </article>
            );
          })}
        </div>

        <p className="relative mt-8 text-center text-[11px] leading-relaxed text-white/38 sm:mt-10">{SCIENCE_DISCLAIMER}</p>
      </div>
    </ProcurementSectionShell>
  );
}
