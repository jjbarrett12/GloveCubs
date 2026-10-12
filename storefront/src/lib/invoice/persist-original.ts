export const INVOICE_ORIGINALS_BUCKET = "invoice-originals";

export type PersistInvoiceOriginalInput = {
  supabase: {
    storage?: {
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Buffer,
          opts: { contentType: string; upsert: boolean },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  companyId: string | null;
  intakeId: string;
  sha256: string;
  mime: string;
  buffer: Buffer;
};

export type PersistInvoiceOriginalResult =
  | { stored: true; bucket: string; path: string }
  | { stored: false; reason: string };

function extForMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function persistInvoiceOriginal(input: PersistInvoiceOriginalInput): Promise<PersistInvoiceOriginalResult> {
  if (typeof input.supabase.storage?.from !== "function") {
    return { stored: false, reason: "no_storage_client" };
  }
  const tenant = input.companyId ?? "anonymous";
  const path = `${tenant}/${input.intakeId}/${input.sha256}.${extForMime(input.mime)}`;
  const { error } = await input.supabase.storage.from(INVOICE_ORIGINALS_BUCKET).upload(path, input.buffer, {
    contentType: input.mime,
    upsert: false,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/already exists|duplicate|409/i.test(msg)) {
      return { stored: true, bucket: INVOICE_ORIGINALS_BUCKET, path };
    }
    return { stored: false, reason: msg };
  }
  return { stored: true, bucket: INVOICE_ORIGINALS_BUCKET, path };
}
