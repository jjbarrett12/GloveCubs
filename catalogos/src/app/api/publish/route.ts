/**
 * POST /api/publish — Publish approved staging rows to live catalog.
 * Canonical path: uses runPublish (product + product_attributes + supplier_offers + publish_events).
 * Do not use publishStagingCatalogos; it does not sync product_attributes.
 */
import { NextResponse } from "next/server";
import { getStagingById } from "@/lib/review/data";
import { evaluatePublishReadiness } from "@/lib/review/publish-guards";
import { buildPublishInputFromStaged, runPublish } from "@/lib/publish/publish-service";
import { publishStagingSchema } from "@/lib/validations/schemas";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = publishStagingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }
    const publishedBy = (body as { published_by?: string }).published_by;
    const errors: string[] = [];
    let published = 0;
    for (const stagingId of parsed.data.staging_ids) {
      const row = await getStagingById(stagingId);
      if (!row) {
        errors.push(`${stagingId}: not found`);
        continue;
      }
      const status = (row as { status?: string }).status;
      if (status !== "approved" && status !== "merged") {
        errors.push(`${stagingId}: not approved (status=${status})`);
        continue;
      }
      const masterId = (row as { master_product_id?: string }).master_product_id;
      if (!masterId) {
        errors.push(`${stagingId}: missing master_product_id`);
        continue;
      }
      const readiness = await evaluatePublishReadiness(stagingId);
      if (!readiness.canPublish) {
        errors.push(`${stagingId}: ${readiness.blockers.join(" ")}`);
        continue;
      }
      const input = buildPublishInputFromStaged(stagingId, row, {
        masterProductId: masterId,
        publishedBy: publishedBy ?? undefined,
      });
      if (!input) {
        errors.push(`${stagingId}: could not build publish input`);
        continue;
      }
      const result = await runPublish(input);
      if (!result.success) {
        errors.push(`${stagingId}: ${result.error}`);
        continue;
      }
      published++;
    }
    return NextResponse.json({ published, errors });
  } catch (e) {
    try {
      const { logPublishFailure } = await import("@/lib/observability");
      logPublishFailure(e instanceof Error ? e.message : "Publish failed", {
        error_code: e instanceof Error ? e.name : "Unknown",
      });
    } catch {
      // telemetry must not crash the response
    }
    return NextResponse.json(
      { error: "Publish failed. Please try again or contact support." },
      { status: 500 }
    );
  }
}
