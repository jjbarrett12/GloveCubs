import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("quote cart quicklist source banner (Phase D3)", () => {
  it("reads and clears quicklist session note alongside cart lifecycle", () => {
    const p = join(process.cwd(), "src/app/quote-cart/page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("readQuicklistQuoteSourceNote");
    expect(s).toContain("clearQuicklistQuoteSourceNote");
    expect(s).toContain("quicklist-quote-source-session");
  });
});
