/**
 * Supplier leads CRUD, list filters, and promote-to-supplier.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type {
  SupplierLeadRow,
  SupplierLeadContactRow,
  SupplierLeadInsert,
  LeadStatus,
} from "./types";
import { createSupplier } from "@/lib/catalogos/suppliers";

export interface ListLeadsFilters {
  status?: LeadStatus;
  limit?: number;
  offset?: number;
  orderBy?: "created_at" | "lead_score";
  orderDesc?: boolean;
}

export async function listLeads(filters: ListLeadsFilters = {}): Promise<SupplierLeadRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = filters.offset ?? 0;
  const orderBy = filters.orderBy ?? "created_at";
  const orderDesc = filters.orderDesc ?? true;

  let query = supabase
    .from("supplier_leads")
    .select("id, company_name, website, domain, source_url, discovery_method, product_categories, catalog_signals, api_signal, csv_signal, pdf_catalog_signal, lead_score, status, notes, promoted_supplier_id, created_at, updated_at")
    .order(orderBy, { ascending: !orderDesc })
    .range(offset, offset + limit - 1);

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierLeadRow[];
}

export async function getLeadById(id: string): Promise<SupplierLeadRow | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_leads")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as SupplierLeadRow;
}

export async function getLeadContacts(leadId: string): Promise<SupplierLeadContactRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_lead_contacts")
    .select("*")
    .eq("supplier_lead_id", leadId)
    .order("is_primary", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierLeadContactRow[];
}

export async function createLead(input: SupplierLeadInsert): Promise<{ id: string } | null> {
  const supabase = getSupabaseCatalogos(true);
  const domain = normalizeDomain(input.website ?? input.domain ?? null);
  const row = {
    company_name: input.company_name.trim(),
    website: input.website?.trim() || null,
    domain,
    source_url: input.source_url?.trim() || null,
    discovery_method: input.discovery_method || "manual",
    product_categories: input.product_categories ?? [],
    catalog_signals: input.catalog_signals ?? [],
    api_signal: input.api_signal ?? false,
    csv_signal: input.csv_signal ?? false,
    pdf_catalog_signal: input.pdf_catalog_signal ?? false,
    lead_score: input.lead_score ?? 0,
    status: input.status ?? "new",
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await supabase.from("supplier_leads").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data ? { id: (data as { id: string }).id } : null;
}

export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
  notes?: string | null
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  const { error } = await supabase.from("supplier_leads").update(updates).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function promoteLeadToSupplier(leadId: string): Promise<{ supplierId: string }> {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found");
  if (lead.status === "onboarded" && lead.promoted_supplier_id) {
    return { supplierId: lead.promoted_supplier_id };
  }
  if (lead.status === "rejected") throw new Error("Cannot promote a rejected lead");

  const slug = lead.domain || lead.company_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const { id: supplierId } = await createSupplier({
    name: lead.company_name,
    slug: slug || `supplier-${Date.now()}`,
    is_active: true,
  });

  const supabase = getSupabaseCatalogos(true);
  await supabase
    .from("supplier_leads")
    .update({
      status: "onboarded",
      promoted_supplier_id: supplierId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  const contacts = await getLeadContacts(leadId);
  for (const c of contacts) {
    if (c.contact_name || c.contact_email) {
      await supabase.from("supplier_contacts").insert({
        supplier_id: supplierId,
        name: c.contact_name,
        email: c.contact_email,
        phone: c.phone,
        role: c.role,
        is_primary: c.is_primary,
      });
    }
  }

  return { supplierId };
}

function normalizeDomain(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain || typeof urlOrDomain !== "string") return null;
  const s = urlOrDomain.trim().toLowerCase();
  try {
    if (!s.startsWith("http")) return s.replace(/^www\./, "").split("/")[0] || null;
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return s.replace(/^www\./, "").split("/")[0] || null;
  }
}

export async function leadExistsByDomain(domain: string | null): Promise<boolean> {
  if (!domain) return false;
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase
    .from("supplier_leads")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();
  return !!data;
}
