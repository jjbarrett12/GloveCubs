import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminNotificationEmail, isSmtpConfigured, sendSmtpMail } from "@/lib/email/smtp";

const itemSchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().optional(),
  brandName: z.string().nullable().optional(),
  quantity: z.number().int().positive().max(99999),
});

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  company: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(8000).optional().nullable(),
  items: z.array(itemSchema).min(1),
  /** Honeypot */
  website: z.string().optional().nullable(),
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

  const supabase = getSupabaseAdmin() as any;

  const companyName = body.company?.trim() || "Unknown";
  const contactName = body.name.trim();
  const email = body.email.trim();

  const { data: qrRaw, error: qrErr } = await supabase
    .schema("catalogos")
    .from("quote_requests")
    .insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      notes: body.notes?.trim() || null,
      phone: null,
      status: "new",
    })
    .select("id")
    .single();

  const qr = qrRaw as { id: string } | null;

  if (qrErr || !qr) {
    console.error("[POST /api/quote-request] quote_requests insert failed", qrErr);
    return NextResponse.json({ error: qrErr?.message || "Failed to save quote request" }, { status: 500 });
  }

  const quoteRequestId = qr.id;

  try {
    for (const item of body.items) {
      const snapshot = {
        product_name: item.name,
        slug: item.slug ?? null,
        brand: item.brandName ?? null,
        catalog_v2_product_id: item.product_id,
        quantity: item.quantity,
      };

      const { error: lineErr } = await supabase.schema("catalogos").from("quote_line_items").insert({
        quote_request_id: quoteRequestId,
        product_id: item.product_id,
        quantity: item.quantity,
        notes: null,
        product_snapshot: snapshot,
      } as never);

      if (lineErr) {
        throw lineErr;
      }
    }
  } catch (e) {
    console.error("[POST /api/quote-request] line items failed", e);
    await supabase.schema("catalogos").from("quote_requests").delete().eq("id", quoteRequestId);
    const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Failed to save line items";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const adminTo = getAdminNotificationEmail();
  const linesText = body.items
    .map((i) => `- ${i.name} × ${i.quantity} (catalog_v2 id: ${i.product_id})`)
    .join("\n");

  const mail = await sendSmtpMail({
    to: adminTo,
    subject: `[GloveCubs] Quote request from ${contactName} (${companyName})`,
    text: [
      "New quote request (storefront)",
      "",
      `Quote request id: ${quoteRequestId}`,
      `Contact: ${contactName}`,
      `Email: ${email}`,
      `Company: ${companyName}`,
      "",
      "Notes:",
      body.notes?.trim() || "—",
      "",
      "Lines:",
      linesText,
    ].join("\n"),
  });

  const emailNotificationSent = mail.sent === true;
  const prod = process.env.NODE_ENV === "production";

  if (!emailNotificationSent) {
    if (prod) {
      console.error(
        "[POST /api/quote-request] PRODUCTION_ALERT quote_saved_email_failed",
        JSON.stringify({
          quote_request_id: quoteRequestId,
          reason: mail.error ?? "unknown",
          smtp_configured: isSmtpConfigured(),
        })
      );
    } else {
      console.warn(
        "[POST /api/quote-request] email_notification not sent (dev)",
        mail.error ?? "SMTP not configured or send failed"
      );
    }
  }

  return NextResponse.json({
    success: true,
    quote_request_id: quoteRequestId,
    email_notification_sent: emailNotificationSent,
  });
}
