import { NextRequest, NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

/** Process-local secondary defense. Pair with Vercel WAF rate limits. */
const buckets = new Map<string, Bucket>();

function clientIp(request: NextRequest): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

/**
 * Fixed-window IP rate limit for sensitive public POSTs.
 * Returns a 429 response when exceeded; otherwise null.
 */
export function checkPublicWriteRateLimit(
  request: NextRequest,
  opts: { key: string; limit: number; windowMs: number },
): NextResponse | null {
  const ip = clientIp(request);
  const bucketKey = `${opts.key}:${ip}`;
  const now = Date.now();
  const existing = buckets.get(bucketKey);

  if (!existing || now >= existing.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  existing.count += 1;
  if (existing.count > opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return NextResponse.json(
      {
        error: "Too many requests",
        code: "rate_limited",
        retryAfterSec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  return null;
}

/** Pricing / contact: ~3 submissions per 10 minutes per IP */
export const PUBLIC_WRITE_LIMITS = {
  requestPricing: { key: "request-pricing", limit: 3, windowMs: 10 * 60 * 1000 },
  contact: { key: "contact", limit: 3, windowMs: 10 * 60 * 1000 },
  quoteRequest: { key: "quote-request", limit: 5, windowMs: 10 * 60 * 1000 },
  invoiceIntake: { key: "invoice-intake", limit: 5, windowMs: 10 * 60 * 1000 },
  selfSignupFinalize: {
    key: "self-signup-finalize",
    limit: 5,
    windowMs: 10 * 60 * 1000,
  },
  /** Find-my-glove wizard: 5 / 10 minutes / IP */
  glovesRecommend: { key: "gloves-recommend", limit: 5, windowMs: 10 * 60 * 1000 },
  /** Prep-line glove finder: same bound; in-process (pair with Vercel WAF). */
  gloveFinder: { key: "glove-finder", limit: 5, windowMs: 10 * 60 * 1000 },
} as const;
