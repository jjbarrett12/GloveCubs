/**
 * CatalogOS suppliers — exact schema: catalogos.suppliers.
 * Strongly typed services using getSupabaseCatalogos.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface SupplierRow {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierInput {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  is_active?: boolean;
}

export async function listSuppliers(activeOnly = false): Promise<SupplierRow[]> {
  const supabase = getSupabaseCatalogos(true);
  let query = supabase.from("suppliers").select("id, name, slug, settings, is_active, created_at, updated_at").order("name");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierRow[];
}

export async function getSupplierById(id: string): Promise<SupplierRow | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("suppliers").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data as SupplierRow;
}

export async function createSupplier(input: CreateSupplierInput): Promise<{ id: string }> {
  const supabase = getSupabaseCatalogos(true);
  const slug = input.slug.trim().toLowerCase().replace(/\s+/g, "-");
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: input.name.trim(),
      slug,
      settings: input.settings ?? {},
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Supplier created but no id returned");
  return { id: data.id as string };
}
