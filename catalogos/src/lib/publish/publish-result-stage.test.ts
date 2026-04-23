import { describe, it, expect } from "vitest";
import { classifyPublishErrorMessage } from "./publish-result-stage";

describe("classifyPublishErrorMessage", () => {
  it("classifies attribute sync", () => {
    expect(classifyPublishErrorMessage("Publish blocked: product_attributes sync failed (1 error(s)): x")).toBe("attribute_sync");
  });
  it("classifies snapshot", () => {
    expect(classifyPublishErrorMessage("Publish blocked: could not refresh product attributes snapshot (bad).")).toBe("snapshot");
  });
  it("classifies supplier offer", () => {
    expect(classifyPublishErrorMessage("Supplier offer: duplicate key")).toBe("supplier_offers");
  });
  it("classifies search sync", () => {
    expect(
      classifyPublishErrorMessage(
        "Publish not successful: live catalog and offers were updated but storefront search is NOT synced (x)."
      )
    ).toBe("search_sync");
  });
});
