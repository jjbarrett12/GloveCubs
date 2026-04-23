/**
 * POST /api/bulk-quote — submit bulk pricing request.
 * Body: { product_id, business_name, email, boxes_per_month?, notes? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";

function validateEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const productId = typeof body.product_id === "string" ? body.product_id.trim() : null;
    const businessName = typeof body.business_name === "string" ? body.business_name.trim() : null;
    const email = typeof body.email === "string" ? body.email.trim() : null;
    const boxesPerMonth = typeof body.boxes_per_month === "number" && body.boxes_per_month >= 0
      ? body.boxes_per_month
      : body.boxes_per_month != null
        ? parseInt(String(body.boxes_per_month), 10)
        : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (!productId || !businessName || !email) {
      return NextResponse.json(
        { error: "product_id, business_name, and email are required" },
        { status: 400 }
      );
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const supabase = getSupabaseCatalogos(true);
    const { data, error } = await supabase
      .from("bulk_quote_requests")
      .insert({
        product_id: productId,
        business_name: businessName,
        email,
        boxes_per_month: Number.isFinite(boxesPerMonth) ? boxesPerMonth : null,
        notes: notes ?? null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23503") {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      console.error("[bulk-quote] insert error:", error);
      return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id, ok: true });
  } catch (e) {
    console.error("[bulk-quote] error:", e);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
