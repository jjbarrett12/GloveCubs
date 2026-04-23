/**
 * GET /api/feeds — list all feeds (catalogos.supplier_feeds). Query: ?supplier_id=uuid to filter.
 * POST /api/feeds — create feed. Body: { supplier_id, feed_type, config, schedule_cron?, is_active? }.
 */

import { NextResponse } from "next/server";
import { listFeeds, listFeedsBySupplier, createFeed } from "@/lib/catalogos/feeds";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get("supplier_id");
    const feeds = supplierId ? await listFeedsBySupplier(supplierId) : await listFeeds();
    return NextResponse.json(feeds);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supplier_id = body?.supplier_id?.toString()?.trim();
    const feed_type = body?.feed_type as string;
    if (!supplier_id || !["url", "csv", "api"].includes(feed_type)) {
      return NextResponse.json({ error: "supplier_id and feed_type (url|csv|api) required" }, { status: 400 });
    }
    const config = body.config && typeof body.config === "object" ? body.config : {};
    if ((feed_type === "url" || feed_type === "csv") && !config.url && !config.csv_url && !config.feed_url) {
      return NextResponse.json({ error: "config must contain url, csv_url, or feed_url" }, { status: 400 });
    }
    const { id } = await createFeed({
      supplier_id,
      feed_type: feed_type as "url" | "csv" | "api",
      config,
      schedule_cron: body.schedule_cron ?? null,
      is_active: body.is_active !== false,
    });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
