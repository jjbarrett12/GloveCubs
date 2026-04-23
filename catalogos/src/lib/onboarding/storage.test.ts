import { describe, it, expect } from "vitest";
import { ONBOARDING_BUCKET } from "./storage";

describe("onboarding storage", () => {
  it("uses private bucket name for supplier onboarding files", () => {
    expect(ONBOARDING_BUCKET).toBe("supplier-onboarding");
  });
});
