/**
 * POST /api/supplier-import/batches/[id]/retry-failed
 * Re-run normalize/match for raw rows in this batch that have no supplier_products_normalized row.
 */

import { NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { retryFailedNormalizationForBatch } from "@/lib/ingestion/retry-normalization";

export const maxDuration = 300;

async function resolveCategoryId(slug: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
    }

    const supabase = getSupabaseCatalogos(true);
    const { data: batch, error } = await supabase
      .from("import_batches")
      .select("id, supplier_id")
      .eq("id", id)
      .single();

    if (error || !batch?.supplier_id) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const categoryId = await resolveCategoryId("disposable_gloves");
    const result = await retryFailedNormalizationForBatch(id, batch.supplier_id as string, categoryId);

    return NextResponse.json({
      ok: true,
      pendingRawCount: result.pendingRawCount,
      normalizedAttempted: result.normalizedAttempted,
      errors: result.errors,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Retry failed" },
      { status: 500 }
    );
  }
}
