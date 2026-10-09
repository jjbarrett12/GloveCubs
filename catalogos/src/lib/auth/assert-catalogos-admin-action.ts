/**
 * CatalogOS admin check for server actions (cookies/headers).
 * Middleware alone is not sufficient for privileged signing.
 */

import { cookies, headers } from "next/headers";
import {
  evaluateCatalogosAdminAuth,
  getCatalogosAdminSecret,
  getCatalogosInternalApiKey,
  isCatalogosInsecureDevAuthAllowed,
  isCatalogosProductionLikeRuntime,
} from "@/lib/auth/catalogos-admin-auth";

export async function assertCatalogosAdminAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const cookieStore = await cookies();
  const hdrs = await headers();
  const authHeader = hdrs.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cookieToken = cookieStore.get("catalogos_admin")?.value?.trim() ?? "";
  const decision = evaluateCatalogosAdminAuth({
    secret: getCatalogosAdminSecret(),
    bearer,
    cookieToken,
    apiKey: hdrs.get("x-api-key")?.trim() ?? "",
    productionLike: isCatalogosProductionLikeRuntime(),
    allowInsecureDev: isCatalogosInsecureDevAuthAllowed(),
    internalKey: getCatalogosInternalApiKey(),
  });
  if (!decision.ok) {
    return { ok: false, error: decision.error };
  }
  return { ok: true };
}
