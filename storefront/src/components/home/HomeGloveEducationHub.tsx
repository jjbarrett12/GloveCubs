"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Car,
  ChevronRight,
  Factory,
  Hand,
  HeartPulse,
  Pill,
  Route,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomeCtaLink, HomePanelLight } from "@/components/home/authority/HomeAuthorityPrimitives";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import {
  canAddProductRowToQuote,
  productRequiresSizeSelection,
  storeProductPdpVariantsAnchor,
} from "@/lib/catalog/store-quote-rules";
import { buildSurveyIndustryOptions } from "@/config/gloveEducationSurvey";
import {
  PERF_LEVEL_LABELS,
  SCIENCE_MOCKUP_PERF,
  type PerfLevel,
  type ScienceMockupPerfKey,
} from "@/config/gloveScienceLab";
import { EMPTY_SURVEY_INTAKE, type SurveyIntakeState } from "@/lib/education-hub/intake-types";
import type { EducationHubCatalogCandidate } from "@/lib/education-hub/survey-catalog-matches";
import {
  intakeToStoreCatalogFilters,
  rankScoredCatalogCandidates,
} from "@/lib/education-hub/survey-catalog-matches";
import { formatAttributeValueLabel } from "@/lib/catalog/attribute-value-labels";
import type { ProductImpactPerformance } from "@/lib/admin/derive-product-impact-performance";
import type { StoreProductRow } from "@/lib/catalog/store-products";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import { cn } from "@/lib/utils";

const DISCLAIMER =
  "Recommendations are educational guidance and should be validated against your operational, regulatory, and safety requirements.";

const IMG_PARAMS = "auto=format&fit=crop&w=600&h=600&q=80";

const PROGRAM_THUMBNAILS: Record<string, string> = {
  "gen-standard": `https://images.unsplash.com/photo-1579684385127-1ef15d508118?${IMG_PARAMS}`,
};

const STEP_COUNT = 10;
const SURVEY_INDUSTRY_OPTIONS = buildSurveyIndustryOptions();

/** Fixed lg height — survey and best-match cards stay aligned; inner regions scroll when needed. */
const EDUCATION_HUB_PAIR_CARD_HEIGHT = "lg:h-[min(44rem,76vh)]";

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
    title: "Do you need gloves for food contact?",
    subtitle: "Direct or indirect food contact in your process—documentation is verified per SKU.",
    options: [
      { value: "yes", label: "Yes — food contact", hint: "We will help source documented options" },
      { value: "no", label: "No food contact", hint: "Industrial or clinical environments" },
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

type ProgramHighlight = { icon: LucideIcon; title: string; body: string };

/** Upper bound of positive points in catalog scoring — used to normalize match % (rule-based, not ML). */
const SCORE_RUBRIC_MAX = 16;

function deriveMatchScorePercent(topScore: number, allScores: number[]): number {
  if (allScores.length === 0 || topScore <= 0) return 0;
  const maxInPool = Math.max(...allScores, 1);
  const poolRatio = topScore / maxInPool;
  const rubricRatio = Math.min(1, topScore / SCORE_RUBRIC_MAX);
  const blended = poolRatio * 0.45 + rubricRatio * 0.55;
  return Math.min(96, Math.max(68, Math.round(68 + blended * 28)));
}

function deriveMatchConfidence(percent: number): "High" | "Medium" | "Low" {
  if (percent >= 85) return "High";
  if (percent >= 75) return "Medium";
  return "Low";
}

function programImageUrl(programId: string): string {
  return PROGRAM_THUMBNAILS[programId] ?? PROGRAM_THUMBNAILS["gen-standard"];
}

const DEFAULT_IMPACT_PERFORMANCE: ProductImpactPerformance = {
  grip: 1,
  abrasion: 1,
  chemical: 1,
  cut: 1,
  comfort: 1,
  costPerUse: 1,
};

type BestMatchDisplay = {
  productId: string;
  name: string;
  imageUrl: string | null;
  description: string;
  matchScorePercent: number;
  matchConfidence: "High" | "Medium" | "Low";
  impactPerformance: ProductImpactPerformance;
  highlights: ProgramHighlight[];
};

function impactPerformanceForProduct(product: StoreProductRow): ProductImpactPerformance {
  return product.impactPerformance ?? DEFAULT_IMPACT_PERFORMANCE;
}

function deriveCatalogProductDescription(product: StoreProductRow): string {
  const material = product.materialHint?.trim();
  const use = product.commercialUseSummary?.trim();
  if (material && use) {
    return `${material} glove aligned for ${use.toLowerCase()} — verify specs on the published listing.`;
  }
  if (material) return `${material} glove from our published catalog — open the listing for full specs.`;
  const raw = product.description?.trim();
  if (raw && raw.length <= 140 && !/https?:\/\//i.test(raw)) return raw;
  return "Published catalog listing matched to your operational answers.";
}

function formatCertificationHints(hints: string[]): string {
  return hints
    .map((h) => (h.includes("_") ? formatAttributeValueLabel("certifications", h) : h))
    .filter(Boolean)
    .join(" · ");
}

function deriveCatalogProductHighlights(product: StoreProductRow): ProgramHighlight[] {
  const certLabels = formatCertificationHints(product.certificationHints);
  const foodSafe = product.certificationHints.some((c) => /food/i.test(c));
  const examGrade = product.certificationHints.some((c) => /exam|medical/i.test(c));

  const compliance: ProgramHighlight = foodSafe
    ? { icon: Pill, title: "Food-contact considerations", body: certLabels || "Verify documentation for your intended use." }
    : examGrade
      ? { icon: Pill, title: "Exam-grade barrier", body: certLabels || "Medical exam alignment." }
      : {
          icon: Pill,
          title: "Program compliance",
          body: certLabels || "Verify ratings on the listing.",
        };

  const comfortBody = product.protectionHint
    ? `${product.protectionHint} grip profile.`
    : product.materialHint
      ? `${product.materialHint} with balanced feel for mixed tasks.`
      : "Comfort-oriented disposable fit.";

  const durabilityBody = product.materialHint
    ? `${product.materialHint}${product.commercialUseSummary ? ` · ${product.commercialUseSummary}` : ""}.`
    : "Reliable barrier for everyday professional use.";

  return [
    compliance,
    { icon: Hand, title: "Comfortable fit", body: comfortBody },
    { icon: ShieldCheck, title: "Durable protection", body: durabilityBody },
  ];
}

function buildBestMatchDisplay(
  product: StoreProductRow,
  score: number,
  allScores: number[]
): BestMatchDisplay {
  return {
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    description: deriveCatalogProductDescription(product),
    matchScorePercent: deriveMatchScorePercent(score, allScores),
    matchConfidence: deriveMatchConfidence(deriveMatchScorePercent(score, allScores)),
    impactPerformance: impactPerformanceForProduct(product),
    highlights: deriveCatalogProductHighlights(product),
  };
}

const PERF_BAR_FILLS: Record<ScienceMockupPerfKey, string> = {
  grip: "linear-gradient(90deg, rgb(255 106 0 / 0.75), var(--color-accent-orange))",
  abrasion: "linear-gradient(90deg, rgb(245 158 11 / 0.75), rgb(251 191 36))",
  chemical: "linear-gradient(90deg, rgb(56 189 248 / 0.75), rgb(14 165 233))",
  cut: "linear-gradient(90deg, rgb(244 63 94 / 0.75), rgb(225 29 72))",
  comfort: "linear-gradient(90deg, rgb(167 139 250 / 0.75), rgb(139 92 246))",
  costPerUse: "linear-gradient(90deg, rgb(52 211 153 / 0.75), rgb(16 185 129))",
};

const PERF_VALUE_HIGH: Partial<Record<ScienceMockupPerfKey, string>> = {
  grip: "text-[var(--color-accent-orange)]",
  abrasion: "text-amber-400",
  chemical: "text-sky-400",
  cut: "text-rose-400",
  comfort: "text-violet-400",
  costPerUse: "text-emerald-400",
};

function ProgramHighlightItem({ icon: Icon, title, body }: ProgramHighlight) {
  return (
    <div className="flex gap-2.5">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04]"
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5 text-[var(--color-accent-orange)]" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-snug text-white">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-white/52">{body}</p>
      </div>
    </div>
  );
}

function SurveyPerfBar({ metricKey, label, level }: { metricKey: ScienceMockupPerfKey; label: string; level: PerfLevel }) {
  const width = level === 0 ? "33%" : level === 1 ? "66%" : "100%";
  const highClass = PERF_VALUE_HIGH[metricKey] ?? "text-[var(--color-accent-orange)]";

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-white/78">{label}</span>
        <span
          className={cn(
            "text-[9px] font-extrabold uppercase tracking-[0.06em]",
            level === 2 || (metricKey === "costPerUse" && level === 0) ? highClass : "text-white/45"
          )}
        >
          {PERF_LEVEL_LABELS[level]}
        </span>
      </div>
      <div className="h-[0.4rem] overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${label}: ${PERF_LEVEL_LABELS[level]}`}>
        <div className="h-full rounded-full" style={{ width, background: PERF_BAR_FILLS[metricKey] }} />
      </div>
    </div>
  );
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
        "relative h-full min-h-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#1a1a1a] via-[#141414] to-[#0a0a0a]",
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
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition duration-200",
        selected
          ? "border-[var(--color-accent-orange)] bg-[#fff8f3] shadow-[0_0_0_1px_rgb(255_106_0/0.22)]"
          : "border-[#e3e3e0] bg-white hover:border-[#d0d0cc] hover:bg-[#fafaf8]"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
          selected
            ? "border-[var(--color-accent-orange)]/25 bg-[var(--color-accent-orange)]/10 text-[var(--color-accent-orange)]"
            : "border-[#ebebea] bg-[#f4f4f2] text-neutral-500"
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-bold", selected ? "text-ink" : "text-neutral-800")}>{option.label}</span>
        {option.hint ? <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{option.hint}</span> : null}
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
          "relative h-full min-h-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#1a1a1a] via-[#141414] to-[#0a0a0a]",
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

function BestMatchCardActions({ product }: { product: StoreProductRow }) {
  const pdpHref = `/store/p/${encodeURIComponent(product.slug)}`;
  const selectSizeHref = storeProductPdpVariantsAnchor(product.slug);
  const showQuote = canAddProductRowToQuote(product);
  const needsSize = productRequiresSizeSelection(product);

  return (
    <div className="shrink-0 space-y-1.5 border-t border-white/10 px-4 py-2.5 sm:px-5">
      {needsSize ? (
        <Link
          href={selectSizeHref}
          className="flex h-10 w-full items-center justify-center rounded-lg bg-[var(--color-accent-orange)] text-xs font-bold text-white transition hover:brightness-105"
        >
          Select size
        </Link>
      ) : showQuote ? (
        <AddToQuoteButton product={product} className="h-10 w-full text-xs font-bold" />
      ) : (
        <Link
          href="/request-pricing"
          className="flex h-10 w-full items-center justify-center rounded-lg border border-white/20 text-xs font-semibold text-white/90 transition hover:border-white/35 hover:bg-white/5"
        >
          Request pricing
        </Link>
      )}
      <Link
        href={pdpHref}
        className="flex items-center justify-center gap-1 py-2 text-[10px] font-semibold text-white/55 transition hover:text-[var(--color-accent-orange)]"
      >
        View details
        <ChevronRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

function HomeGloveEducationHubClient({
  catalogCandidates,
  catalogUnavailable,
}: {
  catalogCandidates: EducationHubCatalogCandidate[];
  catalogUnavailable: boolean;
}) {
  const [step, setStep] = React.useState(0);
  const [intake, setIntake] = React.useState<SurveyIntakeState>(EMPTY_SURVEY_INTAKE);
  const [answeredStepIds, setAnsweredStepIds] = React.useState<Set<string>>(() => new Set());
  const [surveyComplete, setSurveyComplete] = React.useState(false);
  const resultsRef = React.useRef<HTMLDivElement>(null);

  const rankedScored = React.useMemo(
    () => rankScoredCatalogCandidates(catalogCandidates, intake, 9, answeredStepIds),
    [catalogCandidates, intake, answeredStepIds]
  );
  /** Best match is #1 in the hero panel; grid shows ranked options #2–#9. */
  const bestMatchProduct = rankedScored[0]?.product ?? null;
  const alternateProducts = React.useMemo(() => rankedScored.slice(1, 9).map((r) => r.product), [rankedScored]);
  const alternateProductsKey = alternateProducts.map((p) => p.id).join(",");
  const displayMatch = React.useMemo(() => {
    const top = rankedScored[0];
    if (!top?.product) return null;
    const allScores = rankedScored.map((r) => r.score);
    return buildBestMatchDisplay(top.product, top.score, allScores);
  }, [rankedScored]);

  const storeBrowseHref = React.useMemo(
    () => buildStoreCatalogHref(intakeToStoreCatalogFilters(intake)),
    [intake]
  );

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
      setAnsweredStepIds((prev) => {
        const next = new Set(prev);
        next.add(currentStep.id);
        return next;
      });
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
                Find the right glove — Faster
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

        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-7">
          <HomePanelLight
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden border-2 border-[var(--color-accent-orange)]/30 bg-gradient-to-br from-[#fff8f3] via-white to-[#fff5eb] p-0 shadow-[0_8px_36px_rgb(255_106_0/0.1)] ring-1 ring-[var(--color-accent-orange)]/10",
              EDUCATION_HUB_PAIR_CARD_HEIGHT
            )}
          >
            <div className="shrink-0 border-b border-[var(--color-accent-orange)]/15 bg-gradient-to-r from-[var(--color-accent-orange)]/10 via-[var(--color-accent-orange)]/5 to-transparent px-4 py-2.5 sm:px-5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent-orange)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_2px_10px_rgb(255_106_0/0.35)]">
                  Start here
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </span>
                <h3 className="text-sm font-extrabold tracking-tight text-ink sm:text-[15px]">Glove Finder</h3>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-neutral-500">
                <span>
                  Step {step + 1} of {STEP_COUNT}
                </span>
                <span>~60 seconds</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ebebea]">
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

            <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-5" role="group" aria-labelledby="quiz-question">
              <h3 id="quiz-question" className="mb-0.5 shrink-0 text-sm font-extrabold tracking-tight text-ink sm:text-base">
                {step + 1}. {currentStep.title}
              </h3>
              <p className="mb-2 shrink-0 text-xs text-neutral-500 sm:text-sm">{currentStep.subtitle}</p>
              <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:thin] max-lg:max-h-[min(28rem,55vh)]">
                <div
                  className={cn(
                    "pb-1",
                    currentStep.id === "industry" ? "grid grid-cols-1 gap-1.5 sm:grid-cols-2" : "flex flex-col gap-1.5"
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

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#ebebea] px-4 py-2.5 sm:px-5">
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
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-[0_4px_20px_rgb(255_106_0/0.28)] transition hover:brightness-105",
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
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-gradient-to-b from-[#111111] to-[#0a0a0a] text-white shadow-[0_16px_48px_rgb(0_0_0/0.22)]",
              EDUCATION_HUB_PAIR_CARD_HEIGHT
            )}
            aria-live="polite"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 sm:px-5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
                Recommended for you
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/90">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153/0.75)]"
                  aria-hidden
                />
                Live recommendation
              </span>
            </div>

            <div key={displayMatch?.productId ?? "pending-best"} className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent-orange)]">Best match</p>
                  <h3 className="mt-1 line-clamp-2 text-xl font-extrabold leading-tight tracking-tight text-white sm:text-2xl">
                    {displayMatch?.name ?? "Answer to see your best match…"}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/68">
                    {displayMatch?.description ??
                      "Your top pick updates live as you answer—same ranking logic as the cards below."}
                  </p>
                </div>
                <CatalogProductThumbnail
                  imageUrl={displayMatch?.imageUrl ?? bestMatchProduct?.imageUrl ?? programImageUrl("gen-standard")}
                  name={displayMatch?.name ?? "Recommended glove"}
                  className="aspect-square w-full max-w-[7rem] justify-self-end rounded-xl shadow-[0_8px_32px_rgb(0_0_0/0.45)] ring-1 ring-white/20 sm:max-w-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
              <div className="grid grid-cols-1 sm:grid-cols-[8.75rem_minmax(0,1fr)]">
                <div
                  className="flex flex-col justify-start border-b border-white/10 px-4 py-3 sm:border-b-0 sm:border-r sm:px-5 sm:py-4"
                  aria-label={`Rule-based match score ${displayMatch?.matchScorePercent ?? 0} percent`}
                >
                  <span className="text-[2.75rem] font-black leading-none tracking-tight text-emerald-400">
                    {displayMatch?.matchScorePercent ?? "—"}
                    {displayMatch ? "%" : null}
                  </span>
                  <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Match score</span>
                  {displayMatch ? (
                    <span className="mt-1 text-xs text-white/45">Confidence: {displayMatch.matchConfidence}</span>
                  ) : null}
                </div>

                <div className="flex flex-col px-4 py-3 sm:px-5">
                  <p className="mb-2 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
                    Recommended impact
                  </p>
                  <div key={displayMatch?.productId ?? "pending"} className="flex flex-col gap-2">
                    {SCIENCE_MOCKUP_PERF.map(({ key, label }) => (
                      <SurveyPerfBar
                        key={key}
                        metricKey={key}
                        label={label}
                        level={displayMatch?.impactPerformance[key] ?? DEFAULT_IMPACT_PERFORMANCE[key]}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-white/10 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-5 sm:px-5">
                {displayMatch ? (
                  <>
                    <div className="flex flex-col gap-3">
                      <ProgramHighlightItem {...displayMatch.highlights[0]} />
                      <ProgramHighlightItem {...displayMatch.highlights[1]} />
                    </div>
                    <ProgramHighlightItem {...displayMatch.highlights[2]} />
                  </>
                ) : (
                  <p className="text-sm text-white/55 sm:col-span-2">
                    Impact bars and highlights appear when a catalog listing becomes your top match.
                  </p>
                )}
              </div>
            </div>

            {bestMatchProduct ? <BestMatchCardActions product={bestMatchProduct} /> : null}

            <p className="shrink-0 border-t border-white/10 px-4 py-2 text-[10px] leading-snug text-white/40 sm:px-5">{DISCLAIMER}</p>
          </div>
        </div>

        <div ref={resultsRef} className="mt-8 min-w-0 scroll-mt-24 lg:mt-9" aria-live="polite">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="text-lg font-extrabold text-ink sm:text-xl">Recommended operational fits</h4>
              <p className="mt-1.5 text-sm text-neutral-500">
                Ranked options #2–#9 from your answers—the #1 match is shown above. Open any card for specs, variants, and
                add-to-quote.
              </p>
            </div>
            {rankedScored.length > 0 ? (
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
          ) : alternateProducts.length === 0 ? (
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
            <div key={alternateProductsKey} className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {alternateProducts.map((product, index) => (
                <StoreProductCard
                  key={product.id}
                  product={product}
                  surface="light"
                  rankLabel={`#${index + 2}`}
                />
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
