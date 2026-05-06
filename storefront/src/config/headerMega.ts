import type { LucideIcon } from "lucide-react";
import { Car, Droplets, Factory, LayoutGrid, Stethoscope, UtensilsCrossed } from "lucide-react";
import { HEADER_INDUSTRY_NAV_ITEMS } from "@/config/publicNav";

export type IndustryMegaCard = {
  href: string;
  label: string;
  blurb: string;
  /** Tailwind gradient classes (from / to) */
  cardClass: string;
  Icon: LucideIcon;
};

const INDUSTRY_VISUAL: Record<string, { Icon: LucideIcon; cardClass: string; blurb: string }> = {
  "/industries": {
    Icon: LayoutGrid,
    cardClass: "from-[#1a1f2e] via-[#252b3d] to-[#FF7A00]/35",
    blurb: "Programs, guides, and cross-industry specs in one place.",
  },
  "/industries/healthcare": {
    Icon: Stethoscope,
    cardClass: "from-rose-950/90 via-slate-900 to-slate-950",
    blurb: "Exam-grade, chemo-rated, and compliance-forward sourcing.",
  },
  "/industries/janitorial": {
    Icon: Droplets,
    cardClass: "from-cyan-950/80 via-blue-950 to-slate-950",
    blurb: "High-turn buildings, mixed tasks, cost-per-door discipline.",
  },
  "/industries/hospitality": {
    Icon: UtensilsCrossed,
    cardClass: "from-amber-900/85 via-orange-950 to-neutral-950",
    blurb: "Food-contact, color programs, and front-of-house consistency.",
  },
  "/industries/industrial": {
    Icon: Factory,
    cardClass: "from-zinc-800 via-neutral-900 to-black",
    blurb: "ANSI, chemical, cut, and line-balance for production floors.",
  },
  "/store?q=automotive+gloves": {
    Icon: Car,
    cardClass: "from-slate-800 via-sky-950/80 to-slate-950",
    blurb: "Grip, solvents, and shop-ready disposables at case scale.",
  },
};

const FALLBACK = {
  Icon: LayoutGrid,
  cardClass: "from-slate-800 to-slate-950",
  blurb: "Case and pallet programs for your operation.",
};

export function getIndustryMegaCards(): IndustryMegaCard[] {
  return HEADER_INDUSTRY_NAV_ITEMS.map((item) => {
    const v = INDUSTRY_VISUAL[item.href] ?? FALLBACK;
    return { href: item.href, label: item.label, blurb: v.blurb, cardClass: v.cardClass, Icon: v.Icon };
  });
}
