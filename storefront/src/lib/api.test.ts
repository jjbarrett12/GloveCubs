import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExpressCommerceApiUrl, getExpressCommerceApiOrigin } from "./api";

describe("getExpressCommerceApiOrigin / buildExpressCommerceApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trims and strips trailing slash from env", () => {
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", " https://api.glovecubs.com/ ");
    expect(getExpressCommerceApiOrigin()).toBe("https://api.glovecubs.com");
  });

  it("buildExpressCommerceApiUrl joins base and path", () => {
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");
    expect(buildExpressCommerceApiUrl("/api/config")).toBe("http://localhost:3004/api/config");
    expect(buildExpressCommerceApiUrl("api/config")).toBe("http://localhost:3004/api/config");
  });

  it("returns relative path when origin unset", () => {
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");
    expect(buildExpressCommerceApiUrl("/api/cart")).toBe("/api/cart");
  });
});
