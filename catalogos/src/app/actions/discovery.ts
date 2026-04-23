"use server";

import { revalidatePath } from "next/cache";
import { updateLeadStatus, promoteLeadToSupplier } from "@/lib/discovery/leads";
import { runDiscovery } from "@/lib/discovery/discovery-service";

const DISCOVERY_PATHS = ["/dashboard/discovery/leads", "/dashboard/discovery/runs", "/dashboard/suppliers"];

async function revalidateDiscovery() {
  DISCOVERY_PATHS.forEach((p) => revalidatePath(p));
}

export interface DiscoveryActionResult {
  success: boolean;
  error?: string;
  supplierId?: string;
}

export async function markLeadReviewed(leadId: string, notes?: string | null): Promise<DiscoveryActionResult> {
  try {
    await updateLeadStatus(leadId, "reviewed", notes);
    await revalidateDiscovery();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update" };
  }
}

export async function rejectLead(leadId: string, notes?: string | null): Promise<DiscoveryActionResult> {
  try {
    await updateLeadStatus(leadId, "rejected", notes);
    await revalidateDiscovery();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to reject" };
  }
}

export async function markLeadContacted(leadId: string, notes?: string | null): Promise<DiscoveryActionResult> {
  try {
    await updateLeadStatus(leadId, "contacted", notes);
    await revalidateDiscovery();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update" };
  }
}

export async function promoteToSupplier(leadId: string): Promise<DiscoveryActionResult> {
  try {
    const { supplierId } = await promoteLeadToSupplier(leadId);
    await revalidateDiscovery();
    return { success: true, supplierId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to promote" };
  }
}

export interface RunDiscoveryResult {
  success: boolean;
  runId?: string;
  leadsCreated?: number;
  duplicateSkipped?: number;
  error?: string;
}

export async function runDiscoveryAction(
  adapterName: string,
  config: Record<string, unknown>
): Promise<RunDiscoveryResult> {
  try {
    const { runId, leadsCreated, duplicateSkipped } = await runDiscovery(adapterName, config);
    await revalidatePath("/dashboard/discovery/runs");
    await revalidatePath("/dashboard/discovery/leads");
    return { success: true, runId, leadsCreated, duplicateSkipped };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Discovery run failed" };
  }
}
