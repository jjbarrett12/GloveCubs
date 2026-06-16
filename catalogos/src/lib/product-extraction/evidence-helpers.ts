import type { ExtractionSource, FieldEvidence, FieldTrust } from "./types";

export function trustFromConfidence(confidence: number): FieldTrust {
  if (confidence >= 0.85) return "trusted";
  if (confidence >= 0.65) return "probable";
  if (confidence >= 0.4) return "weak";
  if (confidence > 0) return "missing";
  return "missing";
}

export function makeFieldEvidence<T>(
  value: T,
  confidence: number,
  source: ExtractionSource,
  extra?: Partial<Omit<FieldEvidence<T>, "value" | "confidence" | "trust" | "source">>
): FieldEvidence<T> {
  return {
    value,
    confidence,
    trust: extra?.trust ?? trustFromConfidence(confidence),
    source,
    ...extra,
  };
}

export function strVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && v !== null && "name" in v) {
    return strVal((v as { name?: unknown }).name);
  }
  return String(v).trim();
}

export function collectStrings(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") {
    const s = v.trim();
    return s ? [s] : [];
  }
  if (Array.isArray(v)) return v.flatMap(collectStrings);
  if (typeof v === "object" && v !== null && "@id" in v) return [];
  return [];
}
