/**
 * POST /api/admin/url-import/[jobId]/bridge — Approve URL import and bridge to existing import pipeline.
 * Creates import_batch, raw rows, runs normalize/match/stage/family inference; rows land in review queue.
 */

import { NextResponse } from "next/server";
import { bridgeUrlImportToBatch } from "@/lib/url-import/bridge";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const productIds = Array.isArray(body.product_ids)
      ? body.product_ids.filter((id: unknown) => typeof id === "string").slice(0, 2000)
      : undefined;

    const result = await bridgeUrlImportToBatch({ jobId, productIds });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Bridge failed" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      normalizedCount: result.normalizedCount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bridge failed" },
      { status: 500 }
    );
  }
}
