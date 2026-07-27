/**
 * CatalogOS route protection for ingest/publish/review/import/dashboard surfaces.
 *
 * Auth uses CATALOGOS_ADMIN_SECRET (Bearer or catalogos_admin cookie).
 * Production-like runtimes fail closed when the secret is missing.
 * Local open access requires CATALOGOS_ALLOW_INSECURE_DEV_AUTH=1.
 * Rate limits use shared DB tables (public.rate_limit_events/blocks).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkAndRecordRateLimit,
  RATE_LIMIT_EXPENSIVE,
  RATE_LIMIT_DEFAULT,
} from "@/lib/rate-limit";
import {
  evaluateCatalogosAdminAuth,
  getCatalogosAdminSecret,
  getCatalogosInternalApiKey,
  isCatalogosInsecureDevAuthAllowed,
  isCatalogosProductionLikeRuntime,
} from "@/lib/auth/catalogos-admin-auth";

/** Mutating / privileged API prefixes — not public catalog read or bulk-quote lead capture. */
const ADMIN_API_PATHS = [
  "/api/ingest",
  "/api/publish",
  "/api/staging",
  "/api/openclaw",
  "/api/distributor-sync",
  "/api/admin",
  "/api/csv-import",
  "/api/supplier-import",
  "/api/review",
  "/api/feeds",
  "/api/internal",
  "/api/suppliers",
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

function denyResponse(
  req: NextRequest,
  path: string,
  isAdminApi: boolean,
  decision: { status: 401 | 503; error: string; detail?: string },
): NextResponse {
  if (isAdminApi || path.startsWith("/api/")) {
    return NextResponse.json(
      { error: decision.error, ...(decision.detail ? { detail: decision.detail } : {}) },
      { status: decision.status },
    );
  }
  if (path.startsWith(ADMIN_PREFIX) || path.startsWith(DASHBOARD_PREFIX)) {
    if (decision.status === 503) {
      return new NextResponse("CatalogOS admin authentication is not configured.", { status: 503 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.json({ error: decision.error }, { status: decision.status });
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdminApi = ADMIN_API_PATHS.some((p) => path.startsWith(p));
  const isDashboard = path.startsWith(DASHBOARD_PREFIX);
  const isAdminPage = path.startsWith(ADMIN_PREFIX);

  if (!isAdminApi && !isDashboard && !isAdminPage) return NextResponse.next();

  const secret = getCatalogosAdminSecret();
  const decision = evaluateCatalogosAdminAuth({
    secret,
    bearer: req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "",
    cookieToken: req.cookies.get("catalogos_admin")?.value ?? "",
    apiKey: req.headers.get("x-api-key")?.trim() ?? "",
    productionLike: isCatalogosProductionLikeRuntime(),
    allowInsecureDev: isCatalogosInsecureDevAuthAllowed(),
    internalKey: getCatalogosInternalApiKey(),
  });

  if (!decision.ok) {
    return denyResponse(req, path, isAdminApi, decision);
  }

  if (isAdminApi) {
    const ip = getClientIp(req);
    const isExpensive =
      path.startsWith("/api/openclaw") ||
      path.startsWith("/api/ingest") ||
      path.startsWith("/api/distributor-sync") ||
      path.startsWith("/api/admin/crawl-distributor") ||
      path.startsWith("/api/admin/url-import") ||
      path.startsWith("/api/csv-import") ||
      path.startsWith("/api/feeds");
    const identifier = `catalogos:${ip}:${isExpensive ? "exp" : "def"}`;
    const config = isExpensive ? RATE_LIMIT_EXPENSIVE : RATE_LIMIT_DEFAULT;
    const result = await checkAndRecordRateLimit(identifier, config);
    if (!result.allowed) {
      return NextResponse.json(
        { error: result.reason ?? "Too many requests. Try again later." },
        { status: 429 },
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
    "/api/review/:path*",
    "/api/feeds/:path*",
    "/api/internal/:path*",
    "/api/suppliers/:path*",
    "/dashboard/:path*",
    "/admin/:path*",
  ],
};
