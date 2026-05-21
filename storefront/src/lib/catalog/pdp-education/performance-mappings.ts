import type { GloveFamily, PerfLevel } from "@/lib/catalog/pdp-education/types";

export function clampLevel(v: number): PerfLevel {
  return Math.max(0, Math.min(2, Math.round(v))) as PerfLevel;
}

export function parseThicknessMil(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseAnsiCutIndex(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.toUpperCase().match(/A([1-9])/);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(raw.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 9 ? n : null;
}

export const DISPOSABLE_PERF_KEYS = [
  { key: "barrier", label: "Barrier protection" },
  { key: "dexterity", label: "Dexterity" },
  { key: "chemical", label: "Chemical orientation" },
  { key: "puncture", label: "Puncture resistance" },
  { key: "comfort", label: "Comfort" },
  { key: "grip", label: "Grip" },
] as const;

export const REUSABLE_PERF_KEYS = [
  { key: "cut", label: "Cut resistance" },
  { key: "abrasion", label: "Abrasion" },
  { key: "grip", label: "Grip" },
  { key: "dexterity", label: "Dexterity" },
  { key: "durability", label: "Durability" },
  { key: "comfort", label: "Comfort" },
] as const;

export const GENERAL_PERF_KEYS = [
  { key: "barrier", label: "Barrier" },
  { key: "dexterity", label: "Dexterity" },
  { key: "grip", label: "Grip" },
  { key: "comfort", label: "Comfort" },
] as const;

export function perfKeysForFamily(family: GloveFamily) {
  if (family === "reusable") return REUSABLE_PERF_KEYS;
  if (family === "disposable" || family === "chemical") return DISPOSABLE_PERF_KEYS;
  return GENERAL_PERF_KEYS;
}
