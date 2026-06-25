/**
 * Deterministic ingestion fingerprints (versioned). Shared by CatalogOS and storefront.
 */

import { createHash } from "crypto";
import type { IngestionMode } from "./types";

const FINGERPRINT_VERSION = "v1";

export type SourceFingerprintInput = {
  mode: IngestionMode;
  sourceUrl: string;
  supplierId?: string | null;
  identityKeys?: {
    gtin?: string | null;
    mpn?: string | null;
    supplierSku?: string | null;
  };
};

export type ProductFingerprintInput = {
  sourceFingerprint: string;
  variantKey?: string | null;
};

/** Normalize URL for stable fingerprints (host lowercase, no fragment, no trailing slash). */
export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "") || "/";
    u.pathname = path;
    return u.toString();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

function coalesceIdentity(keys?: SourceFingerprintInput["identityKeys"]): string {
  const gtin = keys?.gtin?.trim() ?? "";
  const mpn = keys?.mpn?.trim() ?? "";
  const sku = keys?.supplierSku?.trim() ?? "";
  return gtin || mpn || sku || "";
}

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Job-level fingerprint: one active ingest per source URL + supplier + top identity.
 */
export function computeSourceFingerprint(input: SourceFingerprintInput): string {
  const normalizedUrl = normalizeSourceUrl(input.sourceUrl);
  const supplier = (input.supplierId?.trim() || "none").toLowerCase();
  const identity = coalesceIdentity(input.identityKeys);
  const canonical = [
    FINGERPRINT_VERSION,
    input.mode,
    normalizedUrl,
    supplier,
    identity,
  ].join("|");
  return sha256Hex(canonical);
}

/**
 * Variant-level fingerprint under a source job (multi-SKU deep crawls).
 */
export function computeProductFingerprint(input: ProductFingerprintInput): string {
  const variantKey = (input.variantKey?.trim() || "default").toLowerCase();
  const canonical = [FINGERPRINT_VERSION, input.sourceFingerprint, variantKey].join("|");
  return sha256Hex(canonical);
}
