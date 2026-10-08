import { describe, expect, it } from "vitest";
import { sameStagingRowVersion } from "./staging-row-version";

describe("staging row version", () => {
  it("treats a pg Date and the millisecond ISO string as the same instant", () => {
    const current = new Date("2026-10-05T16:15:53.001Z");
    expect(sameStagingRowVersion(current, "2026-10-05T16:15:53.001Z")).toBe(true);
    expect(sameStagingRowVersion(current, current.toISOString())).toBe(true);
  });

  it("treats a microsecond Postgres string and the truncated page value as the same millisecond", () => {
    expect(sameStagingRowVersion("2026-10-05T16:15:53.001285+00:00", "2026-10-05T16:15:53.001Z")).toBe(true);
  });

  it("rejects a genuinely newer row", () => {
    const current = new Date("2026-10-05T16:15:53.002Z");
    expect(sameStagingRowVersion(current, "2026-10-05T16:15:53.001Z")).toBe(false);
  });
});
