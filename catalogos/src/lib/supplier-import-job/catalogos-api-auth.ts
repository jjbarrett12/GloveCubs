/**
 * CatalogOS supplier-import API auth: shared admin secret + organization scoping headers.
 * Aligns with middleware CATALOGOS_ADMIN_SECRET (Bearer or catalogos_admin cookie).
 */

import { NextResponse } from "next/server";
import {
  evaluateCatalogosAdminAuth,
  getCatalogosAdminSecret,
  getCatalogosInternalApiKey,
  isCatalogosInsecureDevAuthAllowed,
  isCatalogosProductionLikeRuntime,
} from "@/lib/auth/catalogos-admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CatalogosSupplierImportAuthContext {
  organizationId: string;
  /** Actor label for audit (header X-Catalogos-Operator-Id or anonymous). */
  operatorId: string;
  /** True when CATALOGOS_ADMIN_SECRET was configured. */
  secretConfigured: boolean;
}

/**
 * - Production-like / non-insecure-dev: CATALOGOS_ADMIN_SECRET required; matching Bearer/cookie required.
 * - Local open access only when CATALOGOS_ALLOW_INSECURE_DEV_AUTH=1 and not production-like.
 * - Always require X-Catalogos-Organization-Id (valid UUID) for supplier-import job routes → else 403.
 * - Optional X-Catalogos-Operator-Id for audit attribution.
 */
export function requireSupplierImportAuth(
  req: Request
): CatalogosSupplierImportAuthContext | NextResponse {
  const secret = getCatalogosAdminSecret();
  const secretConfigured = Boolean(secret);
  const authHeader = req.headers.get("authorization");
  const bearer =
    authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const cookie = req.headers.get("cookie") ?? "";
  const cookieMatch = cookie.match(/(?:^|;\s*)catalogos_admin=([^;]+)/);
  const cookieToken = cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1].trim()) : "";
  const decision = evaluateCatalogosAdminAuth({
    secret,
    bearer,
    cookieToken,
    apiKey: req.headers.get("x-api-key")?.trim() ?? "",
    productionLike: isCatalogosProductionLikeRuntime(),
    allowInsecureDev: isCatalogosInsecureDevAuthAllowed(),
    internalKey: getCatalogosInternalApiKey(),
  });
  if (!decision.ok) {
    return NextResponse.json(
      {
        error: decision.error,
        ...(decision.detail ? { detail: decision.detail } : {}),
      },
      { status: decision.status },
    );
  }

  const organizationId = req.headers.get("x-catalogos-organization-id")?.trim() ?? "";
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        detail: "Valid X-Catalogos-Organization-Id header is required",
      },
      { status: 403 }
    );
  }

  const operatorId =
    req.headers.get("x-catalogos-operator-id")?.trim() ||
    req.headers.get("x-catalogos-operator-email")?.trim() ||
    "anonymous";

  return {
    organizationId,
    operatorId,
    secretConfigured,
  };
}

export function isValidUuid(s: string): boolean {
  return UUID_RE.test(s);
}
