import { describe, expect, it } from "vitest";
import { publishFailureOperatorNextStep } from "./publish-failure-ui";

describe("publishFailureOperatorNextStep", () => {
  it("returns attribute guidance for attribute_sync", () => {
    expect(publishFailureOperatorNextStep("attribute_sync")).toMatch(/merchandising attributes/);
  });
  it("returns offer guidance for supplier_offers", () => {
    expect(publishFailureOperatorNextStep("supplier_offers")).toMatch(/case pricing/);
  });
  it("returns partial-update guidance for catalog_integrity", () => {
    expect(publishFailureOperatorNextStep("catalog_integrity")).toMatch(/partially updated/);
  });
});
