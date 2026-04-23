/**
 * Productionization: structured error logging for CatalogOS.
 * Logs to console and, when available, to public.error_telemetry so all apps share one telemetry surface.
 * Telemetry write is best-effort and must never crash the app.
 */

export type LogCategory =
  | "ingestion_failure"
  | "publish_failure"
  | "sync_canonical_products_failure"
  | "rpc_failure"
  | "validation_failure"
  | "api_failure"
  | "auth_failure"
  | "admin_action_failure"
  | "offer_upsert_failure";

export interface StructuredLog {
  ts: string;
  category: LogCategory;
  message: string;
  context?: Record<string, unknown>;
}

/** Severity for DB telemetry (critical/high/medium/low). */
const CATEGORY_SEVERITY: Record<LogCategory, "critical" | "high" | "medium" | "low"> = {
  ingestion_failure: "high",
  publish_failure: "high",
  sync_canonical_products_failure: "high",
  rpc_failure: "high",
  validation_failure: "medium",
  api_failure: "medium",
  auth_failure: "medium",
  admin_action_failure: "high",
  offer_upsert_failure: "high",
};

async function writeToErrorTelemetry(
  category: LogCategory,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    const { getSupabase } = await import("@/lib/db/client");
    const supabase = getSupabase(true) as unknown as {
      from: (table: string) => { insert: (row: unknown) => PromiseLike<{ error: unknown }> };
    };
    await supabase.from("error_telemetry").insert({
      category,
      severity: CATEGORY_SEVERITY[category],
      message: String(message).slice(0, 5000),
      context: context && typeof context === "object" ? context : undefined,
      entity_type: (context?.entity_type as string) ?? undefined,
      entity_id: (context?.entity_id as string) ?? undefined,
    });
  } catch {
    // never throw; telemetry must not crash the app
  }
}

function logStructured(category: LogCategory, message: string, context?: Record<string, unknown>): void {
  const payload: StructuredLog = {
    ts: new Date().toISOString(),
    category,
    message,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    console.error(JSON.stringify(payload));
  } else {
    console.warn(`[${category}]`, message, context ?? "");
  }
  void writeToErrorTelemetry(category, message, context);
  if (CATEGORY_SEVERITY[category] === "high" || CATEGORY_SEVERITY[category] === "critical") {
    void (async () => {
      try {
        const { captureException } = await import("@/lib/sentry");
        captureException(new Error(message), context);
      } catch {
        // never throw
      }
    })();
  }
}

export function logIngestionFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("ingestion_failure", message, context);
}

export function logPublishFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("publish_failure", message, context);
}

export function logSyncCanonicalProductsFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("sync_canonical_products_failure", message, context);
}

export function logRpcFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("rpc_failure", message, context);
}

export function logValidationFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("validation_failure", message, context);
}

export function logApiFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("api_failure", message, context);
}

export function logAuthFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("auth_failure", message, context);
}

export function logAdminActionFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("admin_action_failure", message, context);
}

export function logOfferUpsertFailure(message: string, context?: Record<string, unknown>): void {
  logStructured("offer_upsert_failure", message, context);
}
