import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("URL staging dismiss route", () => {
  it("requires admin, only dismisses needs_review, updates to dismissed", () => {
    const p = join(__dirname, "../../api/products/url-staging/[stagingId]/dismiss/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain('review_status", "needs_review"');
    expect(s).toContain('"dismissed"');
    expect(s).not.toMatch(/auto.?publish|publish\(/i);
  });
});

describe("Admin products review page", () => {
  it("loads clipboard staging from listClipboardStaging and avoids fabricated metrics", () => {
    const p = join(__dirname, "page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("listClipboardStaging");
    expect(s).toContain("ProductReviewQueueClient");
    expect(s).not.toMatch(/jobCount|mockRows|fabricat.*\d/i);
  });
});
