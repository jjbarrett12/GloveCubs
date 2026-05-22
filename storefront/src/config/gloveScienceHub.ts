import type { LucideIcon } from "lucide-react";
import {
  Beaker,
  Factory,
  HeartPulse,
  Shield,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { getStoreHrefForIntent } from "@/lib/discovery/intent-routes";

export const GLOVE_SCIENCE_HERO = {
  sectionId: "overview",
  eyebrow: "THE SCIENCE OF GLOVES",
  headline: "Stop buying gloves by habit.",
  subheadline:
    "We break down glove materials, thickness, texture, certifications, and protection tradeoffs so buyers can choose the right glove profile, avoid overbuying, and reduce total cost.",
  primaryCta: { label: "Explore glove science", href: "#risk" },
  secondaryCta: { label: "Find the right glove", href: "/glove-finder" },
  visualCallouts: [
    { id: "texture", label: "Textured grip", position: "top-left" as const },
    { id: "material", label: "Material", position: "top-right" as const },
    { id: "thickness", label: "Thickness", position: "bottom-left" as const },
    { id: "cuff", label: "Cuff style", position: "bottom-right" as const },
  ],
} as const;

export type GloveScienceRiskCard = {
  id: string;
  title: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

export const GLOVE_SCIENCE_RISK_SECTION = {
  sectionId: "risk",
  title: "Choose by risk.",
  subtitle: "Start with your environment and the hazards your team actually faces.",
} as const;

export const GLOVE_SCIENCE_RISK_CARDS: GloveScienceRiskCard[] = [
  {
    id: "chemical",
    title: "Chemical Exposure",
    description: "Oils, solvents, cleaners, acids, and chemical splash risk.",
    href: getStoreHrefForIntent("store.gf.lab"),
    Icon: Beaker,
  },
  {
    id: "food",
    title: "Food Safety",
    description: "Food prep, handling, compliance, cross-contamination, and color coding.",
    href: "/industries/hospitality",
    Icon: UtensilsCrossed,
  },
  {
    id: "cut",
    title: "Cut & Abrasion",
    description: "Sharp edges, glass, metal, rough surfaces, and repeated handling.",
    href: getStoreHrefForIntent("store.gf.safety"),
    Icon: Shield,
  },
  {
    id: "medical",
    title: "Medical / Healthcare",
    description: "Exam use, procedures, biohazard exposure, chemo, and specialty ratings.",
    href: "/industries/healthcare",
    Icon: HeartPulse,
  },
  {
    id: "janitorial",
    title: "Cleaning & Janitorial",
    description: "Sanitation, degreasers, wet work, and frequent glove changes.",
    href: "/industries/janitorial",
    Icon: Sparkles,
  },
  {
    id: "industrial",
    title: "Industrial / General",
    description: "Maintenance, assembly, general handling, grip, and durability.",
    href: "/industries/industrial",
    Icon: Factory,
  },
];

export type DecodeHotspotPosition = {
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
};

export type DecodeHotspot = {
  id: string;
  label: string;
  shortLabel: string;
  title: string;
  description: string;
  mattersWhen: string;
  commonMistake: string;
  desktopPosition: DecodeHotspotPosition;
};

export const GLOVE_SCIENCE_DECODE_SECTION = {
  sectionId: "decode",
  title: "Decode the specs.",
  subtitle:
    "Glove specs only matter when they match the risk. Learn what material, thickness, texture, cuff style, and certifications actually tell you — and what they don’t.",
} as const;

export const DECODE_DEFAULT_HOTSPOT_ID = "material";

export const DECODE_HOTSPOTS: DecodeHotspot[] = [
  {
    id: "material",
    label: "Material",
    shortLabel: "Material",
    title: "Material",
    description:
      "The base polymer or fabric determines the glove’s core protection profile: chemical resistance, stretch, puncture behavior, and comfort.",
    mattersWhen: "You are comparing nitrile, vinyl, latex, poly, or coated safety gloves for different environments.",
    commonMistake: "Assuming all gloves of the same material perform the same.",
    desktopPosition: { top: "10%", left: "4%" },
  },
  {
    id: "thickness",
    label: "Thickness",
    shortLabel: "Thickness",
    title: "Thickness (mil)",
    description:
      "Mil thickness affects durability, feel, fatigue, and cost — but thicker is not automatically better.",
    mattersWhen: "Gloves are tearing, users are double-gloving, or tasks require longer wear time.",
    commonMistake: "Buying the thickest glove for every task.",
    desktopPosition: { top: "16%", right: "4%" },
  },
  {
    id: "texture",
    label: "Texture",
    shortLabel: "Texture",
    title: "Texture",
    description: "Texture changes grip performance, especially in wet, oily, or fast-paced environments.",
    mattersWhen: "Users handle food, tools, parts, chemicals, or slippery packaging.",
    commonMistake: "Ignoring grip and blaming the glove material.",
    desktopPosition: { top: "44%", left: "2%" },
  },
  {
    id: "cuff",
    label: "Cuff Style",
    shortLabel: "Cuff",
    title: "Cuff style",
    description: "The cuff affects donning, removal, wrist coverage, and splash protection.",
    mattersWhen: "Users need extended coverage, faster changes, or protection from drip/splash exposure.",
    commonMistake: "Treating cuff style as cosmetic.",
    desktopPosition: { bottom: "18%", left: "6%" },
  },
  {
    id: "powder-free",
    label: "Powder-Free",
    shortLabel: "Powder-free",
    title: "Powder-free",
    description:
      "Powder-free gloves reduce contamination concerns and are standard for most modern food, medical, and industrial applications.",
    mattersWhen: "Food safety, healthcare, clean handling, or residue control matters.",
    commonMistake: "Only checking price and ignoring contamination or residue risk.",
    desktopPosition: { bottom: "14%", right: "4%" },
  },
  {
    id: "certification",
    label: "Certification",
    shortLabel: "Certs",
    title: "Certification",
    description:
      "Certifications and standards help confirm whether a glove is appropriate for food contact, medical use, cut resistance, or specialty exposure.",
    mattersWhen: "Compliance, audits, safety programs, or regulated environments are involved.",
    commonMistake: "Assuming one certification means the glove is approved for every hazard.",
    desktopPosition: { top: "36%", right: "2%" },
  },
];

export type GloveScienceMyth = {
  id: string;
  myth: string;
  reality: string;
};

export const GLOVE_SCIENCE_MYTHS_SECTION = {
  sectionId: "mistakes",
  title: "Avoid common glove buying mistakes.",
  subtitle:
    "Most glove waste comes from buying by habit, color, or thickness instead of matching the glove to the real task.",
} as const;

export const GLOVE_SCIENCE_MYTHS: GloveScienceMyth[] = [
  {
    id: "thicker-better",
    myth: "Thicker gloves are always better.",
    reality:
      "Thickness can improve durability, but it can also reduce dexterity, increase fatigue, and raise cost. The right thickness depends on task length, exposure, and failure rate.",
  },
  {
    id: "one-glove",
    myth: "One glove can cover every job.",
    reality:
      "Most teams overspend when they use the highest-protection glove everywhere. Different tasks may need different glove profiles.",
  },
  {
    id: "black-stronger",
    myth: "Black gloves are stronger.",
    reality:
      "Color usually does not determine protection. Material, formulation, thickness, texture, and certification matter more.",
  },
  {
    id: "exam-chemical",
    myth: "Exam grade means chemical resistant.",
    reality:
      "Exam-grade gloves meet medical-use requirements, but that does not automatically make them suitable for every chemical exposure.",
  },
  {
    id: "cheapest-cost",
    myth: "The cheapest glove is the lowest-cost glove.",
    reality:
      "A glove that tears often, slows workers down, or causes double-gloving can cost more over time.",
  },
  {
    id: "texture-comfort",
    myth: "Texture is just a comfort feature.",
    reality:
      "Texture can materially affect grip, especially in wet, oily, food prep, cleaning, and industrial handling environments.",
  },
];

export const GLOVE_SCIENCE_FINDER_SECTION = {
  sectionId: "finder",
  title: "Find the right glove profile.",
  subtitle:
    "Answer a few practical questions and get a plain-English glove profile based on your task, exposure, and environment.",
} as const;

export const FINDER_STEP_COUNT = 5;

export const FINDER_STEPS = [
  {
    id: "industry",
    field: "industry" as const,
    question: "What best describes your work?",
    options: [
      { value: "foodservice", label: "Food service & prep" },
      { value: "cleaning", label: "Cleaning & janitorial" },
      { value: "healthcare", label: "Healthcare & clinical" },
      { value: "automotive", label: "Automotive & shop" },
      { value: "warehouse", label: "Warehouse & logistics" },
      { value: "industrial", label: "Industrial & maintenance" },
      { value: "general", label: "General / mixed tasks" },
    ],
  },
  {
    id: "exposure",
    field: "exposure" as const,
    question: "What are you protecting against?",
    options: [
      { value: "none", label: "General barrier only" },
      { value: "food", label: "Food contact & handling" },
      { value: "chemicals", label: "Chemicals & disinfectants" },
      { value: "biohazard", label: "Biohazard / fluids" },
      { value: "oils", label: "Oils & greases" },
      { value: "cuts", label: "Cuts & sharps" },
      { value: "abrasion", label: "Abrasion & rough surfaces" },
    ],
  },
  {
    id: "environment",
    field: "environment" as const,
    question: "What environment are the gloves used in?",
    options: [
      { value: "dry", label: "Mostly dry" },
      { value: "wet", label: "Wet / wash-down" },
      { value: "oily", label: "Oily surfaces" },
      { value: "mixed", label: "Mixed wet & dry" },
    ],
  },
  {
    id: "wearDuration",
    field: "wearDuration" as const,
    question: "How long are they worn?",
    options: [
      { value: "quick-change", label: "Quick changes (minutes)" },
      { value: "repeated-use", label: "Repeated use (shifts)" },
      { value: "extended-wear", label: "Extended wear" },
    ],
  },
  {
    id: "dexterity",
    field: "dexterity" as const,
    question: "What matters most?",
    options: [
      { value: "high", label: "Dexterity & tactile feel" },
      { value: "balanced", label: "Balanced protection" },
      { value: "durability-first", label: "Durability first" },
    ],
  },
] as const;

export const GLOVE_SCIENCE_GUIDES_SECTION = {
  sectionId: "guides",
  title: "Thickness and cut resistance, simplified.",
  subtitle: "Use thickness and cut levels as decision tools — not as shortcuts for “better.”",
} as const;

export const GLOVE_SCIENCE_OPTIMIZE_SECTION = {
  sectionId: "optimize",
  title: "Save money without reducing protection.",
  subtitle:
    "The goal is not to buy the cheapest glove. The goal is to stop using more protection than the task requires.",
  overprotected: {
    title: "Overprotected",
    points: [
      "Same heavy glove used for every task",
      "Higher cost per change",
      "Lower dexterity",
      "More hand fatigue",
      "Protection may exceed the actual risk",
    ],
  },
  optimized: {
    title: "Optimized",
    points: [
      "Right glove profile by task",
      "Lower waste",
      "Better comfort",
      "Fewer unnecessary upgrades",
      "Protection matched to real exposure",
    ],
  },
  cta: {
    headline: "Ready to find the right glove profile?",
    primary: { label: "Find the right glove", href: "/glove-finder" },
    secondary: { label: "Start at the top", href: "#overview" },
  },
} as const;

export const GLOVE_SCIENCE_LIBRARY_SECTION = {
  sectionId: "library",
  title: "Explore the glove science library.",
  subtitle:
    "Plain-English guides for buyers who want to understand protection, performance, and cost before choosing a glove.",
} as const;
