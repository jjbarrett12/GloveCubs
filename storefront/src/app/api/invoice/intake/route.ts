import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { checkAiRateLimit } from "@/lib/ai/middleware";
import { runInvoiceIntakeFromMultipart } from "@/lib/invoice/run-intake-from-request";
import { logPublicFunnel } from "@/lib/observability/public-funnel-log";
import { isPublicAiEmergencyDisabled } from "@/lib/catalog/emergency-catalog-kill-switch";
import { guardPublicMultipartPost } from "@/lib/http/public-post-guard";
import { requireHumanBotId } from "@/lib/security/botid-gate";
import {
  checkPublicWriteRateLimit,
  PUBLIC_WRITE_LIMITS,
} from "@/lib/security/public-write-rate-limit";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const botGate = await requireHumanBotId({ route: "/api/invoice/intake" });
  if (!botGate.ok) return botGate.response;

  if (isPublicAiEmergencyDisabled()) {
    return NextResponse.json(
      {
        error: "Invoice analysis is temporarily unavailable. Please request pricing or contact sales.",
        emergencyDisabled: true,
      },
      { status: 503 },
    );
  }

  const writeLimited = checkPublicWriteRateLimit(
    request,
    PUBLIC_WRITE_LIMITS.invoiceIntake,
  );
  if (writeLimited) return writeLimited;

  const guarded = guardPublicMultipartPost(request, { maxBytes: 10 * 1024 * 1024 });
  if (guarded) return guarded;

  const rate = checkAiRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests", retryAfterMs: rate.retryAfterMs }, { status: 429 });
  }

  logPublicFunnel("invoice_intake", "canonical_post", {
    path: request.nextUrl.pathname,
    method: request.method,
  });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const result = await runInvoiceIntakeFromMultipart(request, supabase);

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const c = result.contract;
  return NextResponse.json(
    {
      ...c,
      vendor_name: c.vendor_name,
      invoice_number: c.invoice_number,
      invoice_date: c.invoice_date,
      total_amount: c.total_amount,
      lines: c.lines ?? [],
    },
    { status: result.status }
  );
}
