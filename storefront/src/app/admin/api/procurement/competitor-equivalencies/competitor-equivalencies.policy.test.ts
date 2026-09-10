import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CREATE = path.resolve(__dirname, "route.ts");

describe("competitor equivalency create is never auto-approved", () => {
  it("inserts status candidate only", () => {
    const src = readFileSync(CREATE, "utf8");
    expect(src).toContain('status: "candidate"');
    expect(src).not.toMatch(/status:\s*parsed\.data\.status/);
    expect(src).toContain("Never accepted as approved");
  });
});
