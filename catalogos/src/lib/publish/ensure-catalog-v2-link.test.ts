import { describe, it, expect } from "vitest";
import { CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID } from "./ensure-catalog-v2-link";

describe("ensure-catalog-v2-link", () => {
  it("uses stable legacy_glove product_type id from migration prereqs", () => {
    expect(CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID).toBe("b1111111-1111-4111-8111-111111111111");
  });
});
