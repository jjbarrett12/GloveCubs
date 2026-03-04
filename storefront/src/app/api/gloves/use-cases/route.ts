import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getUseCases } from "@/lib/gloves/queries";

export async function GET() {
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
