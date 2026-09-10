import { describe, expect, it, vi } from "vitest";
import { persistInvoiceOriginal, INVOICE_ORIGINALS_BUCKET } from "@/lib/invoice/persist-original";

describe("persistInvoiceOriginal", () => {
  it("skips when the client has no storage API", async () => {
    const r = await persistInvoiceOriginal({
      supabase: {},
      companyId: "co-1",
      intakeId: "in-1",
      sha256: "abc",
      mime: "application/pdf",
      buffer: Buffer.from("%PDF"),
    });
    expect(r).toEqual({ stored: false, reason: "no_storage_client" });
  });

  it("uploads to a private tenant path and never returns a public URL", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const r = await persistInvoiceOriginal({
      supabase: {
        storage: {
          from: (bucket: string) => {
            expect(bucket).toBe(INVOICE_ORIGINALS_BUCKET);
            return { upload };
          },
        },
      },
      companyId: "co-1",
      intakeId: "in-9",
      sha256: "deadbeef",
      mime: "application/pdf",
      buffer: Buffer.from("%PDF"),
    });
    expect(r.stored).toBe(true);
    if (r.stored) {
      expect(r.bucket).toBe("invoice-originals");
      expect(r.path).toBe("co-1/in-9/deadbeef.pdf");
      expect(r.path).not.toMatch(/^https?:/i);
    }
    expect(upload).toHaveBeenCalledWith(
      "co-1/in-9/deadbeef.pdf",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf", upsert: false }),
    );
  });
});
