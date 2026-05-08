import type { NextRequest } from "next/server";
import type { RunInvoiceIntakeResult } from "@/lib/invoice/run-intake";
import { runInvoiceIntake, INVOICE_INTAKE_MAX_BYTES } from "@/lib/invoice/run-intake";
import type { ServerSupabase } from "@/lib/supabase/server";
import { logPublicFunnel } from "@/lib/observability/public-funnel-log";

/**
 * Shared multipart → runInvoiceIntake wiring for **POST /api/invoice/intake** (canonical).
 * Legacy **POST /api/ai/invoice/extract** rewrites to the same handler via `next.config.mjs` rewrites.
 */
export async function runInvoiceIntakeFromMultipart(
  request: NextRequest,
  supabase: ServerSupabase
): Promise<RunInvoiceIntakeResult> {
  const cl = request.headers.get("content-length");
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > INVOICE_INTAKE_MAX_BYTES) {
      logPublicFunnel("invoice_intake", "validate_rejected", {
        reason: "content_length_exceeds_max",
        content_length: n,
        max_bytes: INVOICE_INTAKE_MAX_BYTES,
      });
      return {
        ok: false,
        status: 413,
        body: {
          error: "File too large (max 10MB)",
          code: "FILE_TOO_LARGE",
        },
      };
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, status: 400, body: { error: "Invalid form data" } };
  }

  const file = formData.get("file") ?? formData.get("invoice");
  if (!file || typeof file === "string") {
    return { ok: false, status: 400, body: { error: "Missing file (field: file or invoice)" } };
  }

  const blob = file as Blob;
  let buffer: ArrayBuffer;
  try {
    buffer = await blob.arrayBuffer();
  } catch {
    return { ok: false, status: 400, body: { error: "Failed to read file" } };
  }

  const idempotencyKeyHeader =
    request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  const anonymousSession = formData.get("anonymous_session_id");
  return runInvoiceIntake({
    supabase,
    idempotencyKeyHeader,
    anonymousSessionId: typeof anonymousSession === "string" ? anonymousSession : null,
    file: {
      buffer: Buffer.from(buffer),
      filename: (file as File).name || "upload",
      mimeType: blob.type || "application/octet-stream",
    },
  });
}
