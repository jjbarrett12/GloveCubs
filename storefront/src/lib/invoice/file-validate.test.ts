import { describe, expect, it } from "vitest";
import { countPdfPages, minimalPdfBuffer, validateInvoiceUpload } from "./file-validate";

describe("invoice file validation", () => {
  it("accepts a valid PDF and never sniffs it as PNG", () => {
    const buf = minimalPdfBuffer(1);
    const r = validateInvoiceUpload(buf);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe("application/pdf");
      expect(r.mime).not.toBe("image/png");
    }
  });

  it("counts multi-page PDFs", () => {
    const buf = minimalPdfBuffer(3);
    expect(countPdfPages(buf)).toBe(3);
    const r = validateInvoiceUpload(buf);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pdfPageCount).toBe(3);
  });

  it("rejects over-page-limit PDFs without calling extract", () => {
    const buf = minimalPdfBuffer(9);
    const r = validateInvoiceUpload(buf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PDF_TOO_MANY_PAGES");
  });

  it("rejects oversized buffers", () => {
    const buf = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    const r = validateInvoiceUpload(buf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects malformed / disguised files", () => {
    const exe = Buffer.from("MZ\x90\x00this is not an image");
    const r = validateInvoiceUpload(exe);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("accepts JPEG magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const r = validateInvoiceUpload(jpeg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe("image/jpeg");
  });
});
