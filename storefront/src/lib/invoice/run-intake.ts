import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { aiExtractInvoice } from "@/lib/ai/provider";
import { logAiEvent } from "@/lib/ai/telemetry";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai";
import type { InvoiceExtractResponse } from "@/lib/ai/schemas";
import {
  INVOICE_INTAKE_EXTRACTION_VERSION,
  type IntakeStatus,
  type InvoiceIntakeContract,
  type InvoiceIntakeIdentity,
} from "@/lib/invoice/intake-types";
import {
  insertProcurementOpportunity,
  findOpportunityByIdempotencyKey,
  updateProcurementOpportunity,
  appendProcurementEvent,
} from "@/lib/procurement/opportunity-service";
import { ProcurementEventType } from "@/lib/procurement/event-taxonomy";
import { processInvoicePhase2 } from "@/lib/invoice/invoice-phase2";
import { recordInvoiceIntakeSpine } from "@/lib/procurement/spine-writes";
import { logPublicFunnel } from "@/lib/observability/public-funnel-log";
import { resolveActiveCompanyId } from "@/lib/procurement/repo-active-company-resolve";

export const INVOICE_INTAKE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILE_SIZE = INVOICE_INTAKE_MAX_BYTES;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function normalizeInvoiceMime(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

export type RunInvoiceIntakeFile = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export type RunInvoiceIntakeInput = {
  supabase: any;
  /** When set (tests), skips cookie/session resolution. */
  identityOverride?: InvoiceIntakeIdentity | null;
  idempotencyKeyHeader: string | null;
  anonymousSessionId: string | null;
  file: RunInvoiceIntakeFile;
};

export type RunInvoiceIntakeSuccess = { ok: true; status: number; contract: InvoiceIntakeContract };
export type RunInvoiceIntakeError = { ok: false; status: number; body: Record<string, unknown> };
export type RunInvoiceIntakeResult = RunInvoiceIntakeSuccess | RunInvoiceIntakeError;

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function isPostgresUniqueViolation(err: unknown): boolean {
  const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
  return code === "23505";
}

async function fetchCompanyTradeName(supabase: any, companyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("trade_name")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  const name = (data as { trade_name?: string }).trade_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * Resolves storefront auth user + active gc_commerce company (canonical resolver).
 */
export async function resolveInvoiceIntakeIdentity(supabaseAdmin: any): Promise<InvoiceIntakeIdentity> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !anon?.trim()) {
    return {
      authenticated: false,
      company_id: null,
      user_id: null,
      anonymous_session_id: null,
    };
  }
  const cookieStore = await cookies();
  const authClient = createServerClient(url.trim(), anon.trim(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user?.id) {
    return {
      authenticated: false,
      company_id: null,
      user_id: null,
      anonymous_session_id: null,
    };
  }
  const r = await resolveActiveCompanyId(String(user.id), { supabase: supabaseAdmin });
  const companyId = r.companyId;
  return {
    authenticated: true,
    company_id: companyId,
    user_id: user.id,
    anonymous_session_id: null,
  };
}

async function findIntakeByOpportunityId(supabase: any, opportunityId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("*")
    .eq("procurement_opportunity_id", opportunityId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

async function findIntakeByIdempotencyKey(supabase: any, idempotencyKey: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

async function findIntakeByCompanyAndSha(
  supabase: any,
  companyId: string,
  contentSha256: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("*")
    .eq("company_id", companyId)
    .eq("content_sha256", contentSha256)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

function buildContract(params: {
  intakeRow: Record<string, unknown>;
  opportunityId: string;
  identity: InvoiceIntakeIdentity;
  document: InvoiceIntakeContract["document"];
  idempotencyKey: string;
  idempotentReplay: boolean;
  extract: InvoiceExtractResponse | null;
  extractionState: InvoiceIntakeContract["extraction"]["state"];
  extractionError: string | null;
  intakeStatus: InvoiceIntakeContract["intake_status"];
  phase2Error?: string | null;
}): InvoiceIntakeContract {
  const r = params.intakeRow;
  const createdAt = String(r.created_at ?? new Date().toISOString());
  const updatedAt = String(r.updated_at ?? createdAt);
  return {
    intake_id: String(r.id),
    procurement_opportunity_id: params.opportunityId,
    intake_status: params.intakeStatus,
    identity: params.identity,
    document: params.document,
    idempotency_key: params.idempotencyKey,
    extraction: {
      state: params.extractionState,
      version: INVOICE_INTAKE_EXTRACTION_VERSION,
      model: typeof r.extraction_model === "string" ? r.extraction_model : (r.extraction_model as string | null) ?? null,
      completed_at: r.extracted_at ? String(r.extracted_at) : null,
      error: params.extractionError,
    },
    timestamps: { created_at: createdAt, updated_at: updatedAt },
    idempotent_replay: params.idempotentReplay,
    vendor_name: params.extract?.vendor_name ?? null,
    invoice_number: params.extract?.invoice_number ?? null,
    total_amount: params.extract?.total_amount ?? null,
    lines: params.extract?.lines ?? [],
    persisted_line_count: r.line_count_persisted == null ? null : Number(r.line_count_persisted),
    aggregate_review_status: typeof r.aggregate_review_status === "string" ? r.aggregate_review_status : null,
    phase2_error: params.phase2Error ?? null,
  };
}

async function maybeWriteDebugTmp(buffer: Buffer, filename: string): Promise<void> {
  const flag = process.env.DEBUG_INVOICE_TMP;
  if (flag !== "true" && flag !== "1") return;
  const dir = path.join(os.tmpdir(), "glovecubs-invoice");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${filename}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  await writeFile(path.join(dir, name), buffer);
}

/**
 * Single orchestration entry for invoice file intake (Phase 1).
 */
export async function runInvoiceIntake(input: RunInvoiceIntakeInput): Promise<RunInvoiceIntakeResult> {
  const { supabase, file } = input;
  const buf = file.buffer;
  const idemPrefix = input.idempotencyKeyHeader?.trim().slice(0, 48) || null;
  if (buf.length > MAX_FILE_SIZE) {
    logPublicFunnel("invoice_intake", "validate_rejected", {
      reason: "file_too_large",
      byte_size: buf.length,
      max_bytes: MAX_FILE_SIZE,
      idempotency_key_prefix: idemPrefix,
    });
    return {
      ok: false,
      status: 413,
      body: {
        error: "File too large (max 10MB)",
        code: "FILE_TOO_LARGE",
      },
    };
  }
  const mt = normalizeInvoiceMime(file.mimeType || "application/octet-stream");
  if (!ALLOWED_TYPES.has(mt)) {
    logPublicFunnel("invoice_intake", "validate_rejected", {
      reason: "unsupported_media_type",
      mime_type: mt,
      idempotency_key_prefix: idemPrefix,
    });
    return {
      ok: false,
      status: 415,
      body: {
        error: "Allowed: JPEG, PNG, WebP, or PDF",
        code: "UNSUPPORTED_MEDIA_TYPE",
      },
    };
  }

  const contentSha256 = sha256Hex(buf);
  const idempotencyKey = (input.idempotencyKeyHeader?.trim() || randomUUID()).slice(0, 200);
  const identity: InvoiceIntakeIdentity =
    input.identityOverride != null
      ? input.identityOverride
      : {
          ...(await resolveInvoiceIntakeIdentity(supabase)),
          anonymous_session_id: input.anonymousSessionId?.trim() || null,
        };

  const document: InvoiceIntakeContract["document"] = {
    filename: file.filename.slice(0, 500),
    mime_type: mt,
    byte_size: buf.length,
    content_sha256: contentSha256,
  };

  const existingOpp = await findOpportunityByIdempotencyKey(supabase, idempotencyKey);
  if (existingOpp) {
    const intakeRow = await findIntakeByOpportunityId(supabase, existingOpp.id);
    if (!intakeRow) {
      logPublicFunnel("invoice_intake", "incomplete_intake", {
        opportunity_id: existingOpp.id,
        idempotency_key_prefix: idempotencyKey.slice(0, 48),
      });
      return {
        ok: false,
        status: 500,
        body: { error: "incomplete_intake", detail: "Opportunity exists without intake row" },
      };
    }
    const payload = (intakeRow.payload as Record<string, unknown> | null) ?? {};
    const extract = (payload.last_extract as InvoiceExtractResponse | null) ?? null;
    const contract = buildContract({
      intakeRow,
      opportunityId: existingOpp.id,
      identity,
      document,
      idempotencyKey,
      idempotentReplay: true,
      extract,
      extractionState: String(intakeRow.intake_status) === "extracted_failed" ? "failed" : extract ? "ok" : "failed",
      extractionError: typeof intakeRow.extraction_error === "string" ? intakeRow.extraction_error : null,
      intakeStatus: intakeRow.intake_status as InvoiceIntakeContract["intake_status"],
    });
    logPublicFunnel("invoice_intake", "idempotent_replay", {
      intake_id: String(intakeRow.id),
      opportunity_id: existingOpp.id,
      idempotency_key_prefix: idempotencyKey.slice(0, 48),
    });
    return { ok: true, status: 200, contract };
  }

  if (identity.company_id) {
    const shaDup = await findIntakeByCompanyAndSha(supabase, identity.company_id, contentSha256);
    if (shaDup && String(shaDup.idempotency_key ?? "") !== idempotencyKey) {
      logPublicFunnel("invoice_intake", "duplicate_invoice_bytes", {
        intake_id: String(shaDup.id),
        company_id: identity.company_id,
        idempotency_key_prefix: idempotencyKey.slice(0, 48),
      });
      return {
        ok: false,
        status: 409,
        body: {
          error: "duplicate_invoice_bytes",
          intake_id: String(shaDup.id),
          message: "Same file was already uploaded for this company under a different idempotency key.",
        },
      };
    }
  }

  const companyName =
    identity.company_id != null ? (await fetchCompanyTradeName(supabase, identity.company_id)) ?? "Unknown" : "Unknown";

  let opportunityId: string;
  const created = await insertProcurementOpportunity(supabase, {
    source: "invoice",
    idempotency_key: idempotencyKey,
    company_name: companyName,
    contact_name: null,
    contact_email: null,
    metadata: {
      approved_product_ids: [] as string[],
      rejected_product_ids: [] as string[],
      substitution_history: [] as unknown[],
      invoice_intake_phase: 1,
    },
  });
  if (!created) {
    const raced = await findOpportunityByIdempotencyKey(supabase, idempotencyKey);
    if (raced) {
      const intakeRow = await findIntakeByOpportunityId(supabase, raced.id);
      if (intakeRow) {
        const payload = (intakeRow.payload as Record<string, unknown> | null) ?? {};
        const extract = (payload.last_extract as InvoiceExtractResponse | null) ?? null;
        return {
          ok: true,
          status: 200,
          contract: buildContract({
            intakeRow,
            opportunityId: raced.id,
            identity,
            document,
            idempotencyKey,
            idempotentReplay: true,
            extract,
            extractionState: String(intakeRow.intake_status) === "extracted_failed" ? "failed" : extract ? "ok" : "failed",
            extractionError: typeof intakeRow.extraction_error === "string" ? intakeRow.extraction_error : null,
            intakeStatus: intakeRow.intake_status as InvoiceIntakeContract["intake_status"],
          }),
        };
      }
    }
    logPublicFunnel("invoice_intake", "opportunity_create_failed", {
      idempotency_key_prefix: idempotencyKey.slice(0, 48),
    });
    return { ok: false, status: 500, body: { error: "opportunity_create_failed" } };
  }
  opportunityId = created.id;

  const invoiceDate = new Date().toISOString().split("T")[0];
  let intakeRow: Record<string, unknown> | null = null;
  try {
    const { data, error } = await supabase
      .schema("gc_commerce")
      .from("uploaded_invoices")
      .insert({
        company_id: identity.company_id,
        created_by_user_id: identity.user_id,
        payload: {
          vendor: "Unknown",
          invoice_date: invoiceDate,
          total_amount: null,
          notes: "",
          line_items: [] as unknown[],
          intake_phase: 1,
        },
        content_sha256: contentSha256,
        idempotency_key: idempotencyKey,
        intake_status: "received",
        mime_type: mt,
        original_filename: file.filename.slice(0, 500),
        byte_size: buf.length,
        procurement_opportunity_id: opportunityId,
        anonymous_session_id: identity.anonymous_session_id,
        extraction_version: INVOICE_INTAKE_EXTRACTION_VERSION,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;
    intakeRow = data as Record<string, unknown>;
  } catch (e) {
    if (isPostgresUniqueViolation(e)) {
      const racedIntake = await findIntakeByIdempotencyKey(supabase, idempotencyKey);
      if (racedIntake) {
        const payload = (racedIntake.payload as Record<string, unknown> | null) ?? {};
        const extract = (payload.last_extract as InvoiceExtractResponse | null) ?? null;
        return {
          ok: true,
          status: 200,
          contract: buildContract({
            intakeRow: racedIntake,
            opportunityId: String(racedIntake.procurement_opportunity_id ?? opportunityId),
            identity,
            document,
            idempotencyKey,
            idempotentReplay: true,
            extract,
            extractionState:
              String(racedIntake.intake_status) === "extracted_failed" ? "failed" : extract ? "ok" : "failed",
            extractionError: typeof racedIntake.extraction_error === "string" ? racedIntake.extraction_error : null,
            intakeStatus: racedIntake.intake_status as InvoiceIntakeContract["intake_status"],
          }),
        };
      }
      if (identity.company_id) {
        return {
          ok: false,
          status: 409,
          body: { error: "duplicate_invoice_bytes", message: String((e as Error).message ?? "unique violation") },
        };
      }
    }
    await updateProcurementOpportunity(supabase, opportunityId, { lifecycle_stage: "stale" }).catch(() => {});
    logPublicFunnel("invoice_intake", "intake_insert_failed", {
      opportunity_id: opportunityId,
      idempotency_key_prefix: idempotencyKey.slice(0, 48),
    });
    return { ok: false, status: 500, body: { error: "intake_insert_failed" } };
  }

  const uploadedInvoiceId = String(intakeRow!.id);

  const { data: oppRow } = await supabase.from("procurement_opportunities").select("metadata").eq("id", opportunityId).single();
  const prevMeta = (oppRow?.metadata as Record<string, unknown> | undefined) ?? {};
  await updateProcurementOpportunity(supabase, opportunityId, {
    metadata: {
      ...prevMeta,
      uploaded_invoice_id: uploadedInvoiceId,
      content_sha256: contentSha256,
    },
  });

  await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .update({ intake_status: "extracting", updated_at: new Date().toISOString() })
    .eq("id", uploadedInvoiceId);

  const spinePreOk = await recordInvoiceIntakeSpine(supabase, {
    phase: "pre",
    opportunityId,
    uploadedInvoiceId,
    idempotencyKey,
    companyId: identity.company_id,
    document,
    extractionVersion: INVOICE_INTAKE_EXTRACTION_VERSION,
    extractionModel: OPENAI_CHAT_MODEL,
  });
  if (!spinePreOk) {
    await supabase
      .schema("gc_commerce")
      .from("uploaded_invoices")
      .update({
        intake_status: "intake_failed",
        extraction_error: "procurement_event_write_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadedInvoiceId);
    logPublicFunnel("invoice_intake", "spine_pre_failed", {
      intake_id: uploadedInvoiceId,
      opportunity_id: opportunityId,
      stage: "pre",
    });
    return { ok: false, status: 500, body: { error: "spine_pre_failed", intake_id: uploadedInvoiceId } };
  }

  await maybeWriteDebugTmp(buf, file.filename);

  const base64 = buf.toString("base64");
  const visionMime = mt.startsWith("image/") ? mt : mt === "application/pdf" ? "application/pdf" : "image/png";
  const extractStart = Date.now();
  let extract: InvoiceExtractResponse | null = null;
  let extractOk = false;
  let extractErr: string | null = null;
  try {
    const result = await aiExtractInvoice(base64, visionMime);
    const latencyMs = Date.now() - extractStart;
    if (!result.ok) {
      extractErr = result.error;
      await logAiEvent(supabase, {
        event_type: "invoice_extract",
        model_used: OPENAI_CHAT_MODEL,
        tokens_estimate: null,
        success: false,
        latency_ms: latencyMs,
        meta: { error: result.error, intake_id: uploadedInvoiceId },
      }).catch(() => {});
    } else {
      extractOk = true;
      extract = result.data;
      await logAiEvent(supabase, {
        event_type: "invoice_extract",
        model_used: OPENAI_CHAT_MODEL,
        tokens_estimate: null,
        success: true,
        latency_ms: latencyMs,
        meta: { line_count: result.data.lines.length, intake_id: uploadedInvoiceId },
      }).catch(() => {});
    }
  } catch (e) {
    extractErr = e instanceof Error ? e.message : "extract_failed";
    await logAiEvent(supabase, {
      event_type: "invoice_extract",
      model_used: OPENAI_CHAT_MODEL,
      tokens_estimate: null,
      success: false,
      latency_ms: Date.now() - extractStart,
      meta: { error: extractErr, intake_id: uploadedInvoiceId },
    }).catch(() => {});
  }

  logPublicFunnel("invoice_intake", "extract_outcome", {
    intake_id: uploadedInvoiceId,
    opportunity_id: opportunityId,
    stage: "openai_extract",
    success: extractOk,
    duration_ms: Date.now() - extractStart,
    line_count: extract?.lines?.length ?? 0,
    error_code: extractErr ? String(extractErr).slice(0, 200) : null,
  });

  const intakeStatus: IntakeStatus = extractOk ? "extracted_ok" : "extracted_failed";
  const mergedPayload = {
    ...((intakeRow!.payload as Record<string, unknown>) ?? {}),
    vendor: extract?.vendor_name ?? "Unknown",
    invoice_date: invoiceDate,
    total_amount: extract?.total_amount ?? null,
    line_items: extract?.lines ?? [],
    last_extract: extract,
  };

  await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .update({
      intake_status: intakeStatus,
      extraction_model: OPENAI_CHAT_MODEL,
      extraction_version: INVOICE_INTAKE_EXTRACTION_VERSION,
      extracted_at: new Date().toISOString(),
      extraction_error: extractErr,
      payload: mergedPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", uploadedInvoiceId);

  const spinePostOk = await recordInvoiceIntakeSpine(supabase, {
    phase: "post",
    opportunityId,
    uploadedInvoiceId,
    extraction: {
      ok: extractOk,
      lineCount: extract?.lines?.length ?? null,
      vendorName: extract?.vendor_name ?? null,
      invoiceNumber: extract?.invoice_number ?? null,
      totalAmount: extract?.total_amount ?? null,
      error: extractErr,
    },
  });
  if (!spinePostOk) {
    await supabase
      .schema("gc_commerce")
      .from("uploaded_invoices")
      .update({
        intake_status: "intake_failed",
        extraction_error: "procurement_post_events_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadedInvoiceId);
    logPublicFunnel("invoice_intake", "spine_post_failed", {
      intake_id: uploadedInvoiceId,
      opportunity_id: opportunityId,
      stage: "post",
    });
    return { ok: false, status: 500, body: { error: "spine_post_failed", intake_id: uploadedInvoiceId } };
  }

  let phase2Error: string | null = null;
  const phase2 = await processInvoicePhase2({
    supabase,
    opportunityId,
    uploadedInvoiceId,
    extractOk,
    extract,
  });
  if (!phase2.ok) {
    phase2Error = phase2.error;
    logPublicFunnel("invoice_intake", "phase2_degraded", {
      intake_id: uploadedInvoiceId,
      opportunity_id: opportunityId,
      stage: "catalogos_matching",
      error_code: phase2.error,
    });
    await appendProcurementEvent(supabase, opportunityId, ProcurementEventType.stage_transition, {
      scope: "invoice_phase2",
      error: phase2.error,
    }).catch(() => {});
  }

  const { data: finalRow } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select("*")
    .eq("id", uploadedInvoiceId)
    .single();

  const contract = buildContract({
    intakeRow: (finalRow as Record<string, unknown>) ?? intakeRow!,
    opportunityId,
    identity,
    document,
    idempotencyKey,
    idempotentReplay: false,
    extract,
    extractionState: extractOk ? "ok" : "failed",
    extractionError: extractErr,
    intakeStatus,
    phase2Error,
  });

  logPublicFunnel("invoice_intake", "complete", {
    intake_id: uploadedInvoiceId,
    opportunity_id: opportunityId,
    extraction_ok: extractOk,
    intake_status: intakeStatus,
    phase2_ok: phase2.ok,
    idempotency_key_prefix: idempotencyKey.slice(0, 48),
  });

  return { ok: true, status: 200, contract };
}
