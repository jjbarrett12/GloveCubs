import { describe, expect, it } from "vitest";
import { parseCustomerDetailTab } from "./admin-customer-detail-tabs";

describe("parseCustomerDetailTab", () => {
  it("defaults invalid or missing tab to overview", () => {
    expect(parseCustomerDetailTab(undefined)).toBe("overview");
    expect(parseCustomerDetailTab("")).toBe("overview");
    expect(parseCustomerDetailTab("nope")).toBe("overview");
  });

  it("accepts canonical tab ids case-insensitively", () => {
    expect(parseCustomerDetailTab("delivery")).toBe("delivery");
    expect(parseCustomerDetailTab("PRODUCTS")).toBe("products");
    expect(parseCustomerDetailTab("Activity")).toBe("activity");
  });
});
