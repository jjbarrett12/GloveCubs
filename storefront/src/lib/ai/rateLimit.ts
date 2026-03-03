const store = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = Math.min(
  200,
  Math.max(10, parseInt(process.env.AI_RATE_LIMIT_RPM ?? "30", 10))
);

export function checkRateLimit(identifier: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let entry = store.get(identifier);
  if (!entry) {
    store.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(identifier, entry);
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  return { allowed: true };
}

export function getRateLimitIdentifier(ip: string | null, userId: string | number | null): string {
  const u = userId != null ? String(userId) : "";
  return `ai:${ip ?? "anon"}:${u || "anon"}`;
}
