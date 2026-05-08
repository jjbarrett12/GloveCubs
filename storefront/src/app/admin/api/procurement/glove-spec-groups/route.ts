import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const postSchema = z.object({
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
});

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("glove_spec_groups")
    .select("id, slug, name, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ groups: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const supabase = getSupabaseAdmin() as any;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("glove_spec_groups")
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      status: "draft",
      metadata: {},
      updated_at: now,
    })
    .select("id, slug, name, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}
