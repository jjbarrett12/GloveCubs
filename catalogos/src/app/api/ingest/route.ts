/**
 * POST /api/ingest — Trigger Phase 1 ingestion pipeline.
 * Body: { feed_id } OR { supplier_id, feed_url }.
 * Fetches feed from URL, parses CSV/JSON, stores raw, normalizes, matches, flags anomalies, creates suggested offers.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { triggerImportSchema } from "@/lib/validations/ingestion-schemas";
import { runPipeline, startAsyncIngest } from "@/lib/ingestion/run-pipeline";
import { getSupabaseCatalogos } from "@/lib/db/client";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = triggerImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = getSupabaseCatalogos(true);
    let feedUrl: string;
    let feedId: string | null = null;
    let supplierId: string;

    if (parsed.data.feed_id) {
      const { data: feed, error } = await supabase
        .from("supplier_feeds")
        .select("id, config, supplier_id")
        .eq("id", parsed.data.feed_id)
        .single();
      if (error || !feed) {
        return NextResponse.json({ error: "Feed not found" }, { status: 404 });
      }
      feedId = feed.id as string;
      supplierId = feed.supplier_id as string;
      const config = (feed.config ?? {}) as Record<string, unknown>;
      feedUrl = (config.url ?? config.csv_url ?? config.feed_url) as string;
      if (!feedUrl || typeof feedUrl !== "string") {
        return NextResponse.json({ error: "Feed has no URL in config" }, { status: 400 });
      }
    } else {
      feedId = null;
      supplierId = parsed.data.supplier_id!;
      feedUrl = parsed.data.feed_url!;
    }

    const categoryId = await resolveCategoryId("disposable_gloves");

    if (parsed.data.async) {
      const { batchId } = await startAsyncIngest(
        {
          feedId,
          supplierId,
          feedUrl,
          categoryId,
        },
        { chunkSize: parsed.data.chunk_size }
      );
      return NextResponse.json(
        { batchId, accepted: true, async: true, message: "Ingestion started; poll batch for status." },
        { status: 202 }
      );
    }

    const result = await runPipeline(
      {
        feedId,
        supplierId,
        feedUrl,
        categoryId,
      },
      { chunkSize: parsed.data.chunk_size }
    );

    revalidatePath("/dashboard/batches");
    revalidatePath("/dashboard/review");

    return NextResponse.json(result);
  } catch (e) {
    try {
      const { logIngestionFailure } = await import("@/lib/observability");
      logIngestionFailure(e instanceof Error ? e.message : "Ingestion failed", {
        error_code: e instanceof Error ? e.name : "Unknown",
      });
    } catch {
      // telemetry must not crash the response
    }
    return NextResponse.json(
      { error: "Ingestion failed. Please try again or contact support." },
      { status: 500 }
    );
  }
}

async function resolveCategoryId(slug: string): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).single();
  if (error || !data?.id) throw new Error(`Category not found: ${slug}`);
  return data.id as string;
}
