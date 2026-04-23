/**
 * Synonym provider service: single source of truth for attribute synonym normalization.
 * Loads from catalogos.attribute_value_synonyms joined with attribute_definitions (by attribute_key).
 * Uses in-memory cache with TTL; explicitly falls back to static map when DB is empty or fetch fails.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

/** Map: attribute_key -> (raw_value_lower -> normalized_value). */
export type SynonymMap = Record<string, Record<string, string>>;

const DEFAULT_TTL_MS = 60_000;

/**
 * Explicit fallback synonym map when DB is unavailable or returns no rows.
 * Used only when cache is empty and DB fetch fails or returns empty.
 * Kept in code solely as fallback; DB is the single source of truth when available.
 */
export function getFallbackSynonymMap(): SynonymMap {
  return {
    powder: {
      pf: "powder_free",
      "powder free": "powder_free",
      "powder-free": "powder_free",
      powderfree: "powder_free",
      "free of powder": "powder_free",
      powdered: "powdered",
    },
    grade: {
      "exam grade": "medical_exam_grade",
      exam: "medical_exam_grade",
      medical: "medical_exam_grade",
      "medical grade": "medical_exam_grade",
      foodservice: "food_service_grade",
      "food service": "food_service_grade",
      "food service grade": "food_service_grade",
      industrial: "industrial_grade",
      "industrial grade": "industrial_grade",
    },
    size: {
      lg: "l",
      xlrg: "xl",
      xlg: "xl",
      med: "m",
      sm: "s",
      "extra small": "xs",
      "extra large": "xl",
      "extra large large": "xxl",
    },
    color: {
      blk: "black",
      blu: "blue",
      wht: "white",
      grn: "green",
      gry: "gray",
      grey: "gray",
      "lt blue": "light_blue",
      "light blue": "light_blue",
    },
    hand_orientation: {
      ambi: "ambidextrous",
      ambidextrous: "ambidextrous",
    },
    packaging: {
      "1000/cs": "case_1000_ct",
      "1000 per case": "case_1000_ct",
      "1000/case": "case_1000_ct",
      "100 ct": "box_100_ct",
      "100/box": "box_100_ct",
      "100/ct": "box_100_ct",
      "200/box": "box_200_250_ct",
      "250/box": "box_200_250_ct",
      "2000+": "case_2000_plus_ct",
    },
  };
}

export interface SynonymProviderOptions {
  /** Cache TTL in milliseconds. Default 60_000. */
  ttlMs?: number;
  /** Use fallback when DB returns empty (default true). When false, empty DB returns {}. */
  useFallbackWhenEmpty?: boolean;
}

export interface SynonymProvider {
  /** Get current synonym map: from cache if valid, else DB; on DB failure or empty returns fallback when enabled. */
  getMap(): Promise<SynonymMap>;
  /** Normalize a raw value for an attribute using the current map (loads map if needed). */
  normalize(attributeKey: string, rawValue: string | number | null | undefined): Promise<string | undefined>;
  /** Invalidate cache so next getMap() refetches from DB. */
  invalidate(): void;
}

interface ProviderState {
  cache: SynonymMap | null;
  loadedAt: number;
}

/**
 * Load synonym map from catalogos.attribute_value_synonyms joined with attribute_definitions.
 * Returns map keyed by attribute_key (from attribute_definitions).
 */
async function loadSynonymMapFromDb(): Promise<SynonymMap> {
  const supabase = getSupabaseCatalogos(true);
  const { data: synRows, error: synErr } = await supabase
    .from("attribute_value_synonyms")
    .select("raw_value, normalized_value, attribute_definition_id")
    .limit(5000);
  if (synErr) throw new Error(synErr.message);
  if (!synRows?.length) return {};
  const defIds = [...new Set((synRows as { attribute_definition_id: string }[]).map((r) => r.attribute_definition_id))];
  const { data: defRows, error: defErr } = await supabase
    .from("attribute_definitions")
    .select("id, attribute_key")
    .in("id", defIds);
  if (defErr) throw new Error(defErr.message);
  const idToKey = new Map<string, string>();
  for (const d of defRows ?? []) {
    const row = d as { id: string; attribute_key: string };
    idToKey.set(row.id, row.attribute_key);
  }
  const map: SynonymMap = {};
  for (const r of synRows as { raw_value: string; normalized_value: string; attribute_definition_id: string }[]) {
    const key = idToKey.get(r.attribute_definition_id);
    if (!key) continue;
    if (!map[key]) map[key] = {};
    const rawLower = String(r.raw_value).trim().toLowerCase();
    map[key][rawLower] = r.normalized_value.trim();
  }
  return map;
}

/**
 * Create a synonym provider that uses the DB as single source of truth with TTL cache.
 * When cache is empty and DB fetch fails or returns no rows, returns explicit fallback map.
 */
export function createSynonymProvider(options: SynonymProviderOptions = {}): SynonymProvider {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const useFallbackWhenEmpty = options.useFallbackWhenEmpty !== false;
  const state: ProviderState = { cache: null, loadedAt: 0 };

  function isCacheValid(): boolean {
    return state.cache !== null && state.loadedAt > 0 && Date.now() - state.loadedAt < ttlMs;
  }

  return {
    async getMap(): Promise<SynonymMap> {
      if (isCacheValid() && state.cache) return state.cache;
      try {
        const map = await loadSynonymMapFromDb();
        if (Object.keys(map).length > 0) {
          state.cache = map;
          state.loadedAt = Date.now();
          return map;
        }
        if (useFallbackWhenEmpty) return getFallbackSynonymMap();
        state.cache = {};
        state.loadedAt = Date.now();
        return {};
      } catch {
        if (useFallbackWhenEmpty) return getFallbackSynonymMap();
        throw new Error("Synonym provider: DB fetch failed and fallback disabled");
      }
    },

    async normalize(
      attributeKey: string,
      rawValue: string | number | null | undefined
    ): Promise<string | undefined> {
      const map = await this.getMap();
      if (rawValue == null) return undefined;
      const raw = String(rawValue).trim().toLowerCase();
      if (!raw) return undefined;
      const byKey = map[attributeKey];
      if (byKey && byKey[raw] != null) return byKey[raw];
      return raw;
    },

    invalidate(): void {
      state.cache = null;
      state.loadedAt = 0;
    },
  };
}

let defaultProvider: SynonymProvider | null = null;

/** Default singleton provider (DEFAULT_TTL_MS, fallback when empty/fail). Use for normalization pipeline. */
export function getDefaultSynonymProvider(): SynonymProvider {
  if (!defaultProvider) defaultProvider = createSynonymProvider({});
  return defaultProvider;
}

/** Reset default provider (e.g. in tests). */
export function resetDefaultSynonymProvider(): void {
  defaultProvider = null;
}
