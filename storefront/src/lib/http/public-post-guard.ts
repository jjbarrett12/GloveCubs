import { NextRequest, NextResponse } from "next/server";

const DEFAULT_MAX_BYTES = 256 * 1024;

/**
 * Emergency containment for anonymous public POST APIs:
 * Content-Type must be JSON; Content-Length (when present) must be within maxBytes.
 * Does not claim durable rate limiting — pair with Vercel WAF / GC_EMERGENCY_DISABLE_PUBLIC_AI.
 */
export function guardPublicJsonPost(
  request: NextRequest,
  opts?: { maxBytes?: number },
): NextResponse | null {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 },
    );
  }
  const lenRaw = request.headers.get("content-length");
  if (lenRaw != null && lenRaw !== "") {
    const len = Number(lenRaw);
    if (!Number.isFinite(len) || len < 0) {
      return NextResponse.json({ error: "Invalid Content-Length" }, { status: 400 });
    }
    if (len > maxBytes) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
  }
  return null;
}

/** Multipart upload size gate (Content-Length when present). */
export function guardPublicMultipartPost(
  request: NextRequest,
  opts?: { maxBytes?: number },
): NextResponse | null {
  const maxBytes = opts?.maxBytes ?? 8 * 1024 * 1024;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type must be multipart/form-data" },
      { status: 415 },
    );
  }
  const lenRaw = request.headers.get("content-length");
  if (lenRaw != null && lenRaw !== "") {
    const len = Number(lenRaw);
    if (!Number.isFinite(len) || len < 0) {
      return NextResponse.json({ error: "Invalid Content-Length" }, { status: 400 });
    }
    if (len > maxBytes) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
  }
  return null;
}
