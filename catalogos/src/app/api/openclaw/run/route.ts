/**
 * POST /api/openclaw/run — Run OpenClaw extraction (no auto-publish).
 * Body: { root_url: string, product_urls?: string[], max_urls?: number }
 * Returns: { rows, summary, product_url_list } for CatalogOS staging/import.
 */

import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const root_url = typeof body.root_url === "string" ? body.root_url.trim() : null;
    const product_urls = Array.isArray(body.product_urls)
      ? body.product_urls.filter((u: unknown) => typeof u === "string").slice(0, 500)
      : undefined;
    const max_urls = typeof body.max_urls === "number" ? Math.min(body.max_urls, 500) : undefined;

    if (!root_url && (!product_urls || product_urls.length === 0)) {
      return NextResponse.json(
        { error: "root_url or product_urls required" },
        { status: 400 }
      );
    }

    let effectiveRoot = root_url;
    if (!effectiveRoot && product_urls?.length) {
      try {
        effectiveRoot = new URL(product_urls[0]).origin;
      } catch {
        effectiveRoot = "https://example.com";
      }
    }

    const result = await runOpenClaw({
      root_url: effectiveRoot ?? "https://example.com",
      product_urls,
      max_urls,
    });

    return NextResponse.json({
      rows: result.rows,
      summary: result.summary,
      product_url_list: result.product_url_list,
    });
  } catch (e) {
    try {
      const { logApiFailure } = await import("@/lib/observability");
      logApiFailure(e instanceof Error ? e.message : "OpenClaw run failed", {
        phase: "openclaw_run",
        error_code: e instanceof Error ? e.name : "Unknown",
      });
    } catch {
      // telemetry must not crash the response
    }
    return NextResponse.json(
      { error: "Extraction failed. Please try again or contact support." },
      { status: 500 }
    );
  }
}
