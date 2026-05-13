import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export type AdminCategoryOption = { id: string; name: string; slug: string | null };

export async function fetchAdminCategoriesForProductForm(): Promise<AdminCategoryOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("catalogos")
    .from("categories")
    .select("id, name, slug")
    .order("name", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[admin categories]", error.message);
    return [];
  }
  return (data ?? []) as AdminCategoryOption[];
}
