/**
 * POST /api/admin/crawl-distributor — Admin-only. Start a distributor crawl.
 * Body: { distributor_name, start_url, allowed_domain?, crawl_scope? (path patterns) }
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
    const allowed_domain =
      typeof body.allowed_domain === "string" ? body.allowed_domain.trim() || undefined : undefined;
    const crawl_scope = Array.isArray(body.crawl_scope)
      ? body.crawl_scope.filter((p: unknown) => typeof p === "string").slice(0, 50)
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
      allowed_domain,
      allowed_path_patterns: crawl_scope,
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
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Crawl failed. Check URL and domain.",
      },
      { status: 500 }
    );
  }
}
