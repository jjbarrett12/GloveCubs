import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { aiExtractInvoice } from "@/lib/ai/provider";
import { checkAiRateLimit } from "@/lib/ai/middleware";
import { logAiEvent } from "@/lib/ai/telemetry";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

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
  const allowed = ALLOWED_TYPES.includes(contentType) || contentType.startsWith("image/");
  if (!allowed && contentType !== "application/pdf") {
    return NextResponse.json({ error: "Allowed: image (JPEG/PNG/WebP) or PDF" }, { status: 400 });
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await blob.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to read file" }, { status: 400 });
  }
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = contentType.startsWith("image/") ? contentType : contentType === "application/pdf" ? "application/pdf" : "image/png";

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
      await writeFile(path.join(dir, name), Buffer.from(buffer));
    } catch {
      // ignore
    }

    await logAiEvent(supabase, {
      event_type: "invoice_extract",
      model_used: OPENAI_CHAT_MODEL,
      tokens_estimate: null,
      success: true,
      latency_ms: latencyMs,
      meta: { line_count: result.data.lines.length },
    }).catch(() => {});

    return NextResponse.json({
      vendor_name: result.data.vendor_name,
      invoice_number: result.data.invoice_number,
      total_amount: result.data.total_amount,
      lines: result.data.lines,
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
