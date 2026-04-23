import { describe, it, expect } from "vitest";
import { deriveExternalIdForParsedRow } from "./external-id";
import type { ParsedRow } from "./types";

describe("deriveExternalIdForParsedRow", () => {
  it("prefers id, then sku, then item_number, then product_id, then item, then index", () => {
    expect(deriveExternalIdForParsedRow({ id: "A" }, 9)).toBe("A");
    expect(deriveExternalIdForParsedRow({ sku: "S1" }, 0)).toBe("S1");
    expect(deriveExternalIdForParsedRow({ item_number: "IN" }, 0)).toBe("IN");
    expect(deriveExternalIdForParsedRow({ product_id: "P" }, 0)).toBe("P");
    expect(deriveExternalIdForParsedRow({ item: "IT" }, 0)).toBe("IT");
    expect(deriveExternalIdForParsedRow({}, 3)).toBe("3");
  });

  it("trims string ids", () => {
    expect(deriveExternalIdForParsedRow({ sku: "  x  " }, 0)).toBe("x");
  });

  it("uses row_N when trimmed id is empty", () => {
    expect(deriveExternalIdForParsedRow({ sku: "   " }, 7)).toBe("row_7");
  });

  it("coerces numeric-like ids to string", () => {
    expect(deriveExternalIdForParsedRow({ sku: 1001 } as ParsedRow, 0)).toBe("1001");
  });
});
