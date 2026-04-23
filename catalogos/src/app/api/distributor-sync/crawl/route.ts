/**
 * POST /api/distributor-sync/crawl — Admin-only.
 * Body: { distributor_name: string, start_url: string, allowed_path_patterns?: string[] }
 * Validates URL, ensures domain allowed, creates crawl job, discovers pages, extracts products into staging.
 * Returns job id, source id, and batch summary (pages discovered, product pages, products extracted, errors).
 */

import { NextResponse } from "next/server";
import { runCrawl } from "@/lib/distributor-sync/crawl-service";

export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const distributor_name =
      typeof body.distributor_name === "string" ? body.distributor_name.trim() : null;
    const start_url =
      typeof body.start_url === "string" ? body.start_url.trim() : null;
    const allowed_path_patterns = Array.isArray(body.allowed_path_patterns)
      ? body.allowed_path_patterns.filter((p: unknown) => typeof p === "string").slice(0, 50)
      : undefined;

    if (!distributor_name) {
      return NextResponse.json(
        { error: "distributor_name is required" },
        { status: 400 }
      );
    }
    if (!start_url) {
      return NextResponse.json(
        { error: "start_url is required" },
        { status: 400 }
      );
    }

    const result = await runCrawl({
      distributor_name,
      start_url,
      allowed_path_patterns,
    });

    return NextResponse.json({
      jobId: result.jobId,
      sourceId: result.sourceId,
      startUrl: result.startUrl,
      pagesDiscovered: result.pagesDiscovered,
      productPagesDiscovered: result.productPagesDiscovered,
      productsExtracted: result.productsExtracted,
      errors: result.errors,
    });
  } catch (e) {
    try {
      const { logApiFailure } = await import("@/lib/observability");
      logApiFailure(e instanceof Error ? e.message : "Distributor sync crawl failed", {
        phase: "distributor_sync_crawl",
        error_code: e instanceof Error ? e.name : "Unknown",
      });
    } catch {
      // telemetry must not crash the response
    }
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Crawl failed. Check URL and try again.",
      },
      { status: 500 }
    );
  }
}
