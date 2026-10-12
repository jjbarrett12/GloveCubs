import { describe, expect, it } from "vitest";
import { INVOICE_EXTRACT_PROMPT, aiExtractInvoice } from "./provider";

describe("aiExtractInvoice PDF MIME", () => {
  it("never labels a PDF as image/png", async () => {
    expect(INVOICE_EXTRACT_PROMPT.toLowerCase()).not.toContain("image/png");
    const r = await aiExtractInvoice("AAAA", "image/png", "invoice.pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must not be labeled as image\/png/i);
  });

  it("rejects non-image non-pdf MIME instead of coercing to PNG", async () => {
    const r = await aiExtractInvoice("AAAA", "application/octet-stream", "file.bin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unsupported extract MIME/i);
  });
});
