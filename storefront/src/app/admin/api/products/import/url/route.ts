import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import {
  nonEmptyString,
  parseJsonBody,
  toCatalogosErrorResponse,
  validateHttpUrl,
} from "@/lib/admin/products-import-proxy";

const CRAWL_MODES = new Set(["single_product", "category"]);
const MAX_PAGES_HARD_CAP = 500;

/** Match CatalogOS POST /api/admin/url-import (maxDuration = 300s). */
export const maxDuration = 300;

/**
 * POST /admin/api/products/import/url
 * Admin-gated proxy → CatalogOS POST /api/admin/url-import.
 * Storefront does NOT crawl, extract, or write canonical data.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const supplier = nonEmptyString(body.supplier_name);
  if (!supplier.ok) return NextResponse.json({ error: `supplier_name ${supplier.reason}` }, { status: 400 });

  const startUrl = validateHttpUrl(body.start_url);
  if (!startUrl.ok) return NextResponse.json({ error: `start_url ${startUrl.reason}` }, { status: 400 });

  const crawlModeRaw = typeof body.crawl_mode === "string" ? body.crawl_mode.trim() : "category";
  const crawlMode = CRAWL_MODES.has(crawlModeRaw) ? crawlModeRaw : "category";

  let allowedDomain: string | undefined;
  if (body.allowed_domain != null) {
    const d = nonEmptyString(body.allowed_domain);
    if (!d.ok) return NextResponse.json({ error: `allowed_domain ${d.reason}` }, { status: 400 });
    allowedDomain = d.value;
  }

  let maxPages: number | undefined;
  const rawMax = body.max_pages;
  if (rawMax !== undefined && rawMax !== null && rawMax !== "") {
    const n = Number(rawMax);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json({ error: "max_pages must be a positive number" }, { status: 400 });
    }
    maxPages = Math.min(Math.floor(n), MAX_PAGES_HARD_CAP);
  } else if (crawlMode === "single_product") {
    maxPages = 1;
  }

  const result = await catalogosInternalRequest({
    method: "POST",
    path: "/api/admin/url-import",
    body: {
      supplier_name: supplier.value,
      start_url: startUrl.url.toString(),
      allowed_domain: allowedDomain,
      crawl_mode: crawlMode,
      max_pages: maxPages,
    },
    // CatalogOS POST is non-idempotent (job is created before crawl completes) — never retry.
    maxAttempts: 1,
    // CatalogOS runs the crawl synchronously (up to 300s); align our timeout.
    timeoutMs: 290_000,
  });

  if (!result.ok) return toCatalogosErrorResponse(result);
  return NextResponse.json(result.data, { status: 200 });
}
