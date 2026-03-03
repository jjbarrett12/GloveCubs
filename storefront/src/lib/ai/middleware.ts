import { NextRequest } from "next/server";
import { checkRateLimit, getRateLimitIdentifier } from "./rateLimit";
import { logAiEvent } from "./telemetry";
import type { ServerSupabase } from "@/lib/supabase/server";

export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip") ?? null;
}

export function getUserId(request: NextRequest): string | null {
  // When auth exists: read from session/token
  return null;
}

export function checkAiRateLimit(request: NextRequest): { allowed: boolean; retryAfterMs?: number } {
  const ip = getClientIp(request);
  const userId = getUserId(request);
  const id = getRateLimitIdentifier(ip ?? "anon", userId);
  return checkRateLimit(id);
}

export async function withTelemetry<T>(params: {
  supabase: ServerSupabase | null;
  eventType: string;
  modelUsed: string | null;
  fn: () => Promise<{ data: T; usage?: { prompt_tokens: number; completion_tokens: number } }>;
}): Promise<{ data: T; usage?: { prompt_tokens: number; completion_tokens: number }; error?: string }> {
  const start = Date.now();
  try {
    const { data, usage } = await params.fn();
    const latencyMs = Date.now() - start;
    await logAiEvent(params.supabase, {
      event_type: params.eventType,
      model_used: params.modelUsed,
      tokens_estimate: usage ? usage.prompt_tokens + usage.completion_tokens : null,
      success: true,
      latency_ms: latencyMs,
      meta: null,
    });
    return { data, usage };
  } catch (e) {
    const latencyMs = Date.now() - start;
    await logAiEvent(params.supabase, {
      event_type: params.eventType,
      model_used: params.modelUsed,
      tokens_estimate: null,
      success: false,
      latency_ms: latencyMs,
      meta: { error: e instanceof Error ? e.message : "unknown" },
    });
    throw e;
  }
}
