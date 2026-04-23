/**
 * POST /api/admin/publish-distributor-approved — Admin-only.
 * Publishes approved distributor_product_staging rows. Uses existing publish pipeline
 * where staging has been synced to main staging_products; otherwise returns summary.
 */

import { NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";

export async function POST() {
  try {
    const supabase = getSupabaseCatalogos(true);
    const { data: approved } = await supabase
      .from("distributor_product_staging")
      .select("id, crawl_job_id, supplier_sku, product_name, status")
      .eq("status", "approved");

    const rows = (approved ?? []) as Array<{
      id: string;
      crawl_job_id: string;
      supplier_sku: string | null;
      product_name: string | null;
      status: string;
    }>;

    if (rows.length === 0) {
      return NextResponse.json({
        published: 0,
        message: "No approved distributor products to publish.",
      });
    }

    // Distributor staging is separate from main staging_products. Full integration
    // (copy approved distributor rows into main staging + run runPublish) is Phase 6.
    // For now we return count and a note; UI can show "Approved: N (publish pipeline not yet linked)."
    return NextResponse.json({
      published: 0,
      approvedCount: rows.length,
      message:
        "Distributor approved products are not yet linked to the main catalog publish pipeline. Approve and publish via the main Review queue after syncing distributor data, or wait for Phase 6 integration.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Publish check failed" },
      { status: 500 }
    );
  }
}
