/**
 * Synonym provider tests: DB-backed as single source of truth, TTL cache, explicit fallback.
 * Run: npx vitest run src/lib/catalogos/synonym-provider.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getFallbackSynonymMap,
  createSynonymProvider,
  getDefaultSynonymProvider,
  resetDefaultSynonymProvider,
} from "./synonym-provider";
import { normalizeAttributeValue } from "./synonym-normalize";

describe("getFallbackSynonymMap", () => {
  it("returns map keyed by attribute_key with raw_lower -> normalized", () => {
    const map = getFallbackSynonymMap();
    expect(map.powder).toBeDefined();
    expect(map.powder?.pf).toBe("powder_free");
    expect(map.powder?.["powder free"]).toBe("powder_free");
    expect(map.size?.lg).toBe("l");
    expect(map.size?.med).toBe("m");
    expect(map.color?.blk).toBe("black");
    expect(map.packaging?.["1000/cs"]).toBe("case_1000_ct");
    expect(map.grade?.exam).toBe("medical_exam_grade");
  });

  it("is used by normalizeAttributeValue when no map passed (no drift)", () => {
    const fallback = getFallbackSynonymMap();
    expect(normalizeAttributeValue("powder", "pf", undefined)).toBe("powder_free");
    expect(normalizeAttributeValue("powder", "pf", fallback)).toBe("powder_free");
    expect(normalizeAttributeValue("size", "lg", undefined)).toBe("l");
  });
});

describe("createSynonymProvider", () => {
  it("getMap() returns a map that normalizes values (DB or fallback)", async () => {
    const provider = createSynonymProvider({ useFallbackWhenEmpty: true });
    const map = await provider.getMap();
    expect(map).toBeDefined();
    expect(typeof map).toBe("object");
    expect(map.powder?.pf).toBe("powder_free");
    expect(map.size?.lg).toBe("l");
    expect(map.packaging?.["1000/cs"]).toBe("case_1000_ct");
  });

  it("normalize() resolves using current map", async () => {
    const provider = createSynonymProvider({ useFallbackWhenEmpty: true });
    expect(await provider.normalize("powder", "pf")).toBe("powder_free");
    expect(await provider.normalize("size", "lg")).toBe("l");
    expect(await provider.normalize("color", "blk")).toBe("black");
    expect(await provider.normalize("material", "nitrile")).toBe("nitrile");
  });

  it("invalidate() clears cache so next getMap() refetches", async () => {
    const provider = createSynonymProvider({ ttlMs: 60_000, useFallbackWhenEmpty: true });
    const map1 = await provider.getMap();
    provider.invalidate();
    const map2 = await provider.getMap();
    expect(map2.powder?.pf).toBe("powder_free");
  });

});

describe("getDefaultSynonymProvider", () => {
  beforeEach(() => resetDefaultSynonymProvider());

  it("returns same provider instance", () => {
    const a = getDefaultSynonymProvider();
    const b = getDefaultSynonymProvider();
    expect(a).toBe(b);
  });

  it("getMap() returns synonym map usable by normalization", async () => {
    const map = await getDefaultSynonymProvider().getMap();
    expect(map.powder?.pf).toBe("powder_free");
    expect(normalizeAttributeValue("grade", "exam", map)).toBe("medical_exam_grade");
  });
});
