import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminNotificationEmail, sendSmtpMail } from "@/lib/email/smtp";

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
    /** Honeypot — must be empty for real submissions */
    website: z.string().optional().nullable(),
  })
  .refine((d) => d.email != null || d.phone != null, {
    message: "Email or phone is required",
  });

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  if (body.website != null && String(body.website).trim() !== "") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = getSupabaseAdmin();

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
    console.error("[POST /api/leads/request-pricing] insert failed", insertError);
    return NextResponse.json({ error: insertError?.message || "Failed to save lead" }, { status: 500 });
  }

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
    console.warn("[POST /api/leads/request-pricing] lead saved but admin email not delivered", reason);
  }

  return NextResponse.json({
    success: true,
    id: inserted.id,
    emailDelivered,
    ...(emailDelivered
      ? {}
      : {
          warning:
            "Your inquiry was saved. We could not send an internal email notification automatically—if you do not hear from us, please call or email using the contact page.",
        }),
  });
}
