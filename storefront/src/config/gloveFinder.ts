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
  label: string;
  description: string;
  Icon: LucideIcon;
}

export const GLOVE_FINDER_USE_CASES: UseCaseOption[] = [
  {
    id: "healthcare",
    label: "Healthcare & medical",
    description: "Exam, procedure, and patient-care gloves with compliance.",
    Icon: Stethoscope,
  },
  {
    id: "food-service",
    label: "Food service & restaurants",
    description: "Food-safe disposable and high-volume options.",
    Icon: UtensilsCrossed,
  },
  {
    id: "industrial",
    label: "Industrial & warehouse",
    description: "Durability, grip, and cut resistance for shop floor.",
    Icon: Factory,
  },
  {
    id: "automotive",
    label: "Automotive & shop",
    description: "Oil-resistant and mechanic-grade protection.",
    Icon: Car,
  },
  {
    id: "janitorial",
    label: "Janitorial & cleaning",
    description: "Chemical-resistant and sanitation-focused.",
    Icon: Sparkles,
  },
  {
    id: "lab",
    label: "Lab & chemical",
    description: "Chemical and solvent resistance, ASTM rated.",
    Icon: FlaskConical,
  },
  {
    id: "safety",
    label: "Safety & cut-resistant",
    description: "ANSI cut levels and impact protection.",
    Icon: ShieldCheck,
  },
  {
    id: "general",
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
