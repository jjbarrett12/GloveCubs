import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/db/client";
import { updateStagingStatusSchema } from "@/lib/validations/schemas";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid staging id" }, { status: 400 });
  }
  try {
    const body = await _req.json();
    const parsed = updateStagingStatusSchema.safeParse({ ...body, staging_id: id });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }
    // Legacy public.catalogos_staging_products omitted from generated Database type
    const supabase = getSupabase(true) as SupabaseClient;
    const update: { status: string; master_product_id?: number | null } = { status: parsed.data.status };
    if (parsed.data.master_product_id !== undefined) update.master_product_id = parsed.data.master_product_id;
    const { data, error } = await supabase
      .from("catalogos_staging_products")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[CatalogOS] staging PATCH error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}
