import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminNotificationEmail, sendSmtpMail } from "@/lib/email/smtp";
import { recordRequestPricingSpine } from "@/lib/procurement/spine-writes";
import { logPublicFunnel } from "@/lib/observability/public-funnel-log";

const bodySchema = z
  .object({
    company_name: z.string().trim().min(1).max(500),
    contact_name: z.string().trim().max(200).optional().nullable(),
    email: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.union([z.string().email(), z.null()])
    ),
    phone: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.union([z.string().trim().max(80), z.null()])
    ),
    notes: z.string().trim().max(4000).optional().nullable(),
    source: z.string().trim().max(120).optional().nullable(),
    operational_environment_key: z.literal("restaurant_prep_line").optional().nullable(),
    procurement_opportunity_id: z.string().uuid().optional().nullable(),
    client_trace_id: z.string().uuid().optional().nullable(),
    /** Honeypot — must be empty for real submissions */
    website: z.string().optional().nullable(),
  })
  .refine((d) => d.email != null || d.phone != null, {
    message: "Email or phone is required",
  });

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();

  if (!isSupabaseConfigured()) {
    logPublicFunnel("lead_request_pricing", "service_unavailable", { correlation_id: correlationId });
    return NextResponse.json({ error: "Service unavailable", correlation_id: correlationId }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    logPublicFunnel("lead_request_pricing", "invalid_json", { correlation_id: correlationId });
    return NextResponse.json({ error: "Invalid JSON", correlation_id: correlationId }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    logPublicFunnel("lead_request_pricing", "invalid_body", { correlation_id: correlationId });
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten(), correlation_id: correlationId },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const traceId = body.client_trace_id ?? correlationId;

  if (body.website != null && String(body.website).trim() !== "") {
    logPublicFunnel("lead_request_pricing", "honeypot_ignored", { correlation_id: correlationId, trace_id: traceId });
    return NextResponse.json({ ok: true, ignored: true, correlation_id: correlationId });
  }

  const supabase = getSupabaseAdmin() as any;

  const insertRow = {
    company_name: body.company_name,
    contact_name: body.contact_name ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    notes: body.notes ?? null,
    source: body.source?.trim() || "request_pricing",
    status: "new",
  };

  const { data: insertedRaw, error: insertError } = await supabase
    .from("sales_prospects")
    .insert(insertRow as never)
    .select("id")
    .single();

  const inserted = insertedRaw as { id: number } | null;

  if (insertError || !inserted) {
    logPublicFunnel("lead_request_pricing", "db_insert_failed", {
      correlation_id: correlationId,
      trace_id: traceId,
      error_code: insertError?.code ?? "unknown",
      message: insertError?.message?.slice(0, 300) ?? "insert_failed",
    });
    return NextResponse.json(
      { error: insertError?.message || "Failed to save lead", correlation_id: correlationId },
      { status: 500 }
    );
  }

  logPublicFunnel("lead_request_pricing", "db_insert_ok", {
    correlation_id: correlationId,
    trace_id: traceId,
    prospect_id: inserted.id,
  });

  const adminTo = getAdminNotificationEmail();

  const text = [
    "New request-pricing lead (storefront)",
    "",
    `Prospect id: ${inserted.id}`,
    `Company: ${insertRow.company_name}`,
    `Contact: ${insertRow.contact_name ?? "—"}`,
    `Email: ${insertRow.email ?? "—"}`,
    `Phone: ${insertRow.phone ?? "—"}`,
    `Source: ${insertRow.source}`,
    "",
    "Notes:",
    insertRow.notes ?? "—",
  ].join("\n");

  const mail = await sendSmtpMail({
    to: adminTo,
    subject: `[GloveCubs] Request pricing: ${insertRow.company_name}`,
    text,
  });

  const emailDelivered = mail.sent === true;
  if (!emailDelivered) {
    const reason = mail.error ?? "smtp_not_configured_or_send_failed";
    logPublicFunnel("lead_request_pricing", "smtp_not_delivered", {
      correlation_id: correlationId,
      trace_id: traceId,
      prospect_id: inserted.id,
      reason: String(reason).slice(0, 200),
    });
  } else {
    logPublicFunnel("lead_request_pricing", "smtp_ok", {
      correlation_id: correlationId,
      trace_id: traceId,
      prospect_id: inserted.id,
    });
  }

  let procurement_opportunity_id: string | null = null;
  let buyer_display_ref: string | null = null;
  try {
    const spine = await recordRequestPricingSpine(supabase, {
      operationalEnvironmentKey: body.operational_environment_key ?? null,
      salesProspectId: inserted.id,
      companyName: insertRow.company_name,
      contactName: insertRow.contact_name ?? null,
      contactEmail: insertRow.email ?? null,
      emailDelivered,
      existingOpportunityId: body.procurement_opportunity_id ?? null,
      clientTraceId: body.client_trace_id ?? null,
    });
    if (spine) {
      procurement_opportunity_id = spine.opportunityId;
      buyer_display_ref = spine.buyerDisplayRef;
      logPublicFunnel("lead_request_pricing", "spine_ok", {
        correlation_id: correlationId,
        trace_id: traceId,
        prospect_id: inserted.id,
        procurement_opportunity_id: spine.opportunityId,
      });
    } else {
      logPublicFunnel("lead_request_pricing", "spine_skipped_or_empty", {
        correlation_id: correlationId,
        trace_id: traceId,
        prospect_id: inserted.id,
      });
    }
  } catch (e) {
    logPublicFunnel("lead_request_pricing", "spine_failed", {
      correlation_id: correlationId,
      trace_id: traceId,
      prospect_id: inserted.id,
      error_kind: e instanceof Error ? e.name : "unknown",
      message: e instanceof Error ? e.message.slice(0, 300) : "spine_error",
    });
  }

  return NextResponse.json({
    success: true,
    correlation_id: correlationId,
    ...(body.client_trace_id ? { client_trace_id: body.client_trace_id } : {}),
    id: inserted.id,
    procurement_opportunity_id,
    buyer_display_ref,
    emailDelivered,
    ...(emailDelivered
      ? {}
      : {
          warning:
            "Your inquiry was saved. We could not send an internal email notification automatically—if you do not hear from us, please call or email using the contact page.",
        }),
  });
}
