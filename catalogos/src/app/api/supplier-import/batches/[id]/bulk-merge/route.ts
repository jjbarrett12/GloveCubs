/**
 * POST /api/supplier-import/batches/[id]/bulk-merge
 * Shallow-merge allowed fields into normalized_data for many rows (bulk assign UOM, brand, category_guess, etc.).
 *
 * Body: { merge: Record<string, unknown>, normalized_ids?: string[], all_pending?: boolean, max_rows?: number }
 */

import { NextResponse } from "next/server";
import { bulkMergeNormalizedDataForBatch } from "@/lib/supplier-import/bulk-merge-normalized";

export const maxDuration = 120;

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: batchId } = await params;
    if (!batchId || !UUID_RE.test(batchId)) {
      return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const merge = body.merge;
    if (!merge || typeof merge !== "object" || Array.isArray(merge)) {
      return NextResponse.json({ error: "merge object is required" }, { status: 400 });
    }

    const normalizedIds = Array.isArray(body.normalized_ids)
      ? body.normalized_ids.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x))
      : undefined;
    const allPending = body.all_pending === true;
    const maxRows =
      typeof body.max_rows === "number" && body.max_rows > 0 ? Math.min(5000, body.max_rows) : undefined;

    const result = await bulkMergeNormalizedDataForBatch({
      batchId,
      normalizedIds,
      allPending,
      merge: merge as Record<string, unknown>,
      maxRows,
    });

    const status = result.errors.length > 0 && result.updated === 0 ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "bulk-merge failed" },
      { status: 500 }
    );
  }
}
