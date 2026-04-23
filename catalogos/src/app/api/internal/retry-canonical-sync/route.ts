/**
 * POST /api/internal/retry-canonical-sync
 * Processes catalogos.canonical_sync_retry_queue (sync_canonical_products + verify public.canonical_products).
 * Call from cron with INTERNAL_API_KEY (same pattern as /api/internal/notifications).
 */

import { NextRequest, NextResponse } from "next/server";
import { processCanonicalSyncRetryQueue } from "@/lib/publish/canonical-sync-service";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "dev-internal-key";

function validateApiKey(request: NextRequest): boolean {
  const apiKey =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (process.env.NODE_ENV === "development") {
    return true;
  }

  return apiKey === INTERNAL_API_KEY;
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 30;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.limit === "number" && body.limit >= 1 && body.limit <= 200) {
      limit = Math.floor(body.limit);
    }
  } catch {
    /* use default */
  }

  const result = await processCanonicalSyncRetryQueue(limit);
  return NextResponse.json(result);
}
