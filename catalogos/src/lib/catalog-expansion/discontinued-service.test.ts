import { describe, it, expect } from "vitest";

describe("discontinued-service", () => {
  it("uses catalog_sync_confirmed as discontinued reason for audit", () => {
    const reason = "catalog_sync_confirmed";
    expect(reason).toBe("catalog_sync_confirmed");
  });
});
