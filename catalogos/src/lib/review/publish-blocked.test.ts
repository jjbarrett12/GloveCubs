/**
 * Tests for isPublishBlocked: earlier validation signals and blocked-row prevention.
 */

import { describe, it, expect } from "vitest";
import { isPublishBlocked } from "./publish-blocked";
import type { StagingRow } from "./data";

function row(overrides: Partial<StagingRow> & { master_product_id?: string | null; normalized_data?: Record<string, unknown> }): StagingRow {
  return {
    id: "r1",
    batch_id: "b1",
    raw_id: "raw1",
    supplier_id: "s1",
    normalized_data: overrides.normalized_data ?? {},
    attributes: {},
    match_confidence: 0.9,
    master_product_id: overrides.master_product_id ?? "master-1",
    status: "approved",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("isPublishBlocked", () => {
  it("returns true when master_product_id is null", () => {
    expect(isPublishBlocked(row({ master_product_id: null }))).toBe(true);
  });

  it("returns true when normalized_data.name is missing", () => {
    expect(isPublishBlocked(row({ normalized_data: {} }))).toBe(true);
  });

  it("returns true when normalized_data.name is empty string", () => {
    expect(isPublishBlocked(row({ normalized_data: { name: "" } }))).toBe(true);
  });

  it("returns false when master_product_id and name are present", () => {
    expect(isPublishBlocked(row({ normalized_data: { name: "Glove X" } }))).toBe(false);
  });

  it("returns true when validation_errors array is non-empty", () => {
    expect(
      isPublishBlocked(
        row({
          normalized_data: { name: "Glove X", validation_errors: [{ code: "MISSING_ATTR", message: "material required" }] },
        })
      )
    ).toBe(true);
  });
});
