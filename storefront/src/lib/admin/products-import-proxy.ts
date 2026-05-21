/**
 * Shared validation + error helpers for /admin/api/products/import/* proxy routes.
 * Storefront forwards only; CatalogOS owns ingestion truth.
 */

import { NextResponse } from "next/server";
import type {
  CatalogosInternalRequestError,
  CatalogosInternalRequestResult,
} from "@/lib/admin/catalogos-internal-client";

export type ParsedJsonResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; response: ReturnType<typeof NextResponse.json> };

export async function parseJsonBody<T = unknown>(request: Request): Promise<ParsedJsonResult<T>> {
  try {
    const value = (await request.json()) as T;
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json_body" }, { status: 400 }),
    };
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function validateHttpUrl(value: unknown): { ok: true; url: URL } | { ok: false; reason: string } {
  if (typeof value !== "string") return { ok: false, reason: "must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "is required" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "must be a valid absolute URL" };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: "must be http or https" };
  }
  return { ok: true, url };
}

export function nonEmptyString(value: unknown, max = 200): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== "string") return { ok: false, reason: "must be a string" };
  const v = value.trim();
  if (!v) return { ok: false, reason: "is required" };
  if (v.length > max) return { ok: false, reason: `must be at most ${max} characters` };
  return { ok: true, value: v };
}

export function adminCatalogosErrorMessage(err: CatalogosInternalRequestError): string {
  if (err.kind === "config") {
    return `${err.message} Set CATALOGOS_INTERNAL_URL in storefront/.env.local (development default: http://localhost:3010 when unset).`;
  }
  if (err.kind === "auth") {
    return `${err.message} Set INTERNAL_API_KEY to match CatalogOS (and CATALOGOS_ADMIN_SECRET if enabled).`;
  }
  if (err.kind === "network") {
    if (err.message === "catalogos_timeout") {
      return "CatalogOS request timed out. For URL crawls this can take several minutes; confirm CatalogOS is running and reachable.";
    }
    return `CatalogOS is unreachable (${err.message}). Start CatalogOS locally or fix CATALOGOS_INTERNAL_URL.`;
  }
  if (err.kind === "parse") {
    return `CatalogOS returned an invalid response (${err.message}).`;
  }
  if (err.status === 401 || err.status === 403) {
    return `CatalogOS rejected the request (HTTP ${err.status}). Align INTERNAL_API_KEY with CatalogOS middleware.`;
  }
  return err.message;
}

export function toCatalogosErrorResponse(
  result: CatalogosInternalRequestResult,
  contextStatus: number = 502
): ReturnType<typeof NextResponse.json> {
  if (result.ok) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const err = result.error;
  const status =
    err.kind === "auth"
      ? 503
      : err.kind === "config"
        ? 503
        : err.kind === "network"
          ? err.status === 408
            ? 504
            : 502
          : err.kind === "http"
            ? err.status && err.status >= 400 && err.status < 600
              ? err.status
              : contextStatus
            : 502;
  return NextResponse.json(
    {
      error: adminCatalogosErrorMessage(err),
      kind: err.kind,
      upstream_status: err.status ?? null,
      upstream_detail: err.message,
    },
    { status }
  );
}
