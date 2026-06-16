"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Car,
  Check,
  Factory,
  Hand,
  HeartPulse,
  Route,
  Shield,
  Sparkles,
  Target,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomeCtaLink, HomePanelLight } from "@/components/home/authority/HomeAuthorityPrimitives";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { buildSurveyIndustryOptions, scoringIndustryBucket } from "@/config/gloveEducationSurvey";
import { DEFAULT_SURVEY_INTAKE, type SurveyIntakeState } from "@/lib/education-hub/intake-types";
import type { EducationHubCatalogCandidate } from "@/lib/education-hub/survey-catalog-matches";
import {
  intakeToStoreCatalogFilters,
  rankCatalogCandidatesForIntake,
} from "@/lib/education-hub/survey-catalog-matches";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { cn } from "@/lib/utils";

const DISCLAIMER =
  "Recommendations are educational guidance and should be validated against your operational, regulatory, and safety requirements.";

const IMG_PARAMS = "auto=format&fit=crop&w=600&h=600&q=80";

const PROGRAM_THUMBNAILS: Record<string, string> = {
  "fs-nitrile-6": `https://images.unsplash.com/photo-1579684385127-1ef15d508118?${IMG_PARAMS}`,
  "fs-vinyl": `https://images.unsplash.com/photo-1559339352-11d035aa65de?${IMG_PARAMS}`,
  "hc-exam": `https://images.unsplash.com/photo-1579684385127-1ef15d508118?${IMG_PARAMS}`,
  "jan-chem": `https://images.unsplash.com/photo-1521791136064-7986c2920216?${IMG_PARAMS}`,
  "ind-heavy": `https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?${IMG_PARAMS}`,
  "auto-mechanic": `https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?${IMG_PARAMS}`,
  "gen-standard": `https://images.unsplash.com/photo-1579684385127-1ef15d508118?${IMG_PARAMS}`,
  "hc-chemo-note": `https://images.unsplash.com/photo-1579684385127-1ef15d508118?${IMG_PARAMS}`,
  "ind-supported": `https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?${IMG_PARAMS}`,
};

const STEP_COUNT = 10;
const SURVEY_INDUSTRY_OPTIONS = buildSurveyIndustryOptions();

type StepOption = { value: string; label: string; hint?: string; icon?: LucideIcon };

type StepConfig = {
  id: string;
  title: string;
  subtitle: string;
  options: StepOption[];
  multi?: boolean;
};

const STEPS: StepConfig[] = [
  {
    id: "industry",
    title: "What is your primary industry?",
    subtitle: "Where gloves are used most often in your operation.",
    options: SURVEY_INDUSTRY_OPTIONS,
  },
  {
    id: "task",
    title: "What is your main task or use-case?",
    subtitle: "The work that drives most glove consumption.",
    options: [
      { value: "food-handling", label: "Food handling & prep", icon: UtensilsCrossed },
      { value: "patient-care", label: "Patient care & exam", icon: HeartPulse },
      { value: "cleaning", label: "Cleaning & sanitation", icon: Sparkles },
      { value: "assembly", label: "Assembly & precision work", icon: Factory },
      { value: "mechanical", label: "Mechanical & tool work", icon: Car },
      { value: "general-disposable", label: "General disposable barrier", icon: Hand },
    ],
  },
  {
    id: "exposure",
    title: "What exposure risks apply?",
    subtitle: "Select all that apply to the task environment.",
    multi: true,
    options: [
      { value: "wet-oily", label: "Wet / oily surfaces" },
      { value: "chemicals", label: "Chemicals or disinfectants" },
      { value: "heat", label: "Heat or hot surfaces" },
      { value: "abrasion", label: "Abrasion or rough handling" },
      { value: "biological", label: "Biological fluids" },
    ],
  },
  {
    id: "dexterity",
    title: "How much dexterity is required?",
    subtitle: "Tactile sensitivity the task demands.",
    options: [
      { value: "high", label: "High dexterity", hint: "Fine prep, tools, precision" },
      { value: "standard", label: "Standard dexterity", hint: "Mixed tasks, moderate grip" },
    ],
  },
  {
    id: "thickness",
    title: "What thickness do you prefer?",
    subtitle: "Barrier time vs flexibility for your task tier.",
    options: [
      { value: "light", label: "Light", hint: "Lower mil, more feel" },
      { value: "standard", label: "Standard", hint: "Balanced barrier" },
      { value: "heavy", label: "Heavy", hint: "Higher mil, longer wear" },
    ],
  },
  {
    id: "foodSafe",
    title: "Do you need food-safe gloves?",
    subtitle: "Direct or indirect food contact in your process.",
    options: [
      { value: "yes", label: "Yes — food contact", hint: "HACCP-aligned selection" },
      { value: "no", label: "No food contact", hint: "Industrial or clinical only" },
    ],
  },
  {
    id: "chemical",
    title: "Is chemical exposure present?",
    subtitle: "Solvents, disinfectants, or process chemicals.",
    options: [
      { value: "yes", label: "Yes — chemical exposure", hint: "Prefer nitrile barrier" },
      { value: "no", label: "Minimal / none", hint: "Standard disposable class" },
    ],
  },
  {
    id: "duration",
    title: "How long are gloves typically worn?",
    subtitle: "Continuous wear per task or shift segment.",
    options: [
      { value: "short", label: "Short tasks", hint: "Frequent changes" },
      { value: "extended", label: "Extended wear", hint: "Longer continuous use" },
    ],
  },
  {
    id: "powder",
    title: "Is powder-free required?",
    subtitle: "Contamination control for food, clean, and clinical environments.",
    options: [
      { value: "yes", label: "Powder-free required", hint: "Food, cleanroom, clinical" },
      { value: "no", label: "Powder-free not required", hint: "General industrial only" },
    ],
  },
  {
    id: "priority",
    title: "What matters more for your program?",
    subtitle: "Procurement priority for your glove program.",
    options: [
      { value: "durability", label: "Durability & barrier", hint: "Fewer failures, longer wear" },
      { value: "value", label: "Value & turnover", hint: "Cost per change, high volume" },
    ],
  },
];

const TRUST_ITEMS = [
  {
    title: "Operational context",
    body: "We consider your environment, hazards, and workflows.",
    icon: Factory,
  },
  {
    title: "Guided selection",
    body: "Wizard maps operational context, hazards, and glove attributes to published catalog listings.",
    icon: Brain,
  },
  {
    title: "Clear recommendation path",
    body: "Transparent reasoning and easy next steps.",
    icon: Route,
  },
] as const;

type ProgramFit = {
  id: string;
  name: string;
  gloveClass: string;
  thickness: string;
  texture: string;
  bestFor: string;
  compliance: string[];
  industries: string[];
  tasks: string[];
  materials: string[];
};

const PROGRAM_FITS: ProgramFit[] = [
  {
    id: "fs-nitrile-6",
    name: "Food-Safe Nitrile 6 mil",
    gloveClass: "Food service nitrile",
    thickness: "6 mil",
    texture: "Textured fingertips",
    bestFor: "Prep, handling, short wet tasks",
    compliance: ["Food contact", "Powder-free"],
    industries: ["food-service", "general"],
    tasks: ["food-handling", "general-disposable"],
    materials: ["Nitrile"],
  },
  {
    id: "fs-vinyl",
    name: "Vinyl Food-Service Program",
    gloveClass: "Food service vinyl",
    thickness: "3–4 mil",
    texture: "Smooth",
    bestFor: "Low-risk handling, high turnover",
    compliance: ["Food contact"],
    industries: ["food-service"],
    tasks: ["food-handling"],
    materials: ["Vinyl"],
  },
  {
    id: "hc-exam",
    name: "Exam Nitrile Program",
    gloveClass: "Healthcare exam",
    thickness: "3–5 mil",
    texture: "Textured / smooth",
    bestFor: "Patient care, exam rooms",
    compliance: ["Exam-grade", "Latex-free"],
    industries: ["healthcare"],
    tasks: ["patient-care"],
    materials: ["Nitrile"],
  },
  {
    id: "jan-chem",
    name: "Janitorial Nitrile Extended Cuff",
    gloveClass: "Janitorial barrier",
    thickness: "6–8 mil",
    texture: "Textured",
    bestFor: "Cleaning, disinfecting, wet work",
    compliance: ["Chemical-resistant", "Powder-free"],
    industries: ["janitorial"],
    tasks: ["cleaning"],
    materials: ["Nitrile"],
  },
  {
    id: "ind-heavy",
    name: "Industrial Heavy-Duty Nitrile",
    gloveClass: "Industrial disposable",
    thickness: "8 mil",
    texture: "Raised grip",
    bestFor: "Abrasion, oils, extended tasks",
    compliance: ["Heavy-duty"],
    industries: ["industrial", "automotive"],
    tasks: ["mechanical", "assembly"],
    materials: ["Nitrile"],
  },
  {
    id: "auto-mechanic",
    name: "Mechanic Nitrile Program",
    gloveClass: "Automotive disposable",
    thickness: "5–6 mil",
    texture: "Diamond texture",
    bestFor: "Shop floor, oils, tool grip",
    compliance: ["Oil-resistant"],
    industries: ["automotive"],
    tasks: ["mechanical"],
    materials: ["Nitrile"],
  },
  {
    id: "gen-standard",
    name: "General Nitrile Standard",
    gloveClass: "General purpose",
    thickness: "4–5 mil",
    texture: "Standard",
    bestFor: "Mixed tasks, program baseline",
    compliance: ["Latex-free"],
    industries: ["general", "industrial"],
    tasks: ["general-disposable", "assembly"],
    materials: ["Nitrile"],
  },
  {
    id: "hc-chemo-note",
    name: "Chemo-Rated Listing Path",
    gloveClass: "Specialty clinical",
    thickness: "Per published SKU",
    texture: "Per listing",
    bestFor: "When published chemo rating required",
    compliance: ["Verify on SKU"],
    industries: ["healthcare"],
    tasks: ["patient-care"],
    materials: ["Nitrile"],
  },
  {
    id: "ind-supported",
    name: "Supported Work Glove Class",
    gloveClass: "Mechanical / supported",
    thickness: "ANSI-rated",
    texture: "Coated palm",
    bestFor: "Cut or impact beyond disposables",
    compliance: ["Task-specific ANSI"],
    industries: ["industrial", "automotive"],
    tasks: ["mechanical", "assembly"],
    materials: ["Supported work"],
  },
];

type ScoredProgram = {
  program: ProgramFit;
  score: number;
};

/** Upper bound of positive points in `scoreProgram` — used to normalize match % (rule-based, not ML). */
const SCORE_RUBRIC_MAX = 16;

function deriveGloveClass(s: SurveyIntakeState): { className: string; summary: string } {
  const industryBucket = scoringIndustryBucket(s.industry);
  if (s.foodSafe || industryBucket === "food-service" || s.task === "food-handling") {
    return {
      className: "Food Service",
      summary:
        "Food-safe nitrile disposable guidance for prep, service, wet/oily handling, and short-duration cleaning tasks.",
    };
  }
  if (industryBucket === "healthcare" || s.task === "patient-care") {
    return {
      className: "Healthcare Exam",
      summary:
        "Patient-care barrier programs with latex-free exam-grade attributes—confirm specialty ratings on each SKU.",
    };
  }
  if (industryBucket === "janitorial" || s.task === "cleaning" || s.chemicalExposure) {
    return {
      className: "Janitorial & Chemical Barrier",
      summary:
        "Chemical-resistant nitrile orientation for disinfectants, wet work, and longer barrier windows.",
    };
  }
  if (industryBucket === "automotive" || s.task === "mechanical") {
    return {
      className: "Automotive / Mechanical",
      summary:
        "Shop-floor disposable programs built around oil resistance, tool grip, and durable nitrile barrier.",
    };
  }
  return {
    className: "Industrial Disposable",
    summary:
      "General industrial disposable direction with thickness and grip tuned to your task tier and wear duration.",
  };
}

function deriveReasons(s: SurveyIntakeState): string[] {
  const reasons: string[] = [];
  if (s.foodSafe) reasons.push("Food-safe materials");
  if (texturedGripFromState(s)) reasons.push("Textured grip");
  if (s.exposureRisks.includes("wet-oily")) reasons.push("Wet / oil grip support");
  if (s.wearDuration === "short") reasons.push("Comfortable for frequent changes");
  if (s.dexterity === "high") reasons.push("Strong dexterity");
  if (s.chemicalExposure || s.exposureRisks.includes("chemicals")) reasons.push("Chemical barrier orientation");
  if (s.powderFree) reasons.push("Powder-free program alignment");
  if (reasons.length < 4) reasons.push("Latex-free synthetic baseline");
  return reasons.slice(0, 4);
}

function texturedGripFromState(s: SurveyIntakeState): boolean {
  return s.exposureRisks.includes("wet-oily") || s.exposureRisks.includes("abrasion");
}

function scoreProgram(p: ProgramFit, s: SurveyIntakeState): number {
  let score = 0;
  const haystack = `${p.name} ${p.gloveClass} ${p.texture} ${p.bestFor} ${p.compliance.join(" ")}`.toLowerCase();

  const industryBucket = scoringIndustryBucket(s.industry);
  if (p.industries.includes(industryBucket)) score += 4;
  else if (p.industries.includes("general")) score += 1;
  else score -= 3;

  if (p.tasks.includes(s.task)) score += 3;
  if (s.foodSafe && /food/.test(haystack)) score += 3;
  if (!s.foodSafe && /food service vinyl|food-safe nitrile/i.test(p.name)) score -= 2;

  const hasChem = s.chemicalExposure || s.exposureRisks.includes("chemicals");
  if (hasChem && /chem|disinfect|janitorial/i.test(haystack)) score += 3;
  if (s.exposureRisks.includes("wet-oily") && /textur|grip|diamond/i.test(haystack)) score += 2;
  if (s.exposureRisks.includes("abrasion") && /heavy|8 mil|supported|industrial/i.test(haystack)) score += 2;
  if (s.thickness === "heavy" && /8|6–8|heavy/i.test(p.thickness)) score += 2;
  if (s.programPriority === "value" && /vinyl|value|turnover/i.test(haystack)) score += 2;
  if (s.programPriority === "durability" && /heavy|8|extended|mechanic/i.test(haystack)) score += 2;

  return Math.max(0, score);
}

function deriveScoredPrograms(s: SurveyIntakeState): ScoredProgram[] {
  return PROGRAM_FITS.map((program) => ({ program, score: scoreProgram(program, s) })).sort((a, b) => b.score - a.score);
}

/**
 * Match % from deterministic rubric scores for the top program vs the candidate pool.
 * Capped below 100% — educational alignment index, not a safety or SKU guarantee.
 */
function deriveMatchScorePercent(topScore: number, allScores: number[]): number {
  if (allScores.length === 0 || topScore <= 0) return 0;
  const maxInPool = Math.max(...allScores, 1);
  const poolRatio = topScore / maxInPool;
  const rubricRatio = Math.min(1, topScore / SCORE_RUBRIC_MAX);
  const blended = poolRatio * 0.45 + rubricRatio * 0.55;
  return Math.min(96, Math.max(68, Math.round(68 + blended * 28)));
}

function programImageUrl(programId: string): string {
  return PROGRAM_THUMBNAILS[programId] ?? PROGRAM_THUMBNAILS["gen-standard"];
}

function GloveIntelligenceEyebrow() {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-px w-8 shrink-0 bg-[var(--color-accent-orange)]" aria-hidden />
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-accent-orange)]">Glove intelligence</p>
    </div>
  );
}

function ProgramThumbnail({ programId, className }: { programId: string; className?: string }) {
  const src = programImageUrl(programId);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1a1a1a] via-[#141414] to-[#0a0a0a]",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
        className="h-full w-full object-cover object-center brightness-[0.92] saturate-[0.9]"
      />
    </div>
  );
}

function QuizOptionRow({
  option,
  selected,
  onSelect,
  multi,
}: {
  option: StepOption;
  selected: boolean;
  onSelect: () => void;
  multi?: boolean;
}) {
  const Icon = option.icon ?? Target;
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition duration-200",
        selected
          ? "border-[var(--color-accent-orange)] bg-[#fff8f3] shadow-[0_0_0_1px_rgb(255_106_0/0.22)]"
          : "border-[#e3e3e0] bg-white hover:border-[#d0d0cc] hover:bg-[#fafaf8]"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
          selected
            ? "border-[var(--color-accent-orange)]/25 bg-[var(--color-accent-orange)]/10 text-[var(--color-accent-orange)]"
            : "border-[#ebebea] bg-[#f4f4f2] text-neutral-500"
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px] font-bold", selected ? "text-ink" : "text-neutral-800")}>{option.label}</span>
        {option.hint ? <span className="mt-0.5 block text-xs text-neutral-500">{option.hint}</span> : null}
      </span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
          selected ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]" : "border-[#d0d0cc] bg-white"
        )}
        aria-hidden
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
    </button>
  );
}

function CatalogProductThumbnail({
  imageUrl,
  name,
  className,
}: {
  imageUrl: string | null | undefined;
  name: string;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1a1a1a] via-[#141414] to-[#0a0a0a]",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-center brightness-[0.92] saturate-[0.9]"
        />
      </div>
    );
  }
  return <ProgramThumbnail programId="gen-standard" className={className} />;
}

function HomeGloveEducationHubClient({
  catalogCandidates,
  catalogUnavailable,
}: {
  catalogCandidates: EducationHubCatalogCandidate[];
  catalogUnavailable: boolean;
}) {
  const [step, setStep] = React.useState(0);
  const [intake, setIntake] = React.useState<SurveyIntakeState>(DEFAULT_SURVEY_INTAKE);
  const [surveyComplete, setSurveyComplete] = React.useState(false);
  const resultsRef = React.useRef<HTMLDivElement>(null);

  const gloveClass = React.useMemo(() => deriveGloveClass(intake), [intake]);
  const reasons = React.useMemo(() => deriveReasons(intake), [intake]);
  const scoredPrograms = React.useMemo(() => deriveScoredPrograms(intake), [intake]);
  const winnerEntry = scoredPrograms[0];
  const winner = winnerEntry?.program ?? PROGRAM_FITS[0];
  const winnerScore = winnerEntry?.score ?? 0;
  const allScores = React.useMemo(() => scoredPrograms.map((s) => s.score), [scoredPrograms]);
  const matchScorePercent = React.useMemo(
    () => deriveMatchScorePercent(winnerScore, allScores),
    [winnerScore, allScores]
  );
  const matchedProducts = React.useMemo(
    () => rankCatalogCandidatesForIntake(catalogCandidates, intake, 8),
    [catalogCandidates, intake]
  );
  const matchedProductsKey = matchedProducts.map((p) => p.id).join(",");
  const storeBrowseHref = React.useMemo(
    () => buildStoreCatalogHref(intakeToStoreCatalogFilters(intake)),
    [intake]
  );
  const topMatchedProduct = matchedProducts[0];

  const currentStep = STEPS[step];
  const progress = ((step + 1) / STEP_COUNT) * 100;

  const applyStepValue = React.useCallback((stepId: string, value: string) => {
    setIntake((prev) => {
      switch (stepId) {
        case "industry":
          return { ...prev, industry: value };
        case "task":
          return { ...prev, task: value };
        case "exposure": {
          const risks = prev.exposureRisks.includes(value)
            ? prev.exposureRisks.filter((r) => r !== value)
            : [...prev.exposureRisks, value];
          return { ...prev, exposureRisks: risks.length ? risks : [value] };
        }
        case "dexterity":
          return { ...prev, dexterity: value as SurveyIntakeState["dexterity"] };
        case "thickness":
          return { ...prev, thickness: value as SurveyIntakeState["thickness"] };
        case "foodSafe":
          return { ...prev, foodSafe: value === "yes" };
        case "chemical":
          return { ...prev, chemicalExposure: value === "yes" };
        case "duration":
          return { ...prev, wearDuration: value as SurveyIntakeState["wearDuration"] };
        case "powder":
          return { ...prev, powderFree: value === "yes" };
        case "priority":
          return { ...prev, programPriority: value as SurveyIntakeState["programPriority"] };
        default:
          return prev;
      }
    });
  }, []);

  const isSelected = (stepId: string, value: string): boolean => {
    switch (stepId) {
      case "industry":
        return intake.industry === value;
      case "task":
        return intake.task === value;
      case "exposure":
        return intake.exposureRisks.includes(value);
      case "dexterity":
        return intake.dexterity === value;
      case "thickness":
        return intake.thickness === value;
      case "foodSafe":
        return (intake.foodSafe ? "yes" : "no") === value;
      case "chemical":
        return (intake.chemicalExposure ? "yes" : "no") === value;
      case "duration":
        return intake.wearDuration === value;
      case "powder":
        return (intake.powderFree ? "yes" : "no") === value;
      case "priority":
        return intake.programPriority === value;
      default:
        return false;
    }
  };

  const isLastStep = step >= STEP_COUNT - 1;

  const goNext = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const completeSurvey = React.useCallback(() => {
    setSurveyComplete(true);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleOptionSelect = React.useCallback(
    (value: string) => {
      applyStepValue(currentStep.id, value);
      if (!currentStep.multi && step < STEP_COUNT - 1) {
        window.setTimeout(() => goNext(), 200);
      }
    },
    [applyStepValue, currentStep.id, currentStep.multi, step]
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isLastStep) completeSurvey();
        else goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, isLastStep, completeSurvey]);

  return (
    <ProcurementSectionShell
      tone="light-alt"
      headingId="education-hub-heading"
      ariaLabel="Guided glove selection intake"
      className="overflow-x-hidden bg-[var(--color-industrial-gray)] !py-10 sm:!py-12"
      containerClassName="max-w-proc"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-[#e8e8e4] bg-[#fafaf8] px-5 py-8 shadow-[0_12px_48px_rgb(0_0_0/0.05)] sm:px-8 sm:py-10 lg:px-10 lg:py-11">
        <header className="mb-8 border-b border-[#ebebea] pb-8 lg:mb-9 lg:pb-9">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-8">
            <div>
              <GloveIntelligenceEyebrow />
              <h2
                id="education-hub-heading"
                className="text-[2rem] font-black leading-[0.98] tracking-[-0.02em] text-ink sm:text-[2.65rem] lg:text-[2.85rem]"
              >
                Answer a few questions. Get the right glove—faster
                <span className="text-[var(--color-accent-orange)]">.</span>
              </h2>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-neutral-500 sm:mt-4 sm:text-[1.0625rem]">
                Our recommendation flow evaluates operational context, hazards, dexterity needs, and glove preferences
                to guide you toward appropriate glove classes and published listings—guided selection for quote review.
              </p>
            </div>

            <ul className="m-0 grid grid-cols-1 gap-4 p-0 sm:grid-cols-3 sm:gap-3 lg:gap-0 lg:divide-x lg:divide-[#ebebea]/80">
              {TRUST_ITEMS.map(({ title, body, icon: Icon }, index) => (
                <li
                  key={title}
                  className={cn("flex list-none items-start gap-3 sm:flex-col sm:gap-2 lg:px-5", index === 0 && "lg:pl-0")}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ebebea] bg-[#FFF8F0] shadow-[0_4px_16px_rgb(0_0_0/0.06)]"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5 text-[var(--color-accent-orange)]" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-extrabold leading-snug text-ink sm:text-[15px]">{title}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </header>

        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-7">
          <HomePanelLight className="flex min-w-0 flex-col overflow-hidden p-0">
            <div className="border-b border-[#ebebea] px-4 py-3 sm:px-5">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-neutral-500">
                <span>
                  Step {step + 1} of {STEP_COUNT}
                </span>
                <span>~90 seconds</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#ebebea]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent-orange)] transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={step + 1}
                  aria-valuemin={1}
                  aria-valuemax={STEP_COUNT}
                  aria-label={`Question ${step + 1} of ${STEP_COUNT}`}
                />
              </div>
            </div>

            <div className="flex flex-col px-4 py-4 sm:px-5 sm:py-4" role="group" aria-labelledby="quiz-question">
              <h3 id="quiz-question" className="mb-0.5 text-base font-extrabold tracking-tight text-ink sm:text-lg">
                {step + 1}. {currentStep.title}
              </h3>
              <p className="mb-3 text-sm text-neutral-500">{currentStep.subtitle}</p>
              <div
                className={cn(
                  "overflow-y-auto pr-0.5 [scrollbar-width:thin]",
                  currentStep.id === "industry"
                    ? "max-h-[min(26rem,58vh)] sm:max-h-[min(22rem,52vh)]"
                    : "flex max-h-[min(19rem,48vh)] flex-col gap-2"
                )}
              >
                <div
                  className={cn(
                    currentStep.id === "industry" ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "flex flex-col gap-2"
                  )}
                >
                  {currentStep.options.map((opt) => (
                    <QuizOptionRow
                      key={opt.value}
                      option={opt}
                      selected={isSelected(currentStep.id, opt.value)}
                      onSelect={() => handleOptionSelect(opt.value)}
                      multi={currentStep.multi}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ebebea] px-4 py-3 sm:px-5">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#e0e0dc] px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-[#fafaf8] disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
                >
                  Skip
                </button>
              </div>
              <button
                type="button"
                onClick={isLastStep ? completeSurvey : goNext}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_20px_rgb(255_106_0/0.28)] transition hover:brightness-105",
                  surveyComplete && isLastStep
                    ? "bg-emerald-600"
                    : "bg-[var(--color-accent-orange)]"
                )}
              >
                {isLastStep ? (surveyComplete ? "Completed" : "Complete") : "Next question"}
                <span className="text-xs font-normal opacity-80">Press Enter ↵</span>
              </button>
            </div>
          </HomePanelLight>

          <div
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] text-white shadow-[0_16px_48px_rgb(0_0_0/0.22)]"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
                Guided selection preview
              </span>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                Preview — not a final safety determination
              </span>
            </div>

            <div className="flex flex-col p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_minmax(0,9rem)] sm:gap-5">
                <div className="min-w-0">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent-orange)]/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Best fit
                  </div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/45">{winner.gloveClass}</p>
                  <h3 className="mb-2 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">{winner.name}</h3>
                  <p className="mb-3 text-sm leading-relaxed text-white/75">{gloveClass.summary}</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {reasons.map((r) => (
                      <div
                        key={r}
                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2"
                      >
                        <Check className="h-4 w-4 shrink-0 text-[var(--color-accent-orange)]" strokeWidth={2.5} aria-hidden />
                        <span className="text-xs font-medium leading-snug text-white/88">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-center sm:items-stretch">
                  <CatalogProductThumbnail
                    imageUrl={topMatchedProduct?.imageUrl}
                    name={topMatchedProduct?.name ?? winner.name}
                    className="aspect-square w-full max-w-[9rem] sm:mx-auto"
                  />
                  <div
                    className="mt-3 w-full text-center sm:text-left"
                    aria-label={`Rule-based alignment score ${matchScorePercent} percent for ${winner.name}`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Match score</p>
                    <p className="mt-0.5 text-3xl font-black leading-none tracking-tight text-emerald-400">{matchScorePercent}%</p>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-white/40">From intake rubric · not a safety rating</p>
                  </div>
                </div>
              </div>
            </div>

            <p className="shrink-0 border-t border-white/10 px-4 py-2.5 text-[11px] leading-relaxed text-white/45 sm:px-5">{DISCLAIMER}</p>
          </div>
        </div>

        <div ref={resultsRef} className="mt-8 min-w-0 scroll-mt-24 lg:mt-9" aria-live="polite">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-lg font-extrabold text-ink sm:text-xl">Recommended operational fits</h4>
              <p className="mt-1.5 text-sm text-neutral-500">
                Published catalog listings ranked from your answers—open any card for specs, variants, and add-to-quote.
              </p>
            </div>
            {matchedProducts.length > 0 ? (
              <Link
                href={storeBrowseHref}
                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[#e3e3e0] px-4 py-2 text-sm font-semibold text-ink transition hover:border-[var(--color-accent-orange)]/40 hover:bg-[#fafaf8]"
              >
                Browse more in store →
              </Link>
            ) : null}
          </div>

          {catalogUnavailable ? (
            <div className="rounded-xl border border-[#e3e3e0] bg-white p-5 text-sm text-neutral-600">
              Catalog listings are temporarily unavailable. Open the store when ready, or request pricing for programs not yet
              on the grid.
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/store"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--color-accent-orange)] px-4 py-2 text-sm font-bold text-white hover:brightness-105"
                >
                  Browse store
                </Link>
                <Link
                  href="/request-pricing"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#e3e3e0] px-4 py-2 text-sm font-semibold text-ink hover:bg-[#fafaf8]"
                >
                  Request pricing
                </Link>
              </div>
            </div>
          ) : matchedProducts.length === 0 ? (
            <div className="rounded-xl border border-[#e3e3e0] bg-white p-5 text-sm text-neutral-600">
              No published listings match your answers yet. Browse the store as operators publish more, or request pricing for
              your program.
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/store"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--color-accent-orange)] px-4 py-2 text-sm font-bold text-white hover:brightness-105"
                >
                  Browse store
                </Link>
                <Link
                  href="/request-pricing"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#e3e3e0] px-4 py-2 text-sm font-semibold text-ink hover:bg-[#fafaf8]"
                >
                  Request pricing
                </Link>
              </div>
            </div>
          ) : (
            <div key={matchedProductsKey} className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {matchedProducts.map((product) => (
                <StoreProductCard key={product.id} product={product} surface="light" />
              ))}
            </div>
          )}
        </div>

        <ul className="m-0 mt-6 grid grid-cols-1 gap-2 rounded-xl border border-[#e3e3e0] bg-white p-3 sm:grid-cols-2 lg:mt-7 lg:grid-cols-4">
          {[
            "Recommendations based on operational context",
            "Standards aligned",
            "Use-case specific",
            "Guidance—not automated purchasing",
          ].map((t) => (
            <li key={t} className="flex list-none items-start gap-2 text-xs font-medium text-neutral-600">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent-orange)]" aria-hidden />
              {t}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-[11px] text-neutral-500">Your responses remain private and are used only to generate guidance.</p>
          <div className="flex flex-wrap gap-3">
            <HomeCtaLink href="/glove-finder" icon={ArrowRight}>
              Open glove finder
            </HomeCtaLink>
            <HomeCtaLink href="/request-pricing" variant="secondary">
              Request pricing
            </HomeCtaLink>
          </div>
        </div>
      </div>
    </ProcurementSectionShell>
  );
}

export { HomeGloveEducationHubClient };
