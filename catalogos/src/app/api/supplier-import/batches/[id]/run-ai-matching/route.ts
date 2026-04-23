/**
 * POST /api/supplier-import/batches/[id]/run-ai-matching
 * Pass 2: run deferred AI matching for rows with ai_match_status = pending (bounded per request).
 *
 * Body JSON: { max_rows?: number } (default from CATALOGOS_AI_PASS2_CHUNK_SIZE, max 200 per request)
 */

import { NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { runDeferredAiMatchingForBatch } from "@/lib/ingestion/batch-ai-matching";
import { INGESTION_AI_PASS2_CHUNK_SIZE } from "@/lib/ingestion/ingestion-config";

export const maxDuration = 300;

async function resolveCategoryId(slug: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
    }

    const supabase = getSupabaseCatalogos(true);
    const { data: batch, error } = await supabase.from("import_batches").select("id").eq("id", id).maybeSingle();

    if (error || !batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    let maxRows = INGESTION_AI_PASS2_CHUNK_SIZE;
    try {
      const body = (await req.json()) as { max_rows?: number };
      if (typeof body?.max_rows === "number" && Number.isFinite(body.max_rows)) {
        maxRows = Math.min(200, Math.max(1, Math.floor(body.max_rows)));
      }
    } catch {
      /* empty body */
    }

    const categoryId = await resolveCategoryId("disposable_gloves");
    const result = await runDeferredAiMatchingForBatch(id, { maxRows, categoryId });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI matching failed" },
      { status: 500 }
    );
  }
}
