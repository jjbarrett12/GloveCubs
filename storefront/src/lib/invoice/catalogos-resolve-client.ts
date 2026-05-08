import { logPublicFunnel } from "@/lib/observability/public-funnel-log";

export type CatalogosResolveLineResult = {
  line_id: string;
  matched: boolean;
  catalog_product_id: string | null;
  match_confidence: number;
  match_reason: string;
  category_slug: string;
  normalized_snapshot: Record<string, unknown>;
};

export type CatalogosResolveResponse =
  | { ok: true; results: CatalogosResolveLineResult[] }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string; status?: number };

export type CatalogosResolveContext = {
  opportunityId?: string;
  uploadedInvoiceId?: string;
  clientTraceId?: string;
};

const DEFAULT_DEV_KEY = "dev-internal-key";

function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function resolveCatalogosApiKey():
  | { ok: true; key: string }
  | { ok: false; reason: string } {
  const raw = process.env.INTERNAL_API_KEY;
  const trimmed = raw?.trim() ?? "";
  if (!isProductionLike()) {
    return { ok: true, key: trimmed || DEFAULT_DEV_KEY };
  }
  if (!trimmed) {
    return { ok: false, reason: "INTERNAL_API_KEY missing in production" };
  }
  if (trimmed === DEFAULT_DEV_KEY) {
    return { ok: false, reason: "INTERNAL_API_KEY must not use default dev-internal-key in production" };
  }
  return { ok: true, key: trimmed };
}

function resolveTimeoutMs(): number {
  const n = Number(process.env.CATALOGOS_RESOLVE_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 1000) return Math.min(n, 120_000);
  return 25_000;
}

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function logResolve(
  event: string,
  fields: {
    duration_ms: number;
    http_status?: number | null;
    outcome: "ok" | "skipped" | "failed";
    attempt?: number;
    line_count: number;
    opportunity_id?: string;
    uploaded_invoice_id?: string;
    client_trace_id?: string;
    reason?: string;
    error_kind?: string;
  }
): void {
  logPublicFunnel("catalogos_resolve", event, fields);
}

/**
 * Calls CatalogOS internal matcher (runNormalization + matchToMaster only).
 * Production: refuses default/missing INTERNAL_API_KEY (skipped, not silent).
 * Bounded retries on timeouts and transient HTTP statuses only.
 */
export async function resolveInvoiceLinesViaCatalogos(
  payload: { lines: Array<{ line_id: string; row: Record<string, unknown> }> },
  context?: CatalogosResolveContext
): Promise<CatalogosResolveResponse> {
  const line_count = payload.lines.length;
  const opportunity_id = context?.opportunityId;
  const uploaded_invoice_id = context?.uploadedInvoiceId;
  const client_trace_id = context?.clientTraceId;

  const base = (process.env.CATALOGOS_INTERNAL_URL || process.env.NEXT_PUBLIC_CATALOGOS_URL || "").trim();
  if (!base) {
    logResolve("resolve_complete", {
      duration_ms: 0,
      outcome: "skipped",
      line_count,
      opportunity_id,
      uploaded_invoice_id,
      client_trace_id,
      reason: "catalogos_base_url_unset",
    });
    return { ok: false, skipped: true, reason: "CATALOGOS_INTERNAL_URL or NEXT_PUBLIC_CATALOGOS_URL not set" };
  }

  const keyResult = resolveCatalogosApiKey();
  if (!keyResult.ok) {
    logResolve("resolve_complete", {
      duration_ms: 0,
      outcome: "skipped",
      line_count,
      opportunity_id,
      uploaded_invoice_id,
      client_trace_id,
      reason: "catalogos_api_key_blocked",
      error_kind: keyResult.reason,
    });
    return { ok: false, skipped: true, reason: keyResult.reason };
  }

  const url = `${base.replace(/\/$/, "")}/api/internal/invoice/resolve-lines`;
  const timeoutMs = resolveTimeoutMs();
  let lastStatus: number | undefined;
  let lastErrorKind: string | undefined;
  const overallStart = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const attemptStart = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": keyResult.key,
        },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      clearTimeout(timer);
      const attemptMs = Date.now() - attemptStart;
      lastStatus = res.status;

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastErrorKind = `http_${res.status}`;
        logResolve("resolve_attempt", {
          duration_ms: attemptMs,
          http_status: res.status,
          outcome: "failed",
          attempt,
          line_count,
          opportunity_id,
          uploaded_invoice_id,
          client_trace_id,
          error_kind: lastErrorKind,
        });
        if (attempt < MAX_ATTEMPTS && RETRYABLE_STATUS.has(res.status)) {
          await sleep(300 * attempt + Math.floor(Math.random() * 120));
          continue;
        }
        logResolve("resolve_complete", {
          duration_ms: Date.now() - overallStart,
          http_status: res.status,
          outcome: "failed",
          line_count,
          opportunity_id,
          uploaded_invoice_id,
          client_trace_id,
          error_kind: lastErrorKind,
        });
        return { ok: false, error: text?.slice(0, 500) || res.statusText, status: res.status };
      }

      let json: { ok?: boolean; results?: CatalogosResolveLineResult[] };
      try {
        json = (await res.json()) as { ok?: boolean; results?: CatalogosResolveLineResult[] };
      } catch {
        logResolve("resolve_complete", {
          duration_ms: Date.now() - overallStart,
          http_status: res.status,
          outcome: "failed",
          line_count,
          opportunity_id,
          uploaded_invoice_id,
          client_trace_id,
          error_kind: "invalid_json",
        });
        return { ok: false, error: "invalid_catalogos_response", status: res.status };
      }

      if (!json.results || !Array.isArray(json.results)) {
        logResolve("resolve_complete", {
          duration_ms: Date.now() - overallStart,
          http_status: res.status,
          outcome: "failed",
          line_count,
          opportunity_id,
          uploaded_invoice_id,
          client_trace_id,
          error_kind: "invalid_catalogos_shape",
        });
        return { ok: false, error: "invalid_catalogos_response", status: res.status };
      }

      logResolve("resolve_complete", {
        duration_ms: Date.now() - overallStart,
        http_status: res.status,
        outcome: "ok",
        attempt,
        line_count,
        opportunity_id,
        uploaded_invoice_id,
        client_trace_id,
      });
      return { ok: true, results: json.results };
    } catch (e) {
      clearTimeout(timer);
      const attemptMs = Date.now() - attemptStart;
      const aborted = e instanceof Error && e.name === "AbortError";
      lastErrorKind = aborted ? "timeout" : "network";
      logResolve("resolve_attempt", {
        duration_ms: attemptMs,
        http_status: null,
        outcome: "failed",
        attempt,
        line_count,
        opportunity_id,
        uploaded_invoice_id,
        client_trace_id,
        error_kind: lastErrorKind,
      });
      if (attempt < MAX_ATTEMPTS && (aborted || e instanceof TypeError)) {
        await sleep(300 * attempt + Math.floor(Math.random() * 120));
        continue;
      }
      logResolve("resolve_complete", {
        duration_ms: Date.now() - overallStart,
        http_status: lastStatus,
        outcome: "failed",
        line_count,
        opportunity_id,
        uploaded_invoice_id,
        client_trace_id,
        error_kind: lastErrorKind,
      });
      return {
        ok: false,
        error: aborted ? "catalogos_timeout" : "catalogos_fetch_failed",
        status: aborted ? 408 : undefined,
      };
    }
  }

  return { ok: false, error: "catalogos_exhausted_retries", status: lastStatus };
}
