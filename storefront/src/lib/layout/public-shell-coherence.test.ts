/**
 * Public shell coherence (Slice 1B).
 * Static checks that canonical chrome is wired — no duplicate inline headers on unified routes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("public shell coherence (Slice 1B)", () => {
  it("PublicSubpageShell uses canonical chrome without inline header", () => {
    const s = read("components/layout/PublicSubpageShell.tsx");
    expect(s).toContain("PublicExperienceChrome");
    expect(s).not.toMatch(/<header className="border-b border-white\/10">/);
  });

  it("PublicExperienceChrome provides header and footer once", () => {
    const s = read("components/layout/PublicExperienceChrome.tsx");
    expect(s).toContain("<SiteHeaderLoader />");
    expect(s).toContain("<SiteFooter />");
    expect((s.match(/<SiteHeaderLoader/g) ?? []).length).toBe(1);
    expect((s.match(/<SiteFooter/g) ?? []).length).toBe(1);
  });

  it("store, quote-cart, glove-finder, and invoice-savings layouts use PublicExperienceChrome", () => {
    for (const file of [
      "app/store/layout.tsx",
      "app/quote-cart/layout.tsx",
      "app/glove-finder/layout.tsx",
      "app/compare-wizard/layout.tsx",
      "app/invoice-savings/layout.tsx",
      "app/request-pricing/layout.tsx",
      "app/industries/layout.tsx",
    ]) {
      const s = read(file);
      expect(s, file).toContain("PublicExperienceChrome");
      expect(s, file).not.toContain("SiteHeaderLoader");
    }
  });

  it("invoice-savings and glove-finder pages omit duplicate inline GloveCubs headers", () => {
    const invoice = read("app/invoice-savings/page.tsx");
    const finder = read("app/glove-finder/page.tsx");
    const pdp = read("components/store/pdp/StorePdpContent.tsx");
    expect(invoice).not.toMatch(/<header className="border-b border-white\/10">/);
    expect(finder).not.toMatch(/<header className="border-b border-white\/10">/);
    expect(pdp).not.toMatch(/<header className="border-b border-white\/10">/);
    const industry = read("components/industry/IndustryLandingTemplate.tsx");
    expect(industry).not.toMatch(/<header className="border-b border-white\/10 sticky/);
  });

  it("workspace procurement layout includes shared header, footer, and account breadcrumb", () => {
    const s = read("app/workspace/procurement/layout.tsx");
    expect(s).toContain("SiteHeaderLoader");
    expect(s).toContain("SiteFooter");
    expect(s).toContain('href="/account"');
    expect(s).toContain('href="/account/quotes"');
    expect(s).toContain('href="/quote-cart"');
  });

  it("quote-cart success state links to account quote history", () => {
    const s = read("app/quote-cart/page.tsx");
    expect(s).toContain('href="/account/quotes"');
    expect(s).toContain("View quote history");
  });

  it("header uses quote request terminology in primary chrome", () => {
    const s = read("components/home/SiteHeader.tsx");
    expect(s).toContain("Quote request");
    expect(s).not.toContain("Invoice analysis");
    expect(s).toContain("Invoice review");
    expect(s).toContain("Guided Glove Finder");
  });
});
