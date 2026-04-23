/**
 * POST /api/admin/url-import — Create URL import job and start controlled crawl.
 * GET /api/admin/url-import — List recent URL import jobs.
 * Admin-only; rate-limited as expensive.
 */

import { NextResponse } from "next/server";
import { getOrCreateSupplierId } from "@/lib/url-import/supplier";
import { createUrlImportJob, runUrlImportCrawl } from "@/lib/url-import/crawl-service";
import { listUrlImportJobs } from "@/lib/url-import/admin-data";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const supplierName =
      typeof body.supplier_name === "string" ? body.supplier_name.trim() : null;
    const startUrl =
      typeof body.start_url === "string" ? body.start_url.trim() : null;
    const allowedDomain =
      typeof body.allowed_domain === "string" ? body.allowed_domain.trim() : "";
    const crawlMode =
      body.crawl_mode === "single_product" ? "single_product" : "category";
    const maxPages = Math.min(
      Math.max(1, Number(body.max_pages) || 50),
      500
    );
    const createdBy =
      typeof body.created_by === "string" ? body.created_by.trim() || undefined : undefined;

    if (!supplierName) {
      return NextResponse.json(
        { error: "supplier_name is required" },
        { status: 400 }
      );
    }
    if (!startUrl) {
      return NextResponse.json(
        { error: "start_url is required" },
        { status: 400 }
      );
    }

    const supplierId = await getOrCreateSupplierId(supplierName);
    const { jobId } = await createUrlImportJob({
      supplierId,
      supplierName: supplierName!,
      startUrl: startUrl!,
      allowedDomain: allowedDomain || new URL(startUrl!).hostname,
      crawlMode,
      maxPages,
      createdBy,
    });

    const result = await runUrlImportCrawl(jobId);

    return NextResponse.json({
      jobId: result.jobId,
      status: "completed",
      pagesDiscovered: result.pagesDiscovered,
      pagesCrawled: result.pagesCrawled,
      pagesSkippedUnchanged: result.pagesSkippedUnchanged,
      productPagesDetected: result.productPagesDetected,
      productsExtracted: result.productsExtracted,
      familyGroupsInferred: result.familyGroupsInferred,
      failedPagesCount: result.failedPagesCount,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "URL import failed. Check URL and domain.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const jobs = await listUrlImportJobs(limit);
    return NextResponse.json(jobs);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list URL import jobs" },
      { status: 500 }
    );
  }
}
