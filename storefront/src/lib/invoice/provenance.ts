export const FIELD_SOURCES = ["invoice", "parsed", "ai_inferred", "catalog", "operator"] as const;
export type FieldSource = (typeof FIELD_SOURCES)[number];

export type Provenanced<T> = {
  value: T | null;
  source: FieldSource | null;
  confidence: number | null;
};

export function provenanced<T>(value: T | null | undefined, source: FieldSource, confidence: number | null): Provenanced<T> {
  return { value: value ?? null, source: value == null ? null : source, confidence: value == null ? null : confidence };
}

export function pickAiThenParsed<T>(
  ai: T | null | undefined,
  parsed: T | null | undefined,
): Provenanced<T> {
  if (parsed != null && parsed !== ("" as T)) {
    return provenanced(parsed, "parsed", 0.8);
  }
  if (ai != null && ai !== ("" as T)) {
    return provenanced(ai, "ai_inferred", 0.6);
  }
  return { value: null, source: null, confidence: null };
}
