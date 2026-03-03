import type { ServerSupabase } from "@/lib/supabase/server";

export interface AiEventPayload {
  event_type: string;
  model_used: string | null;
  tokens_estimate: number | null;
  success: boolean;
  latency_ms: number | null;
  meta?: Record<string, unknown> | null;
}

export async function logAiEvent(
  supabase: ServerSupabase | null,
  payload: AiEventPayload
): Promise<void> {
  if (!supabase) return;
  try {
    const row = {
      event_type: payload.event_type,
      model_used: payload.model_used,
      tokens_estimate: payload.tokens_estimate,
      success: payload.success,
      latency_ms: payload.latency_ms,
      meta: payload.meta ?? null,
    };
    // ai_events table: use dynamic insert (table may not be in generated types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("ai_events").insert(row);
  } catch {
    // best-effort
  }
}
