import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { aiExtractInvoice } from "@/lib/ai/provider";
import { checkAiRateLimit } from "@/lib/ai/middleware";
import { logAiEvent } from "@/lib/ai/telemetry";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai";
import { readRasterDimensions } from "@/lib/invoice/imageDimensions";
import { totalsNeedReview } from "@/lib/invoice/extractValidation";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const RASTER_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

const PDF_NOT_SUPPORTED_MESSAGE = "PDF upload is not supported yet. Please upload an image.";

/** Reject tiny uploads that are unlikely to contain readable invoice text. */
const MIN_FILE_BYTES = 2048;
/** Shortest edge must be at least this (raster only) for basic readability. */
const MIN_IMAGE_SHORT_EDGE_PX = 400;

const NO_LINES_MESSAGE = "We couldn't read this invoice. Please retake the photo.";

export async function POST(request: NextRequest) {
  const rate = checkAiRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests", retryAfterMs: rate.retryAfterMs }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = formData.get("file") ?? formData.get("invoice");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file (field: file or invoice)" }, { status: 400 });
  }
  const blob = file as Blob;
  if (blob.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }
  const contentType = blob.type || "application/octet-stream";
  if (contentType === "application/pdf") {
    return NextResponse.json({ error: PDF_NOT_SUPPORTED_MESSAGE }, { status: 400 });
  }
  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only image uploads are supported (e.g. JPEG, PNG, WebP)." },
      { status: 400 }
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await blob.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to read file" }, { status: 400 });
  }
  const buf = Buffer.from(buffer);
  if (buf.length < MIN_FILE_BYTES) {
    return NextResponse.json(
      { error: "This file is too small to read reliably. Please upload a larger, clearer image." },
      { status: 400 }
    );
  }

  const isKnownRasterMime =
    RASTER_MIMES.includes(contentType as (typeof RASTER_MIMES)[number]) || contentType === "image/jpg";

  if (contentType.startsWith("image/")) {
    const dims = readRasterDimensions(buf, contentType);
    if (dims) {
      const shortEdge = Math.min(dims.width, dims.height);
      if (shortEdge < MIN_IMAGE_SHORT_EDGE_PX) {
        return NextResponse.json(
          {
            error: `Image resolution is too low (${dims.width}×${dims.height}px). Please retake with a larger photo (short edge at least ${MIN_IMAGE_SHORT_EDGE_PX}px).`,
          },
          { status: 400 }
        );
      }
    } else if (isKnownRasterMime) {
      return NextResponse.json(
        {
          error:
            "Could not read image dimensions. Please use JPEG, PNG, or WebP, or try a different photo.",
        },
        { status: 400 }
      );
    }
  }

  const base64 = buf.toString("base64");
  const mimeType = contentType.startsWith("image/") ? contentType : "image/png";

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  }
  const supabase = getSupabaseAdmin();

  const start = Date.now();
  try {
    const result = await aiExtractInvoice(base64, mimeType);
    const latencyMs = Date.now() - start;
    if (!result.ok) {
      await logAiEvent(supabase, {
        event_type: "invoice_extract",
        model_used: OPENAI_CHAT_MODEL,
        tokens_estimate: null,
        success: false,
        latency_ms: latencyMs,
        meta: { error: result.error },
      }).catch(() => {});
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    try {
      const dir = path.join(os.tmpdir(), "glovecubs-invoice");
      await mkdir(dir, { recursive: true });
      const name = `${Date.now()}-${(file as File).name || "upload"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
      await writeFile(path.join(dir, name), buf);
    } catch {
      // ignore
    }

    if (!result.data.lines.length) {
      await logAiEvent(supabase, {
        event_type: "invoice_extract",
        model_used: OPENAI_CHAT_MODEL,
        tokens_estimate: null,
        success: false,
        latency_ms: latencyMs,
        meta: { error: "no_lines_after_extract" },
      }).catch(() => {});
      return NextResponse.json(
        { error: NO_LINES_MESSAGE, code: "NO_EXTRACTED_LINES" },
        { status: 422 }
      );
    }

    const totals_need_review = totalsNeedReview(result.data.total_amount, result.data.lines);

    await logAiEvent(supabase, {
      event_type: "invoice_extract",
      model_used: OPENAI_CHAT_MODEL,
      tokens_estimate: null,
      success: true,
      latency_ms: latencyMs,
      meta: { line_count: result.data.lines.length, totals_need_review },
    }).catch(() => {});

    return NextResponse.json({
      vendor_name: result.data.vendor_name,
      invoice_number: result.data.invoice_number,
      total_amount: result.data.total_amount,
      lines: result.data.lines,
      totals_need_review,
    });
  } catch (e) {
    const latencyMs = Date.now() - start;
    await logAiEvent(supabase, {
      event_type: "invoice_extract",
      model_used: OPENAI_CHAT_MODEL,
      tokens_estimate: null,
      success: false,
      latency_ms: latencyMs,
      meta: { error: e instanceof Error ? e.message : "unknown" },
    }).catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "Extraction failed" }, { status: 500 });
  }
}
