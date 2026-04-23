/**
 * Audit trail for sensitive supplier import job actions (structured console + import_batch_logs).
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export type SupplierImportAuditAction = "approve" | "publish" | "cancel" | "resume" | "start";

export async function logSupplierImportSensitiveAction(input: {
  action: SupplierImportAuditAction;
  jobId: string;
  batchId: string | null;
  organizationId: string;
  operatorId: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const payload = {
    ts: new Date().toISOString(),
    entity: "supplier_import_job",
    ...input,
  };
  if (process.env.NODE_ENV === "production") {
    console.info(JSON.stringify({ type: "supplier_import_audit", ...payload }));
  } else {
    console.warn("[supplier_import_audit]", payload.action, payload);
  }

  if (input.batchId) {
    try {
      const supabase = getSupabaseCatalogos(true);
      await supabase.from("import_batch_logs").insert({
        batch_id: input.batchId,
        step: "supplier_import_audit",
        status: "success",
        message: input.action,
        payload: {
          job_id: input.jobId,
          organization_id: input.organizationId,
          operator_id: input.operatorId,
          ...(input.detail ?? {}),
        },
      });
    } catch {
      /* never throw from audit */
    }
  }
}
