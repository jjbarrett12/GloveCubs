"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Car,
  ChevronDown,
  CircleDollarSign,
  Factory,
  FileText,
  FlaskConical,
  HardHat,
  Layers,
  Package,
  Sparkles,
  SprayCan,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { cn } from "@/lib/utils";
import {
  type LabMode,
  type PerfLevel,
  type ScienceJobContext,
  type DispMaterial,
  type DispThickness,
  type DispTexture,
  type DispCuff,
  type DispTask,
  type ReuseCategory,
  type DippedCoating,
  type KnitShell,
  type ReuseTask,
  type ReuseCuff,
  type GripEnv,
  DISP_GLOVE_CLASSES_BY_MATERIAL,
  DISP_MATERIALS,
  DISP_TEXTURE_GUIDE,
  REUSE_CATEGORIES,
  REUSE_CUT_GUIDE,
  REUSE_CUFF_OPTIONS,
  REUSE_TEXTURE_GUIDE,
  SCIENCE_HEADER_VALUES,
  SCIENCE_JOB_DEFAULT,
  SCIENCE_JOB_OPTIONS,
  SCIENCE_LEARN_GUIDES,
  SCIENCE_MOCKUP_PERF,
  SCIENCE_PERF_FOOTNOTE,
  SCIENCE_REUSABLE_DISCLAIMER,
  PERF_LEVEL_LABELS,
  applyScienceJobPreset,
  defaultGloveClassForMaterial,
  deriveDisposableProfile,
  deriveReusableProfile,
  mapDisposableToMockupPerf,
  mapReusableToMockupPerf,
} from "@/config/gloveScienceLab";
import { buildGloveScienceRfqHref } from "@/lib/education/glove-science-rfq";
import styles from "@/components/home/homeScienceOfGlovesSection.module.css";

const HEADER_LOGO_SRC = "/images/glovecubs-header-logo.png";

const JOB_ICONS: Record<ScienceJobContext, LucideIcon> = {
  construction: HardHat,
  "cleaning-janitorial": SprayCan,
  automotive: Car,
  warehouse: Package,
  manufacturing: Factory,
  "chemical-handling": FlaskConical,
};

const HEADER_VALUE_ICONS = [Sparkles, TrendingUp, CircleDollarSign] as const;

const STEPS = [
  { id: 1, label: "Choose Job" },
  { id: 2, label: "Build Profile" },
  { id: 3, label: "See Impact" },
  { id: 4, label: "Buyer Takeaway" },
] as const;

const GUIDE_ICONS = [Layers, Target, Sparkles, CircleDollarSign] as const;

const REUSE_TASK_GRIP_ENV: Record<ReuseTask, GripEnv> = {
  construction: "abrasion",
  warehouse: "dry",
  automotive: "oil",
  manufacturing: "oil",
  "oil-gas": "oil",
  agriculture: "wet",
};

function PerfBar({ label, level }: { label: string; level: PerfLevel }) {
  const width = level === 0 ? "33%" : level === 1 ? "66%" : "100%";
  return (
    <div className={styles.perfRow}>
      <div className={styles.perfHead}>
        <span className={styles.perfLabel}>{label}</span>
        <span className={cn(styles.perfValue, level === 2 && styles.perfValueHigh)}>{PERF_LEVEL_LABELS[level]}</span>
      </div>
      <div className={styles.perfScale}>
        <span>Low</span>
        <span>High</span>
      </div>
      <div className={styles.perfTrack} role="img" aria-label={`${label}: ${PERF_LEVEL_LABELS[level]}`}>
        <div className={styles.perfFill} style={{ width }} />
      </div>
    </div>
  );
}

function ProfileSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  const selectId = React.useId();

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={selectId}>
        {label}
      </label>
      <div className={styles.selectWrap}>
        <select
          id={selectId}
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id} className={styles.selectOption}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.selectIcon} aria-hidden />
      </div>
    </div>
  );
}

export function HomeScienceOfGlovesSection() {
  const initialPreset = React.useMemo(() => applyScienceJobPreset(SCIENCE_JOB_DEFAULT, "reusable"), []);

  const [mode, setMode] = React.useState<LabMode>("reusable");
  const [job, setJob] = React.useState<ScienceJobContext>(SCIENCE_JOB_DEFAULT);
  const [disp, setDisp] = React.useState(initialPreset.disposable);
  const [reuse, setReuse] = React.useState(initialPreset.reusable);

  const dispProfile = React.useMemo(() => deriveDisposableProfile(disp), [disp]);
  const reuseProfile = React.useMemo(() => deriveReusableProfile(reuse), [reuse]);
  const profile = mode === "disposable" ? dispProfile : reuseProfile;

  const mockupPerf = React.useMemo(
    () =>
      mode === "disposable"
        ? mapDisposableToMockupPerf(dispProfile.performance, disp.texture)
        : mapReusableToMockupPerf(reuseProfile.performance),
    [mode, dispProfile.performance, disp.texture, reuseProfile.performance]
  );

  const rfqHref = React.useMemo(
    () => buildGloveScienceRfqHref({ mode, job, disposable: disp, reusable: reuse }),
    [mode, job, disp, reuse]
  );

  const selectJob = (nextJob: ScienceJobContext) => {
    setJob(nextJob);
    const preset = applyScienceJobPreset(nextJob, mode);
    setDisp(preset.disposable);
    setReuse(preset.reusable);
  };

  const setDispMaterial = (material: DispMaterial) => {
    setDisp((s) => ({
      ...s,
      material,
      gloveClass: defaultGloveClassForMaterial(material),
    }));
  };

  const reusableCoatingOptions: { id: ReuseCategory; label: string }[] = REUSE_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
  }));

  const reusableLinerOptions = React.useMemo(() => {
    if (reuse.category === "knit-cut") {
      return [
        { id: "hppe" as KnitShell, label: "HPPE shell" },
        { id: "nylon" as KnitShell, label: "Nylon shell" },
        { id: "polyester" as KnitShell, label: "Polyester shell" },
        { id: "aramid-blend" as KnitShell, label: "Aramid blend shell" },
      ];
    }
    if (reuse.category === "dipped") {
      return [
        { id: "nitrile" as DippedCoating, label: "Nitrile dip" },
        { id: "latex" as DippedCoating, label: "Latex dip" },
        { id: "pu" as DippedCoating, label: "PU dip" },
        { id: "pvc" as DippedCoating, label: "PVC dip" },
        { id: "foam-nitrile" as DippedCoating, label: "Foam nitrile dip" },
      ];
    }
    return [{ id: reuse.category as ReuseCategory, label: REUSE_CATEGORIES.find((c) => c.id === reuse.category)?.label ?? "Standard liner" }];
  }, [reuse.category]);

  const reusableLinerValue =
    reuse.category === "knit-cut" ? reuse.knitShell : reuse.category === "dipped" ? reuse.dippedCoating : reuse.category;

  const onReusableLinerChange = (id: string) => {
    if (reuse.category === "knit-cut") {
      setReuse((s) => ({ ...s, knitShell: id as KnitShell }));
      return;
    }
    if (reuse.category === "dipped") {
      setReuse((s) => ({ ...s, dippedCoating: id as DippedCoating }));
    }
  };

  const subtitle =
    mode === "reusable"
      ? "Reusable gloves: match grip, protection, durability, and comfort to the real job."
      : "Disposable gloves: match barrier, dexterity, and change frequency to the real job.";

  return (
    <ProcurementSectionShell
      tone="base"
      headingId="science-gloves-heading"
      ariaLabel="The science behind the glove"
      className="proc-section-dark !py-16 sm:!py-20"
    >
      <div className={styles.sectionCard}>
        <div className={styles.glow} aria-hidden />

        <header className={styles.headerGrid}>
          <div>
            <Image src={HEADER_LOGO_SRC} alt="GloveCubs" width={260} height={42} unoptimized className={styles.logo} />
            <h2 id="science-gloves-heading" className={styles.title}>
              The Science Behind the Glove
            </h2>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>

          <div className={styles.valueList} aria-label="Why this matters">
            {SCIENCE_HEADER_VALUES.map((item, i) => {
              const Icon = HEADER_VALUE_ICONS[i] ?? Sparkles;
              return (
                <div key={item.title} className={styles.valueItem}>
                  <span className={styles.valueIcon}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span>
                    <p className={styles.valueTitle}>{item.title}</p>
                    <p className={styles.valueBody}>{item.body}</p>
                  </span>
                </div>
              );
            })}
          </div>
        </header>

        <div className={styles.modeToggle} role="tablist" aria-label="Glove type">
          {(
            [
              { id: "disposable" as const, label: "Disposable Gloves" },
              { id: "reusable" as const, label: "Reusable (Work) Gloves" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              className={cn(styles.modeBtn, mode === tab.id && styles.modeBtnActive)}
              onClick={() => {
                setMode(tab.id);
                const preset = applyScienceJobPreset(job, tab.id);
                setDisp(preset.disposable);
                setReuse(preset.reusable);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.stepper} aria-label="Lab workflow">
          {STEPS.map((step) => (
            <div key={step.id} className={styles.step}>
              <span className={cn(styles.stepDot, step.id === 1 && styles.stepDotActive)}>{step.id}</span>
              <span className={cn(styles.stepLabel, step.id === 1 && styles.stepLabelActive)}>{step.label}</span>
            </div>
          ))}
        </div>

        <div>
          <p className={styles.panelHeading}>Step 1: Choose Job Context</p>
          <div className={styles.jobRow} role="listbox" aria-label="Job context">
            {SCIENCE_JOB_OPTIONS.map((opt) => {
              const Icon = JOB_ICONS[opt.id];
              const active = job === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(styles.jobTile, active && styles.jobTileActive)}
                  onClick={() => selectJob(opt.id)}
                >
                  <span className={styles.jobIcon}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className={styles.jobLabel}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.connector} aria-hidden>
          <ChevronDown className="h-5 w-5" />
        </div>

        <div className={styles.columns} aria-live="polite">
          <div className={styles.panel}>
            <p className={styles.panelHeading}>Build Glove Profile</p>

            {mode === "disposable" ? (
              <>
                <ProfileSelect
                  label="Glove Material / Coating"
                  value={disp.material}
                  options={DISP_MATERIALS.map((m) => ({ id: m.id, label: m.label }))}
                  onChange={setDispMaterial}
                />
                <ProfileSelect
                  label="Liner / Shell"
                  value={String(disp.thickness)}
                  options={([3, 4, 5, 6, 8] as const).map((m) => ({ id: String(m), label: `${m} mil gauge` }))}
                  onChange={(id) => setDisp((s) => ({ ...s, thickness: Number(id) as DispThickness }))}
                />
                <ProfileSelect
                  label="Grip Finish"
                  value={disp.texture}
                  options={DISP_TEXTURE_GUIDE.map((t) => ({ id: t.id, label: t.label }))}
                  onChange={(id) => setDisp((s) => ({ ...s, texture: id }))}
                />
                <ProfileSelect
                  label="Cuff Style"
                  value={disp.cuff}
                  options={[
                    { id: "standard" as DispCuff, label: "Standard cuff" },
                    { id: "extended" as DispCuff, label: "Extended cuff" },
                  ]}
                  onChange={(id) => setDisp((s) => ({ ...s, cuff: id }))}
                />
                <ProfileSelect
                  label="Protection Need"
                  value={disp.gloveClass}
                  options={DISP_GLOVE_CLASSES_BY_MATERIAL[disp.material].map((c) => ({ id: c.id, label: c.label }))}
                  onChange={(id) => setDisp((s) => ({ ...s, gloveClass: id }))}
                />
                <ProfileSelect
                  label="Reusability / Use Pattern"
                  value={disp.task}
                  options={[
                    { id: "food-prep" as DispTask, label: "Food prep — frequent changes" },
                    { id: "cleaning" as DispTask, label: "Cleaning / janitorial" },
                    { id: "assembly" as DispTask, label: "Assembly / handling" },
                    { id: "chemical" as DispTask, label: "Chemical handling" },
                    { id: "exam" as DispTask, label: "Exam / patient care" },
                  ]}
                  onChange={(id) => setDisp((s) => ({ ...s, task: id }))}
                />
              </>
            ) : (
              <>
                <ProfileSelect
                  label="Glove Material / Coating"
                  value={reuse.category}
                  options={reusableCoatingOptions}
                  onChange={(id) => setReuse((s) => ({ ...s, category: id }))}
                />
                <ProfileSelect
                  label="Liner / Shell"
                  value={reusableLinerValue}
                  options={reusableLinerOptions}
                  onChange={onReusableLinerChange}
                />
                <ProfileSelect
                  label="Grip Finish"
                  value={reuse.texture}
                  options={REUSE_TEXTURE_GUIDE.map((t) => ({ id: t.id, label: t.label }))}
                  onChange={(id) => setReuse((s) => ({ ...s, texture: id }))}
                />
                <ProfileSelect
                  label="Cuff Style"
                  value={reuse.cuff}
                  options={REUSE_CUFF_OPTIONS}
                  onChange={(id) => setReuse((s) => ({ ...s, cuff: id }))}
                />
                <ProfileSelect
                  label="Protection Need"
                  value={reuse.cutLevel}
                  options={REUSE_CUT_GUIDE.map((c) => ({ id: c.level, label: `${c.level} · ${c.grams}` }))}
                  onChange={(id) => setReuse((s) => ({ ...s, cutLevel: id }))}
                />
                <ProfileSelect
                  label="Reusability / Use Pattern"
                  value={reuse.task}
                  options={[
                    { id: "construction" as ReuseTask, label: "Construction — heavy abrasion" },
                    { id: "warehouse" as ReuseTask, label: "Warehouse — mixed handling" },
                    { id: "automotive" as ReuseTask, label: "Automotive — oily grip" },
                    { id: "manufacturing" as ReuseTask, label: "Manufacturing — industrial" },
                    { id: "oil-gas" as ReuseTask, label: "Oil / gas — harsh environments" },
                    { id: "agriculture" as ReuseTask, label: "Agriculture — seasonal wear" },
                  ]}
                  onChange={(id) =>
                    setReuse((s) => ({ ...s, task: id, gripEnv: REUSE_TASK_GRIP_ENV[id] }))
                  }
                />
              </>
            )}

            <p className={styles.panelFootnote}>
              {mode === "reusable"
                ? "Reusable filters adapt to the selected job context."
                : "Disposable filters adapt to the selected job context."}
            </p>
          </div>

          <div className={styles.panel}>
            <p className={styles.panelHeading}>Performance Impact</p>
            {SCIENCE_MOCKUP_PERF.map(({ key, label }) => (
              <PerfBar key={key} label={label} level={mockupPerf[key]} />
            ))}
            <p className={styles.panelFootnote}>{SCIENCE_PERF_FOOTNOTE}</p>
          </div>

          <div className={cn(styles.panel, styles.panelAccent)}>
            <p className={styles.panelHeading}>Buyer Takeaway</p>

            <div className={styles.takeawayBlock}>
              <p className={styles.takeawayLabel}>Best Fit</p>
              <p className={styles.takeawayText}>{profile.profileTitle}</p>
              <p className={cn(styles.takeawayText, "mt-1 text-white/55")}>{profile.summary}</p>
            </div>

            <div className={styles.takeawayBlock}>
              <p className={styles.takeawayLabel}>Best For</p>
              <p className={styles.takeawayText}>{profile.takeaway.best}</p>
            </div>

            <div className={styles.takeawayBlock}>
              <p className={styles.takeawayLabel}>Watch Out For</p>
              <p className={styles.takeawayText}>{profile.takeaway.watch}</p>
            </div>

            <div className={styles.takeawayBlock}>
              <p className={styles.takeawayLabel}>Procurement Note</p>
              <p className={styles.takeawayText}>{profile.takeaway.note}</p>
            </div>

            <div className={styles.rfqBox}>
              <p className={styles.rfqTitle}>RFQ-Ready Spec Summary</p>
              <p className={styles.rfqBody}>All selections compiled into a spec you can send to suppliers.</p>
              <Link href={rfqHref} className={styles.rfqBtn}>
                <FileText className="h-4 w-4" aria-hidden />
                Use this as RFQ spec
              </Link>
            </div>
          </div>
        </div>

        <div>
          <p className={cn(styles.panelHeading, "mt-6")}>Learn the Science</p>
          <div className={styles.guideGrid}>
            {SCIENCE_LEARN_GUIDES.map((guide, i) => {
              const Icon = GUIDE_ICONS[i] ?? Layers;
              return (
                <Link key={guide.title} href={guide.href} className={styles.guideCard}>
                  <span className="flex min-w-0 items-start gap-3">
                    <span className={styles.valueIcon}>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <p className={styles.guideTitle}>{guide.title}</p>
                      <p className={styles.guideBody}>{guide.body}</p>
                    </span>
                  </span>
                  <ArrowRight className={cn("h-4 w-4", styles.guideArrow)} aria-hidden />
                </Link>
              );
            })}
          </div>
        </div>

        <div className={styles.footerRow}>
          <p className={styles.disclaimer}>
            {mode === "reusable" ? SCIENCE_REUSABLE_DISCLAIMER : "Disposable filters: material, mil gauge, texture, cuff, and glove class — not mechanical cut ratings."}
          </p>
          <Image src={HEADER_LOGO_SRC} alt="" width={180} height={28} unoptimized className={styles.footerLogo} aria-hidden />
        </div>
      </div>
    </ProcurementSectionShell>
  );
}
