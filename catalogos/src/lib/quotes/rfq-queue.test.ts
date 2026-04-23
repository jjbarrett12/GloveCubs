import { describe, it, expect } from "vitest";
import type { RfqQueueFilter } from "./types";

describe("rfq-queue", () => {
  it("RfqQueueFilter includes expected values", () => {
    const filters: RfqQueueFilter[] = ["all", "unassigned", "mine", "overdue", "urgent", "awaiting_response"];
    expect(filters).toHaveLength(6);
    expect(filters).toContain("unassigned");
    expect(filters).toContain("mine");
    expect(filters).toContain("overdue");
    expect(filters).toContain("urgent");
    expect(filters).toContain("awaiting_response");
  });
});
