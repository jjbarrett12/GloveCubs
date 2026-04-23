/**
 * Production rate limiting for CatalogOS using shared DB tables (public.rate_limit_events, public.rate_limit_blocks).
 * Multi-instance safe: same tables as Storefront so limits are shared across instances.
 * On DB failure we allow the request (fail open) so rate limit issues do not block traffic.
 */

export interface RateLimitConfig {
  window_ms: number;
  max_requests: number;
  block_duration_ms: number;
}

/** Expensive endpoints: openclaw, ingest. */
export const RATE_LIMIT_EXPENSIVE: RateLimitConfig = {
  window_ms: 60_000,
  max_requests: 10,
  block_duration_ms: 5 * 60_000,
};

/** Other admin APIs. */
export const RATE_LIMIT_DEFAULT: RateLimitConfig = {
  window_ms: 60_000,
  max_requests: 60,
  block_duration_ms: 5 * 60_000,
};

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check and record rate limit. Uses DB only for multi-instance consistency.
 * Returns { allowed: true } or { allowed: false, reason }.
 * Never throws; on DB error returns { allowed: true } (fail open).
 */
export async function checkAndRecordRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const { getSupabase } = await import("@/lib/db/client");
    const supabase = getSupabase(true);

    const now = new Date();
    const windowStart = new Date(now.getTime() - config.window_ms);
    const nowIso = now.toISOString();
    const windowStartIso = windowStart.toISOString();

    const blockRes = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            gt: (k: string, v: string) => PromiseLike<{ data: unknown }>;
          };
        };
      };
    })
      .from("rate_limit_blocks")
      .select("blocked_until")
      .eq("identifier", identifier)
      .gt("blocked_until", nowIso);
    const blockData = blockRes.data;
    const block = Array.isArray(blockData) ? blockData[0] : blockData;
    if (block && typeof block === "object" && block !== null && "blocked_until" in block) {
      return { allowed: false, reason: "Too many requests. Try again later." };
    }

    const countRes = await (supabase as unknown as {
      from: (t: string) => {
        select: (
          c: string,
          o: { count: "exact"; head: boolean }
        ) => {
          eq: (k: string, v: string) => {
            gte: (k: string, v: string) => PromiseLike<{ count: number | null }>;
          };
        };
      };
    })
      .from("rate_limit_events")
      .select("*", { count: "exact", head: true })
      .eq("identifier", identifier)
      .gte("created_at", windowStartIso);
    const count = countRes.count;

    const requestCount = typeof count === "number" && Number.isFinite(count) ? count : 0;
    if (requestCount >= config.max_requests) {
      const blockedUntil = new Date(now.getTime() + config.block_duration_ms);
      await (supabase as unknown as {
        from: (t: string) => { upsert: (r: unknown, o?: { onConflict?: string }) => PromiseLike<unknown> };
      })
        .from("rate_limit_blocks")
        .upsert(
          {
            identifier,
            blocked_until: blockedUntil.toISOString(),
            reason: "Rate limit exceeded",
            created_at: nowIso,
          },
          { onConflict: "identifier" }
        );
      return { allowed: false, reason: "Too many requests. Try again later." };
    }

    await (supabase as unknown as {
      from: (t: string) => { insert: (r: unknown) => PromiseLike<unknown> };
    })
      .from("rate_limit_events")
      .insert({ identifier, created_at: nowIso });
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
