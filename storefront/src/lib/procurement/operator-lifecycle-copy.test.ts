import { describe, expect, it } from "vitest";
import { describeLifecycleStageForOperator } from "@/lib/procurement/operator-lifecycle-copy";

describe("describeLifecycleStageForOperator", () => {
  it("uses quote linked wording (not sent / delivered)", () => {
    const o = describeLifecycleStageForOperator("quote_linked");
    expect(o.label).toContain("linked");
    expect(o.nextHint.toLowerCase()).not.toContain("sent");
  });

  it("explains sales_follow_up without implying procurement is complete", () => {
    const o = describeLifecycleStageForOperator("sales_follow_up");
    expect(o.label).toMatch(/follow/i);
    expect(o.nextHint).toMatch(/human/i);
  });
});
