import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminNotificationEmail, isSmtpConfigured, sendSmtpMail } from "@/lib/email/smtp";
import { recordQuoteCartSpine } from "@/lib/procurement/spine-writes";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import { resolveQuoteShipToSnapshot } from "@/lib/commerce/quote-request-ship-to";
import { formatShipToLabel } from "@/lib/commerce/ship-to-address-format";

const itemSchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().optional(),
  brandName: z.string().nullable().optional(),
  quantity: z.number().int().positive().max(99999),
  /** Optional per-line buyer note (stored on quote_line_items.notes). */
  line_note: z.string().trim().max(2000).optional().nullable(),
  catalog_variant_id: z.string().uuid().nullish(),
  variant_sku: z.string().max(200).nullish(),
  size_code: z.string().max(80).nullish(),
});

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email(),
    company: z.string().trim().max(300).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    notes: z.string().trim().max(8000).optional().nullable(),
    items: z.array(itemSchema).min(1),
    /** Phase 2B: ontology environment when submitting from prep-line flows */
    operational_environment_key: z.literal("restaurant_prep_line").optional().nullable(),
    /** Honeypot */
    website: z.string().optional().nullable(),
    /** Idempotent replay: first saved quote wins; ship-to snapshot is never mutated on replay. */
    idempotency_key: z.string().trim().min(1).max(200).optional().nullable(),
    /** Optional company ship-to row id; validated server-side against active company. */
    ship_to_address_id: z.string().uuid().optional().nullable(),
  })
  .strict();

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

  const idemKey = body.idempotency_key?.trim() || null;
  if (idemKey) {
    const { data: existingId, error: idemErr } = await supabase
      .schema("catalogos")
      .from("quote_requests")
      .select("id")
      .eq("idempotency_key", idemKey)
      .maybeSingle();
    if (idemErr) {
      console.error("[POST /api/quote-request] idempotency lookup failed", idemErr);
      return NextResponse.json({ error: idemErr.message }, { status: 500 });
    }
    if (existingId && typeof (existingId as { id?: unknown }).id === "string") {
      return NextResponse.json({
        success: true,
        quote_request_id: (existingId as { id: string }).id,
        duplicate: true,
        email_notification_sent: false,
        procurement_opportunity_id: null,
        buyer_display_ref: null,
      });
    }
  }

  let gcCompanyId: string | null = null;
  let gateReady = false;
  try {
    const gate = await resolveCustomerProcurementGate(supabase);
    if (gate.kind === "ready") {
      gcCompanyId = gate.session.companyId;
      gateReady = true;
    }
  } catch {
    gcCompanyId = null;
    gateReady = false;
  }

  let shipToAddressId: string | null = null;
  let shipToLabel: string | null = null;
  let shipToSnapshot: Record<string, unknown> | null = null;

  const requestedShipTo = body.ship_to_address_id?.trim() || null;
  if (requestedShipTo) {
    if (!gateReady || !gcCompanyId) {
      return NextResponse.json(
        { error: "Ship-to selection requires a signed-in buyer with an active company" },
        { status: 400 },
      );
    }
    const resolved = await resolveQuoteShipToSnapshot(supabase, gcCompanyId, requestedShipTo);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    shipToAddressId = resolved.ship.ship_to_address_id;
    shipToLabel = resolved.ship.ship_to_label;
    shipToSnapshot = resolved.ship.ship_to_snapshot;
  }

  const companyName = body.company?.trim() || "Unknown";
  const contactName = body.name.trim();
  const email = body.email.trim();

  const phone = body.phone?.trim() || null;
  const submittedAt = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    company_name: companyName,
    contact_name: contactName,
    email,
    notes: body.notes?.trim() || null,
    phone,
    status: "new",
    submitted_at: submittedAt,
    gc_company_id: gcCompanyId,
    idempotency_key: idemKey,
    ship_to_address_id: shipToAddressId,
    ship_to_label: shipToLabel,
    ship_to_snapshot: shipToSnapshot,
  };

  const { data: qrRaw, error: qrErr } = await supabase
    .schema("catalogos")
    .from("quote_requests")
    .insert(insertPayload as never)
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
      const lineNote = item.line_note?.trim() || null;
      const snapshot = {
        product_name: item.name,
        slug: item.slug ?? null,
        brand: item.brandName ?? null,
        catalog_v2_product_id: item.product_id,
        catalog_v2_variant_id: item.catalog_variant_id ?? null,
        variant_sku: item.variant_sku ?? null,
        size_code: item.size_code ?? null,
        quantity: item.quantity,
        line_note: lineNote,
      };

      const { error: lineErr } = await supabase.schema("catalogos").from("quote_line_items").insert({
        quote_request_id: quoteRequestId,
        product_id: item.product_id,
        quantity: item.quantity,
        notes: lineNote,
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

  const deliveryBlock =
    shipToSnapshot != null
      ? [
          "",
          "Requested delivery location (quote-time snapshot):",
          formatShipToLabel(shipToLabel, shipToSnapshot),
          `ship_to_address_id: ${shipToAddressId ?? "—"}`,
        ].join("\n")
      : "";

  const adminTo = getAdminNotificationEmail();
  const linesText = body.items
    .map((i) => {
      const variantBits = [
        i.catalog_variant_id ? `variant_id: ${i.catalog_variant_id}` : null,
        i.variant_sku ? `variant_sku: ${i.variant_sku}` : null,
        i.size_code ? `size: ${i.size_code}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      const suffix = variantBits ? ` (${variantBits})` : "";
      const ln = i.line_note?.trim();
      const noteLine = ln ? `\n  Line note: ${ln}` : "";
      return `- ${i.name} × ${i.quantity} (catalog_v2 product: ${i.product_id})${suffix}${noteLine}`;
    })
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
      `Phone: ${phone || "—"}`,
      deliveryBlock,
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

  let procurement_opportunity_id: string | null = null;
  let buyer_display_ref: string | null = null;
  try {
    const spine = await recordQuoteCartSpine(supabase, {
      operationalEnvironmentKey: body.operational_environment_key ?? null,
      quoteRequestId: quoteRequestId,
      companyName: companyName,
      contactName: contactName,
      contactEmail: email,
      lineItemCount: body.items.length,
      emailNotificationSent,
    });
    if (spine) {
      procurement_opportunity_id = spine.opportunityId;
      buyer_display_ref = spine.buyerDisplayRef;
    }
  } catch (e) {
    console.error("[POST /api/quote-request] procurement spine write failed", e);
  }

  return NextResponse.json({
    success: true,
    quote_request_id: quoteRequestId,
    email_notification_sent: emailNotificationSent,
    procurement_opportunity_id,
    buyer_display_ref,
  });
}
