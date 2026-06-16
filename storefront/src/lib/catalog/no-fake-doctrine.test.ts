/**
 * No-fake / procurement-truth doctrine tests.
 *
 * Asserts customer-facing storefront copy does NOT imply operational guarantees
 * the platform cannot truthfully make today (inventory, urgency, fake AI commerce,
 * recurring auto-ship, instant checkout discounts, unqualified fulfillment SLAs).
 *
 * Scan scopes (Slice 1A):
 *   - storefront catalog surfaces (original)
 *   - home, header, public config, industries, glove finder, quote cart, resources
 *
 * Out of scope:
 *   - admin pages (operator-only language)
 *   - test files (this file would self-match)
 *
 * Line allowlist: honest negations and anti-checkout copy must not fail the scanner.
 * Example: "not a one-click purchase", "not checkout", "consumer checkout".
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve(__dirname, "../..");

const CATALOG_SCAN_DIRS = [
  path.join(SRC_ROOT, "components", "store"),
  path.join(SRC_ROOT, "app", "store"),
];

const PROCUREMENT_TRUTH_SCAN_DIRS = [
  path.join(SRC_ROOT, "components", "home"),
  path.join(SRC_ROOT, "components", "header"),
  path.join(SRC_ROOT, "config"),
  path.join(SRC_ROOT, "app", "glove-finder"),
  path.join(SRC_ROOT, "app", "quote-cart"),
  path.join(SRC_ROOT, "app", "resources"),
  path.join(SRC_ROOT, "components", "industry"),
  path.join(SRC_ROOT, "components", "layout"),
  path.join(SRC_ROOT, "app", "faq"),
  path.join(SRC_ROOT, "app", "contact"),
  path.join(SRC_ROOT, "app", "order-status"),
];

/** Skip lines that explicitly deny fake commerce (avoid brittle false positives). */
const LINE_ALLOWLIST: RegExp[] = [
  /not a one[- ]click/i,
  /not one click/i,
  /not checkout/i,
  /not implied at checkout/i,
  /not self-serve checkout/i,
  /consumer checkout/i,
  /without consumer checkout/i,
  /get confused with checkout/i,
  /card checkout/i,
];

const FAKE_COMMERCE_FORBIDDEN: ReadonlyArray<{ needle: RegExp; label: string }> = [
  { needle: /\bIn stock\b/i, label: "In stock" },
  { needle: /\bShips tomorrow\b/i, label: "Ships tomorrow" },
  { needle: /\bBest seller\b/i, label: "Best seller" },
  { needle: /\b\d+\s+reviews?\b/i, label: "<N> reviews" },
  { needle: /\(\s*\d+\s+reviews?\s*\)/i, label: "(<N> reviews)" },
  { needle: /\d+%\s*off\b/i, label: "<N>% off" },
  { needle: /\bLimited time\b/i, label: "Limited time" },
  { needle: /\bPeople are viewing\b/i, label: "People are viewing" },
  { needle: /\bOnly\s+\d+\s+left\b/i, label: "Only N left" },
  { needle: /\bSelling fast\b/i, label: "Selling fast" },
];

/** Slice 1A procurement-truth phrases — marketing overclaims removed in spec. */
const PROCUREMENT_TRUTH_FORBIDDEN: ReadonlyArray<{ needle: RegExp; label: string }> = [
  { needle: /\b1,000\+|\b1000\+/i, label: "1,000+ SKU claim" },
  { needle: /\brecurring orders?\b/i, label: "recurring order(s)" },
  { needle: /\bone click\b|\bone-click reorder\b/i, label: "one-click reorder" },
  { needle: /\binstant discount/i, label: "instant discount" },
  { needle: /\bcheckout now\b/i, label: "checkout now" },
  { needle: /\bAI Glove Finder\b/i, label: "AI Glove Finder" },
  { needle: /\bAI-assisted\b/i, label: "AI-assisted" },
  { needle: /\bReplenishment planning\b/i, label: "Replenishment planning" },
  { needle: /\bDedicated procurement reps?\b/i, label: "Dedicated procurement rep(s)" },
  { needle: /\bFast nationwide fulfillment\b/i, label: "Fast nationwide fulfillment" },
  ...FAKE_COMMERCE_FORBIDDEN,
];

function* walkTsFiles(root: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (st.isFile()) {
      if (full.endsWith(".test.ts") || full.endsWith(".test.tsx")) continue;
      if (full.endsWith(".policy.test.ts")) continue;
      if (full.endsWith(".ts") || full.endsWith(".tsx")) yield full;
    }
  }
}

function lineAllowed(line: string): boolean {
  return LINE_ALLOWLIST.some((re) => re.test(line));
}

function scanDirs(
  dirs: string[],
  forbidden: ReadonlyArray<{ needle: RegExp; label: string }>,
): string[] {
  const violations: string[] = [];
  for (const dir of dirs) {
    for (const file of walkTsFiles(dir)) {
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (lineAllowed(line)) continue;
        for (const rule of forbidden) {
          rule.needle.lastIndex = 0;
          const m = rule.needle.exec(line);
          if (m) {
            violations.push(
              `${path.relative(SRC_ROOT, file)}:${i + 1}: forbidden "${rule.label}" (matched "${m[0]}")`,
            );
          }
        }
      }
    }
  }
  return violations;
}

describe("no-fake doctrine — storefront catalog surface", () => {
  it("does not surface fake operational claims in components/store/** or app/store/**", () => {
    const violations = scanDirs(CATALOG_SCAN_DIRS, FAKE_COMMERCE_FORBIDDEN);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

describe("procurement-truth doctrine — public messaging (Slice 1A)", () => {
  it("does not surface forbidden overclaims in home, header, config, and quote paths", () => {
    const violations = scanDirs(PROCUREMENT_TRUTH_SCAN_DIRS, PROCUREMENT_TRUTH_FORBIDDEN);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("uses approved Guided Glove Finder wording in resources and FAQ metadata", () => {
    const resources = readFileSync(path.join(SRC_ROOT, "app/resources/page.tsx"), "utf8");
    const faq = readFileSync(path.join(SRC_ROOT, "app/faq/page.tsx"), "utf8");
    const layout = readFileSync(path.join(SRC_ROOT, "app/glove-finder/layout.tsx"), "utf8");
    const hero = readFileSync(path.join(SRC_ROOT, "components/home/HomeHeroExpress.tsx"), "utf8");

    expect(resources).toContain("Guided Glove Finder");
    expect(resources).not.toMatch(/\bAI Glove Finder\b/i);
    expect(faq).toContain("Guided Glove Finder");
    expect(layout).toContain("Guided Glove Finder");
    expect(hero).toContain("Catalog-backed SKUs");
    expect(hero).not.toMatch(/\b1,000\+|\b1000\+/i);
  });

  it("header trust strip uses qualified procurement language", () => {
    const strip = readFileSync(path.join(SRC_ROOT, "components/header/HeaderTrustStrip.tsx"), "utf8");
    expect(strip).toContain("lead times per quote");
    expect(strip).not.toMatch(/\bFast nationwide fulfillment\b/i);
    expect(strip).not.toMatch(/\bDedicated procurement reps?\b/i);
  });
});
