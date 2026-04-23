/**
 * Get or create supplier by name for URL import jobs.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

function slugFrom(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `supplier-${Date.now()}`;
}

export async function getOrCreateSupplierId(name: string): Promise<string> {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("Supplier name is required");
  const supabase = getSupabaseCatalogos(true);
  const slug = slugFrom(trimmed);
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: inserted, error } = await supabase
    .from("suppliers")
    .insert({
      name: trimmed,
      slug: slug.length ? slug : `supplier-${Date.now()}`,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create supplier: ${error.message}`);
  return (inserted as { id: string }).id;
}
