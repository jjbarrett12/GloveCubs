import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAdminNotificationEmail, sendSmtpMail } from "@/lib/email/smtp";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  company: z.string().trim().max(200).optional().nullable(),
  message: z.string().trim().min(1).max(20000),
  /** Honeypot — must be empty for real submissions */
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

  const payload = {
    name: body.name,
    email: body.email,
    company: body.company ?? "",
    message: body.message,
  };

  const supabase = getSupabaseAdmin();
  const { data: insertedRaw, error: insertError } = await supabase
    .from("contact_messages")
    .insert({ payload } as never)
    .select("id")
    .single();

  const inserted = insertedRaw as { id: number } | null;

  if (insertError || !inserted) {
    console.error("[POST /api/contact] insert failed", insertError);
    return NextResponse.json({ error: insertError?.message || "Failed to save message" }, { status: 500 });
  }

  const adminTo = getAdminNotificationEmail();
  const text = [
    "New contact form submission (storefront)",
    "",
    `Message id: ${inserted.id}`,
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company || "—"}`,
    "",
    "Message:",
    payload.message,
  ].join("\n");

  const mail = await sendSmtpMail({
    to: adminTo,
    subject: `[GloveCubs] Contact from ${payload.name}`,
    text,
  });
  if (!mail.sent) {
    console.error("[POST /api/contact] admin email not sent", mail.error);
  }

  return NextResponse.json({ success: true, id: inserted.id });
}
