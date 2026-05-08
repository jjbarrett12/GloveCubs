import { randomBytes } from "crypto";

export const BUYER_DISPLAY_REF_KEY = "buyer_display_ref" as const;

/** Opaque, non-sequential human-citable reference (no UUID exposed to buyers). */
export function generateBuyerDisplayRef(): string {
  const suffix = randomBytes(8).toString("hex").slice(0, 12).toUpperCase();
  return `GC-PREP-${suffix}`;
}

export function ensureBuyerDisplayRefInMetadata(metadata: Record<string, unknown> | null | undefined): {
  metadata: Record<string, unknown>;
  buyer_display_ref: string;
} {
  const base = { ...(metadata ?? {}) };
  const existing = base[BUYER_DISPLAY_REF_KEY];
  if (typeof existing === "string" && existing.trim().startsWith("GC-PREP-")) {
    return { metadata: base, buyer_display_ref: existing.trim() };
  }
  const buyer_display_ref = generateBuyerDisplayRef();
  return {
    metadata: { ...base, [BUYER_DISPLAY_REF_KEY]: buyer_display_ref },
    buyer_display_ref,
  };
}

export function readBuyerDisplayRefFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as Record<string, unknown>)[BUYER_DISPLAY_REF_KEY];
  return typeof v === "string" && v.trim().startsWith("GC-PREP-") ? v.trim() : null;
}
