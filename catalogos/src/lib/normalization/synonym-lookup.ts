/**
 * Synonym lookup helpers: raw supplier value → normalized allowed value.
 * Uses optional DB-backed synonym map first, then in-memory; never invents values outside the dictionary.
 * Unknown values are reported as unmapped for review flags.
 * File: catalogos/src/lib/normalization/synonym-lookup.ts
 */

import { normalizeAttributeValue, normalizeToAllowed } from "@/lib/catalogos/synonym-normalize";

/** Optional: attribute_key -> (raw_lower -> normalized). From synonym provider getMap() or dictionary-service loadSynonymMap(). */
export type SynonymMapOption = Record<string, Record<string, string>> | null | undefined;

export interface LookupResult<T extends string> {
  value: T | undefined;
  normalizedRaw: string | undefined;
  unmapped: boolean;
}

/**
 * Look up a single-select attribute: raw value → allowed value using synonym map.
 * If result is not in allowedValues, returns value: undefined and unmapped: true (capture raw for flag).
 */
export function lookupAllowed<T extends string>(
  attributeKey: string,
  rawValue: string | number | null | undefined,
  allowedValues: readonly T[],
  synonymMap?: SynonymMapOption
): LookupResult<T> {
  const normalized = normalizeAttributeValue(attributeKey, rawValue, synonymMap);
  if (!normalized) return { value: undefined, normalizedRaw: undefined, unmapped: false };

  const allowedSet = new Set(allowedValues as unknown as string[]);
  if (allowedSet.has(normalized)) return { value: normalized as T, normalizedRaw: normalized, unmapped: false };

  const fromSynonym = normalizeToAllowed(attributeKey, rawValue, allowedValues, synonymMap);
  if (fromSynonym) return { value: fromSynonym, normalizedRaw: normalized, unmapped: false };

  return { value: undefined, normalizedRaw: normalized, unmapped: true };
}

/**
 * Capture unmapped raw value for review flag (do not store as attribute value).
 */
export function getUnmappedRaw(
  attributeKey: string,
  rawValue: string | number | null | undefined
): string | undefined {
  if (rawValue == null) return undefined;
  const s = String(rawValue).trim();
  return s ? s : undefined;
}
