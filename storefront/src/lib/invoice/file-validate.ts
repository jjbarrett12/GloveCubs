/** Invoice upload MIME/size/PDF-page bounds. Do not trust client blob.type. */

export const INVOICE_INTAKE_MAX_BYTES = 10 * 1024 * 1024;
export const INVOICE_MAX_PDF_PAGES = 8;

export const INVOICE_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type InvoiceSniffedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type InvoiceFileValidation =
  | { ok: true; mime: InvoiceSniffedMime; pdfPageCount: number | null }
  | { ok: false; status: number; code: string; error: string };

function sniffMagic(buf: Buffer): InvoiceSniffedMime | null {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "application/pdf";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Count `/Type /Page` objects (not `/Pages`). Compressed PDFs may under-count. */
export function countPdfPages(buf: Buffer): number {
  const text = buf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?!\s*s)/g);
  return matches?.length ?? 0;
}

export function validateInvoiceUpload(buf: Buffer): InvoiceFileValidation {
  if (buf.length > INVOICE_INTAKE_MAX_BYTES) {
    return { ok: false, status: 413, code: "FILE_TOO_LARGE", error: "File too large (max 10MB)" };
  }
  if (buf.length < 8) {
    return { ok: false, status: 415, code: "UNSUPPORTED_MEDIA_TYPE", error: "File is empty or too small." };
  }
  const mime = sniffMagic(buf);
  if (!mime) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      error: "Allowed: JPEG, PNG, WebP, or PDF",
    };
  }
  if (mime === "application/pdf") {
    const pages = countPdfPages(buf);
    if (pages > INVOICE_MAX_PDF_PAGES) {
      return {
        ok: false,
        status: 413,
        code: "PDF_TOO_MANY_PAGES",
        error: `PDF has too many pages (max ${INVOICE_MAX_PDF_PAGES}).`,
      };
    }
    return { ok: true, mime, pdfPageCount: pages > 0 ? pages : null };
  }
  return { ok: true, mime, pdfPageCount: null };
}

/** Tiny valid-enough PDF for tests (one empty page). */
export function minimalPdfBuffer(pageCount = 1): Buffer {
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(" ");
  const pageObjs = Array.from({ length: pageCount }, (_, i) => {
    const id = 3 + i;
    return `${id} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;
  }).join("");
  const body =
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n${pageObjs}trailer\n<< /Root 1 0 R >>\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
