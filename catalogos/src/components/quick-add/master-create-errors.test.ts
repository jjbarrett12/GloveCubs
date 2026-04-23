import { describe, expect, it } from "vitest";
import { formatMasterProductCreateError } from "./master-create-errors";

describe("formatMasterProductCreateError", () => {
  it("maps duplicate SKU / unique violations to fixed copy with secondary", () => {
    const raw = 'duplicate key value violates unique constraint "products_sku_key"';
    const out = formatMasterProductCreateError(raw);
    expect(out.primary).toMatch(/That SKU already exists/);
    expect(out.secondary).toBe(raw);
  });

  it("passes through unrelated errors", () => {
    const raw = "category_id is invalid";
    const out = formatMasterProductCreateError(raw);
    expect(out.primary).toBe(raw);
    expect(out.secondary).toBeUndefined();
  });
});
