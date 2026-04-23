import { describe, it, expect } from "vitest";
import { normalizeSearchQuery, matchesStagingSearchRow } from "./staging-search";
import type { StagingRow } from "./data";

function row(partial: Partial<StagingRow>): StagingRow {
  return {
    id: partial.id ?? "00000000-0000-0000-0000-000000000001",
    batch_id: partial.batch_id ?? "b1",
    raw_id: partial.raw_id ?? "r1",
    supplier_id: partial.supplier_id ?? "s1",
    normalized_data: partial.normalized_data ?? {},
    attributes: partial.attributes ?? {},
    match_confidence: partial.match_confidence ?? null,
    master_product_id: partial.master_product_id ?? null,
    status: partial.status ?? "pending",
    created_at: partial.created_at ?? new Date().toISOString(),
    ...partial,
  } as StagingRow;
}

describe("staging-search", () => {
  it("normalizeSearchQuery trims and lowercases", () => {
    expect(normalizeSearchQuery("  ABC ")).toBe("abc");
  });

  it("matches by name", () => {
    const r = row({ normalized_data: { name: "Nitrile Pro" } });
    expect(matchesStagingSearchRow(r, "nitrile")).toBe(true);
    expect(matchesStagingSearchRow(r, "latex")).toBe(false);
  });

  it("matches master_sku and supplier_name when enriched", () => {
    const r = row({
      normalized_data: { name: "x" },
      master_sku: "GLV-900",
      supplier_name: "Acme Supply",
    });
    expect(matchesStagingSearchRow(r, "900")).toBe(true);
    expect(matchesStagingSearchRow(r, "acme")).toBe(true);
  });

  it("matches staging id substring", () => {
    const r = row({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
    expect(matchesStagingSearchRow(r, "bbbb")).toBe(true);
  });

  it("empty query matches all", () => {
    expect(matchesStagingSearchRow(row({}), "")).toBe(true);
  });
});
