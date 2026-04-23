import { describe, it, expect } from "vitest";
import type { LifecycleStatus } from "./lifecycle";

describe("lifecycle", () => {
  it("exports LifecycleStatus type with expected values", () => {
    const statuses: LifecycleStatus[] = [
      "pending",
      "promoted",
      "in_review",
      "approved",
      "published",
      "rejected",
      "superseded",
    ];
    expect(statuses).toContain("pending");
    expect(statuses).toContain("superseded");
  });
});
