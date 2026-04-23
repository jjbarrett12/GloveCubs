/**
 * Discovery runs and event logging.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { SupplierDiscoveryRunRow, SupplierDiscoveryEventRow, RunStatus } from "./types";

export async function createRun(adapterName: string, config: Record<string, unknown> = {}): Promise<{ id: string }> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_discovery_runs")
    .insert({
      adapter_name: adapterName,
      status: "running",
      config,
      leads_created: 0,
      leads_duplicate_skipped: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Run created but no id returned");
  return { id: (data as { id: string }).id };
}

export async function completeRun(
  runId: string,
  status: Exclude<RunStatus, "running">,
  stats: { leads_created: number; leads_duplicate_skipped: number },
  errorMessage?: string | null
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("supplier_discovery_runs")
    .update({
      status,
      leads_created: stats.leads_created,
      leads_duplicate_skipped: stats.leads_duplicate_skipped,
      error_message: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

export async function logEvent(
  runId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  supplierLeadId?: string | null
): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  await supabase.from("supplier_discovery_events").insert({
    run_id: runId,
    event_type: eventType,
    payload,
    supplier_lead_id: supplierLeadId ?? null,
  });
}

export async function listRuns(limit = 20): Promise<SupplierDiscoveryRunRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_discovery_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierDiscoveryRunRow[];
}

export async function getRunById(id: string): Promise<SupplierDiscoveryRunRow | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_discovery_runs")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as SupplierDiscoveryRunRow;
}

export async function getRunEvents(runId: string, limit = 200): Promise<SupplierDiscoveryEventRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_discovery_events")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierDiscoveryEventRow[];
}
