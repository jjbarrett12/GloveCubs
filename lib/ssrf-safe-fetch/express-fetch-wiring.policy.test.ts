import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const PARSE = path.join(ROOT, "lib/parse-product-url.js");
const VALIDATE = path.join(ROOT, "lib/validate-image-urls.js");
const CJS = path.join(__dirname, "ssrf-safe-fetch.cjs");

describe("Express URL import SSRF wiring", () => {
  it("product URL parser uses shared SSRF-safe fetch, not redirect follow", () => {
    const src = readFileSync(PARSE, "utf8");
    expect(src).toContain("ssrf-safe-fetch/ssrf-safe-fetch.cjs");
    expect(src).not.toMatch(/redirect:\s*['"]follow['"]/);
  });

  it("image URL validator uses shared SSRF-safe fetch, not redirect follow", () => {
    const src = readFileSync(VALIDATE, "utf8");
    expect(src).toContain("ssrf-safe-fetch/ssrf-safe-fetch.cjs");
    expect(src).not.toMatch(/redirect:\s*['"]follow['"]/);
  });

  it("CJS SSRF helper uses manual redirects and a hop cap of 5", () => {
    const src = readFileSync(CJS, "utf8");
    expect(src).toContain('redirect: "manual"');
    expect(src).toContain("SSRF_MAX_REDIRECTS = 5");
  });
});
