/**
 * Supplier onboarding requests CRUD and workflow.
 */

import { randomBytes } from "crypto";
import { getSupabaseCatalogos } from "@/lib/db/client";
import type {
  SupplierOnboardingRequestRow,
  SupplierOnboardingStepRow,
  SupplierOnboardingFileRow,
  OnboardingStatus,
  ContactInfo,
} from "./types";
import type { CreateOnboardingRequestInput, UpdateOnboardingRequestInput } from "./schemas";
import { createSupplier } from "@/lib/catalogos/suppliers";

export async function listOnboardingRequests(filters?: {
  status?: OnboardingStatus;
  limit?: number;
}): Promise<SupplierOnboardingRequestRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const limit = Math.min(filters?.limit ?? 50, 100);
  let query = supabase
    .from("supplier_onboarding_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters?.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierOnboardingRequestRow[];
}

export async function getOnboardingRequestById(id: string): Promise<SupplierOnboardingRequestRow | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_onboarding_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as SupplierOnboardingRequestRow;
}

const DEFAULT_TOKEN_EXPIRY_DAYS = 90;

function generateAccessToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createOnboardingRequest(
  input: CreateOnboardingRequestInput
): Promise<{ id: string; accessToken?: string }> {
  const supabase = getSupabaseCatalogos(true);
  const contact_info: ContactInfo = {
    contact_name: input.contact_name ?? null,
    contact_email: input.contact_email ?? null,
    phone: input.phone ?? null,
  };
  const submittedVia = input.submitted_via ?? "admin";
  const isPortal = submittedVia === "supplier_portal";
  const accessToken = isPortal ? generateAccessToken() : null;
  const expiresAt = isPortal
    ? new Date(Date.now() + DEFAULT_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const row: Record<string, unknown> = {
    company_name: input.company_name.trim(),
    website: input.website?.trim() || null,
    contact_info,
    feed_type: input.feed_type ?? null,
    feed_url: input.feed_url?.trim() || null,
    feed_config: {},
    pricing_basis_hints: input.pricing_basis_hints?.trim() || null,
    packaging_hints: input.packaging_hints?.trim() || null,
    categories_supplied: input.categories_supplied ?? [],
    notes: input.notes?.trim() || null,
    status: "initiated" as const,
    source_lead_id: input.source_lead_id ?? null,
    submitted_via: submittedVia,
  };
  if (accessToken) {
    row.access_token = accessToken;
    row.access_token_expires_at = expiresAt;
  }
  const { data, error } = await supabase
    .from("supplier_onboarding_requests")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Request created but no id returned");
  return { id: data.id as string, ...(accessToken ? { accessToken } : {}) };
}

export async function getOnboardingRequestByAccessToken(token: string): Promise<SupplierOnboardingRequestRow | null> {
  if (!token?.trim()) return null;
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_onboarding_requests")
    .select("*")
    .eq("access_token", token.trim())
    .single();
  if (error || !data) return null;
  const row = data as SupplierOnboardingRequestRow;
  if (row.access_token_expires_at && new Date(row.access_token_expires_at) < new Date()) return null;
  return row;
}

export async function setRequestedMoreInfo(requestId: string, notes: string): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("supplier_onboarding_requests")
    .update({
      status: "waiting_for_supplier",
      requested_info_notes: notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  await addOnboardingStep(requestId, "requested_more_info", { notes: notes?.trim() ?? "" });
}

export async function updateOnboardingRequest(
  id: string,
  input: UpdateOnboardingRequestInput
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.company_name !== undefined) updates.company_name = input.company_name.trim();
  if (input.website !== undefined) updates.website = input.website?.trim() || null;
  if (input.contact_info !== undefined) {
    updates.contact_info = input.contact_info;
  } else if (
    input.contact_name !== undefined ||
    input.contact_email !== undefined ||
    input.phone !== undefined
  ) {
    const existing = await getOnboardingRequestById(id);
    const contact = (existing?.contact_info as ContactInfo) ?? {};
    updates.contact_info = {
      ...contact,
      ...(input.contact_name !== undefined && { contact_name: input.contact_name }),
      ...(input.contact_email !== undefined && { contact_email: input.contact_email }),
      ...(input.phone !== undefined && { phone: input.phone }),
    };
  }
  if (input.feed_type !== undefined) updates.feed_type = input.feed_type;
  if (input.feed_url !== undefined) updates.feed_url = input.feed_url?.trim() || null;
  if (input.feed_config !== undefined) updates.feed_config = input.feed_config;
  if (input.pricing_basis_hints !== undefined) updates.pricing_basis_hints = input.pricing_basis_hints?.trim() || null;
  if (input.packaging_hints !== undefined) updates.packaging_hints = input.packaging_hints?.trim() || null;
  if (input.categories_supplied !== undefined) updates.categories_supplied = input.categories_supplied;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;
  if (input.status !== undefined) updates.status = input.status;

  const { error } = await supabase
    .from("supplier_onboarding_requests")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setOnboardingStatus(id: string, status: OnboardingStatus): Promise<void> {
  await updateOnboardingRequest(id, { status });
}

export async function addOnboardingStep(
  requestId: string,
  stepType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  await supabase.from("supplier_onboarding_steps").insert({
    request_id: requestId,
    step_type: stepType,
    payload,
  });
}

export async function getOnboardingSteps(requestId: string): Promise<SupplierOnboardingStepRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_onboarding_steps")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierOnboardingStepRow[];
}

export async function getOnboardingFiles(requestId: string): Promise<SupplierOnboardingFileRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_onboarding_files")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierOnboardingFileRow[];
}

export async function createSupplierFromOnboarding(requestId: string): Promise<{ supplierId: string }> {
  const req = await getOnboardingRequestById(requestId);
  if (!req) throw new Error("Onboarding request not found");
  if (req.status === "rejected") throw new Error("Cannot create supplier from rejected request");
  if (req.created_supplier_id) return { supplierId: req.created_supplier_id };

  const slug = req.company_name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const { id: supplierId } = await createSupplier({
    name: req.company_name,
    slug: slug || `supplier-${Date.now()}`,
    is_active: true,
  });

  const supabase = getSupabaseCatalogos(true);
  await supabase
    .from("supplier_onboarding_requests")
    .update({
      status: "created_supplier",
      created_supplier_id: supplierId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  await addOnboardingStep(requestId, "supplier_created", { supplier_id: supplierId });
  return { supplierId };
}

export async function createFeedFromOnboarding(requestId: string): Promise<{ feedId: string }> {
  const req = await getOnboardingRequestById(requestId);
  if (!req) throw new Error("Onboarding request not found");
  if (!req.created_supplier_id) throw new Error("Create supplier first");
  if (req.created_feed_id) return { feedId: req.created_feed_id };

  const feedType = req.feed_type === "pdf" || req.feed_type === "google_sheet" ? "url" : (req.feed_type ?? "url");
  const feedUrl = req.feed_url?.trim() || "";
  if (!feedUrl) throw new Error("Feed URL required to create feed");

  const supabase = getSupabaseCatalogos(true);
  const { data: feed, error } = await supabase
    .from("supplier_feeds")
    .insert({
      supplier_id: req.created_supplier_id,
      feed_type: feedType,
      config: { url: feedUrl, feed_url: feedUrl, csv_url: feedType === "csv" ? feedUrl : undefined },
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!feed?.id) throw new Error("Feed created but no id returned");
  const feedId = feed.id as string;

  await supabase
    .from("supplier_onboarding_requests")
    .update({
      status: "feed_created",
      created_feed_id: feedId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  await addOnboardingStep(requestId, "feed_created", { feed_id: feedId });
  return { feedId };
}

export async function triggerIngestionForOnboarding(requestId: string): Promise<{ batchId: string }> {
  const req = await getOnboardingRequestById(requestId);
  if (!req) throw new Error("Onboarding request not found");
  if (!req.created_feed_id) throw new Error("Create feed first");

  const supabase = getSupabaseCatalogos(true);
  const { data: feed, error: feedErr } = await supabase
    .from("supplier_feeds")
    .select("id, config, supplier_id")
    .eq("id", req.created_feed_id)
    .single();
  if (feedErr || !feed) throw new Error("Feed not found");
  const config = (feed.config ?? {}) as Record<string, unknown>;
  const feedUrl = (config.url ?? config.feed_url ?? config.csv_url) as string;
  if (!feedUrl || typeof feedUrl !== "string") throw new Error("Feed has no URL in config");

  const { runPipeline } = await import("@/lib/ingestion/run-pipeline");
  const categoryId = await resolveCategoryId();
  const result = await runPipeline({
    feedId: feed.id as string,
    supplierId: feed.supplier_id as string,
    feedUrl,
    categoryId,
  });

  await supabase
    .from("supplier_onboarding_requests")
    .update({
      status: "ingestion_triggered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  await addOnboardingStep(requestId, "ingestion_triggered", { batch_id: result.batchId });
  return { batchId: result.batchId };
}

async function resolveCategoryId(): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase.from("categories").select("id").eq("slug", "disposable_gloves").single();
  if (error || !data?.id) throw new Error("Category disposable_gloves not found");
  return data.id as string;
}

export async function completeOnboarding(requestId: string): Promise<void> {
  await setOnboardingStatus(requestId, "completed");
  await addOnboardingStep(requestId, "completed", {});
}

export async function rejectOnboarding(requestId: string, notes?: string | null): Promise<void> {
  await updateOnboardingRequest(requestId, { status: "rejected", notes: notes ?? undefined });
  await addOnboardingStep(requestId, "rejected", { notes: notes ?? "" });
}
