// Find My Glove: use cases for the premium B2B wizard.

import type { LucideIcon } from "lucide-react";
import {
  Stethoscope,
  UtensilsCrossed,
  Factory,
  Car,
  Sparkles,
  FlaskConical,
  ShieldCheck,
  Wind,
} from "lucide-react";

export interface UseCaseOption {
  id: string;
  /** Canonical discovery intent for “browse matches” store links. */
  storeIntentId: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

export const GLOVE_FINDER_USE_CASES: UseCaseOption[] = [
  {
    id: "healthcare",
    storeIntentId: "store.gf.healthcare",
    label: "Healthcare & medical",
    description: "Exam, procedure, and patient-care gloves with compliance.",
    Icon: Stethoscope,
  },
  {
    id: "food-service",
    storeIntentId: "store.gf.food-service",
    label: "Food service & restaurants",
    description: "Food-safe disposable and high-volume options.",
    Icon: UtensilsCrossed,
  },
  {
    id: "industrial",
    storeIntentId: "store.gf.industrial",
    label: "Industrial & warehouse",
    description: "Durability, grip, and cut resistance for shop floor.",
    Icon: Factory,
  },
  {
    id: "automotive",
    storeIntentId: "store.gf.automotive",
    label: "Automotive & shop",
    description: "Oil-resistant and mechanic-grade protection.",
    Icon: Car,
  },
  {
    id: "janitorial",
    storeIntentId: "store.gf.janitorial",
    label: "Janitorial & cleaning",
    description: "Chemical-resistant and sanitation-focused.",
    Icon: Sparkles,
  },
  {
    id: "lab",
    storeIntentId: "store.gf.lab",
    label: "Lab & chemical",
    description: "Chemical and solvent resistance, ASTM rated.",
    Icon: FlaskConical,
  },
  {
    id: "safety",
    storeIntentId: "store.gf.safety",
    label: "Safety & cut-resistant",
    description: "ANSI cut levels and impact protection.",
    Icon: ShieldCheck,
  },
  {
    id: "general",
    storeIntentId: "store.gf.general",
    label: "General purpose",
    description: "Multi-use disposable and light-duty options.",
    Icon: Wind,
  },
];

export const WIZARD_STEPS = [
  { id: "use-case", label: "Use case" },
  { id: "details", label: "Details" },
  { id: "results", label: "Results" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];
