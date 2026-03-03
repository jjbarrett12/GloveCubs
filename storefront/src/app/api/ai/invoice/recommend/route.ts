import { NextRequest, NextResponse } from "next/server";
import { invoiceRecommendRequestSchema } from "@/lib/ai/schemas";
import { aiInvoiceSavings } from "@/lib/ai/provider";
import { checkAiRateLimit } from "@/lib/ai/middleware";
import { logAiEvent } from "@/lib/ai/telemetry";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveProducts } from "@/lib/gloves/queries";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const rate = checkAiRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterMs: rate.retryAfterMs },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = invoiceRecommendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  let supabase = null;
  let catalog: Awaited<ReturnType<typeof getActiveProducts>> = [];
  try {
    supabase = createServerSupabase();
    if (supabase) catalog = await getActiveProducts(supabase);
  } catch {
    catalog = [];
  }

  const start = Date.now();
  try {
    const result = await aiInvoiceSavings(parsed.data.lines, catalog);
    const latencyMs = Date.now() - start;
    if (!result.ok) {
      await logAiEvent(supabase, {
        event_type: "invoice_recommend",
        model_used: OPENAI_CHAT_MODEL,
        tokens_estimate: null,
        success: false,
        latency_ms: latencyMs,
        meta: { error: result.error },
      }).catch(() => {});
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    await logAiEvent(supabase, {
      event_type: "invoice_recommend",
      model_used: OPENAI_CHAT_MODEL,
      tokens_estimate: null,
      success: true,
      latency_ms: latencyMs,
      meta: { swaps_count: result.data.swaps.length },
    }).catch(() => {});

    return NextResponse.json({
      total_current_estimate: result.data.total_current_estimate,
      total_recommended_estimate: result.data.total_recommended_estimate,
      estimated_savings: result.data.estimated_savings,
      swaps: result.data.swaps,
    });
  } catch (e) {
    const latencyMs = Date.now() - start;
    await logAiEvent(supabase, {
      event_type: "invoice_recommend",
      model_used: OPENAI_CHAT_MODEL,
      tokens_estimate: null,
      success: false,
      latency_ms: latencyMs,
      meta: { error: e instanceof Error ? e.message : "unknown" },
    }).catch(() => {});
    const message = e instanceof Error ? e.message : "Recommendation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
