/**
 * CatalogOS route protection: admin auth for /api/ingest, /api/publish, /api/staging, /api/openclaw,
 * /api/csv-import, /api/supplier-import, etc.
 * Uses CATALOGOS_ADMIN_SECRET: when set, requests with Authorization: Bearer <secret>
 * or cookie catalogos_admin=<secret> are allowed. When unset, all requests pass (dev).
 * Rate limits use shared DB tables (public.rate_limit_events/blocks) for multi-instance safety.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkAndRecordRateLimit,
  RATE_LIMIT_EXPENSIVE,
  RATE_LIMIT_DEFAULT,
} from "@/lib/rate-limit";

const ADMIN_API_PATHS = [
  "/api/ingest",
  "/api/publish",
  "/api/staging",
  "/api/openclaw",
  "/api/distributor-sync",
  "/api/admin",
  "/api/csv-import",
  "/api/supplier-import",
];
const DASHBOARD_PREFIX = "/dashboard";
const ADMIN_PREFIX = "/admin";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdminApi = ADMIN_API_PATHS.some((p) => path.startsWith(p));
  const isDashboard = path.startsWith(DASHBOARD_PREFIX);
  const isAdminPage = path.startsWith(ADMIN_PREFIX);

  if (!isAdminApi && !isDashboard && !isAdminPage) return NextResponse.next();

  const secret = process.env.CATALOGOS_ADMIN_SECRET;
  if (!secret) {
    return NextResponse.next();
  }

  const token =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    req.cookies.get("catalogos_admin")?.value;

  if (token !== secret) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isAdminPage) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (isAdminApi) {
    const ip = getClientIp(req);
    const isExpensive =
      path.startsWith("/api/openclaw") ||
      path.startsWith("/api/ingest") ||
      path.startsWith("/api/distributor-sync") ||
      path.startsWith("/api/admin/crawl-distributor") ||
      path.startsWith("/api/admin/url-import") ||
      path.startsWith("/api/csv-import");
    const identifier = `catalogos:${ip}:${isExpensive ? "exp" : "def"}`;
    const config = isExpensive ? RATE_LIMIT_EXPENSIVE : RATE_LIMIT_DEFAULT;
    const result = await checkAndRecordRateLimit(identifier, config);
    if (!result.allowed) {
      return NextResponse.json(
        { error: result.reason ?? "Too many requests. Try again later." },
        { status: 429 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/ingest",
    "/api/publish",
    "/api/staging/:path*",
    "/api/openclaw/:path*",
    "/api/distributor-sync/:path*",
    "/api/admin/:path*",
    "/api/csv-import/:path*",
    "/api/supplier-import/:path*",
    "/dashboard/:path*",
    "/admin/:path*",
  ],
};
