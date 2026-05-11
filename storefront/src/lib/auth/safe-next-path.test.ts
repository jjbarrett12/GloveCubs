import { describe, expect, it } from "vitest";
import { safeCommerceNextPath } from "./safe-next-path";

describe("safeCommerceNextPath", () => {
  it("defaults to /account", () => {
    expect(safeCommerceNextPath(undefined)).toBe("/account");
    expect(safeCommerceNextPath("")).toBe("/account");
  });
  it("allows same-origin relative paths", () => {
    expect(safeCommerceNextPath("/workspace/procurement")).toBe("/workspace/procurement");
    expect(safeCommerceNextPath("/store?q=1")).toBe("/store?q=1");
  });
  it("rejects open redirects", () => {
    expect(safeCommerceNextPath("//evil.com")).toBe("/account");
    expect(safeCommerceNextPath("https://evil.com")).toBe("/account");
    expect(safeCommerceNextPath("\\evil")).toBe("/account");
  });
});
