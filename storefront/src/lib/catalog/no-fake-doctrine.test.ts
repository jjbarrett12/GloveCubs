/**
 * No-fake doctrine test.
 *
 * Asserts that the customer-facing storefront catalog code does NOT contain
 * marketing strings that imply operational guarantees the platform cannot
 * truthfully make today (no live inventory, no real review system, no real
 * urgency signals, no real discounting).
 *
 * Scope:
 *   - storefront/src/components/store/**
 *   - storefront/src/app/store/**
 *
 * Out of scope:
 *   - admin pages (operator-only language)
 *   - test files (this file would self-match)
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = [
  path.join(SRC_ROOT, "components", "store"),
  path.join(SRC_ROOT, "app", "store"),
];

const FORBIDDEN: ReadonlyArray<{ needle: RegExp; label: string }> = [
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
      if (full.endsWith(".ts") || full.endsWith(".tsx")) yield full;
    }
  }
}

describe("no-fake doctrine — storefront catalog surface", () => {
  it("does not surface fake operational claims in components/store/** or app/store/**", () => {
    const violations: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walkTsFiles(dir)) {
        const text = readFileSync(file, "utf8");
        for (const rule of FORBIDDEN) {
          const m = rule.needle.exec(text);
          if (m) {
            const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
            violations.push(`${path.relative(SRC_ROOT, file)}:${lineNo}: forbidden "${rule.label}" (matched "${m[0]}")`);
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
