import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { isCatalogSupabaseEmergencyDisabled } from "@/lib/catalog/emergency-catalog-kill-switch";
import { getUseCases } from "@/lib/gloves/queries";

export async function GET() {
  if (isCatalogSupabaseEmergencyDisabled()) {
    return NextResponse.json(
      { error: "Catalog guidance is temporarily unavailable", catalogUnavailable: true, useCases: [] },
      { status: 503 },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  }
  try {
    const supabase = getSupabaseAdmin();
    const useCases = await getUseCases(supabase);
    return NextResponse.json({ useCases });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load use cases";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
