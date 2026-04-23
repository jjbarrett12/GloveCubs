/**
 * Synonym normalization for ingestion.
 * Raw supplier text → normalized allowed value (machine-safe slug).
 * Single source of truth: use a map from the synonym provider (DB-backed with explicit fallback).
 * When no map is passed, uses getFallbackSynonymMap() so sync callers (e.g. tests) still resolve synonyms.
 */

import { getFallbackSynonymMap } from "./synonym-provider";

/** Synonym map shape: attribute_key -> (raw_lower -> normalized). From synonym-provider.getMap() or getFallbackSynonymMap(). */
export type SynonymMapInput = Record<string, Record<string, string>> | null | undefined;

/**
 * Normalize a raw value for a given attribute_key using the provided map.
 * Map should come from synonym provider (DB-backed); when undefined, uses explicit fallback so behavior is consistent.
 * Returns normalized value or the trimmed lowercased input if no synonym.
 */
export function normalizeAttributeValue(
  attributeKey: string,
  rawValue: string | number | null | undefined,
  synonymMap?: SynonymMapInput
): string | undefined {
  if (rawValue == null) return undefined;
  const raw = String(rawValue).trim().toLowerCase();
  if (!raw) return undefined;
  const map = synonymMap ?? getFallbackSynonymMap();
  if (map[attributeKey]?.[raw] != null) return map[attributeKey][raw];
  return raw;
}

/**
 * Normalize and coerce to allowed value when possible.
 * If raw is already an allowed value (after lowercasing), return it; else try synonym.
 */
export function normalizeToAllowed<T extends string>(
  attributeKey: string,
  rawValue: string | number | null | undefined,
  allowedValues: readonly T[],
  synonymMap?: SynonymMapInput
): T | undefined {
  const normalized = normalizeAttributeValue(attributeKey, rawValue, synonymMap);
  if (!normalized) return undefined;
  const allowedSet = new Set(allowedValues as unknown as string[]);
  if (allowedSet.has(normalized)) return normalized as T;
  return undefined;
}
