import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveQuoteContactPrefill } from "@/lib/quote-cart/resolve-quote-contact-prefill";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const prefill = await resolveQuoteContactPrefill(supabase);
  if (!prefill) {
    return NextResponse.json({ prefill: null });
  }

  return NextResponse.json({ prefill });
}
