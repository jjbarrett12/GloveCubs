"use server";

import { revalidatePath } from "next/cache";
import { submitQuoteRequestSchema } from "@/lib/quotes/schemas";
import {
  createQuoteRequest,
  getQuoteSubmitCountRecent,
  QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR,
  updateQuoteRequestStatus,
  updateQuoteRequest,
  recordFirstViewed,
} from "@/lib/quotes/service";
import { notifyAssigneeAssigned } from "@/lib/quotes/notifications";

const QUOTE_PATHS = ["/quote", "/dashboard/quotes", "/dashboard/rfq"];

export interface SubmitQuoteResult {
  success: boolean;
  quoteId?: string;
  referenceNumber?: string;
  error?: string;
  rateLimited?: boolean;
}

export async function submitQuoteRequestAction(input: unknown): Promise<SubmitQuoteResult> {
  const parsed = submitQuoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return { success: false, error: msg };
  }
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const recentCount = await getQuoteSubmitCountRecent(email, 60);
    if (recentCount >= QUOTE_SUBMIT_RATE_LIMIT_PER_HOUR) {
      return {
        success: false,
        rateLimited: true,
        error: "Too many quote requests. Please try again in an hour.",
      };
    }
    const { id, reference_number } = await createQuoteRequest(parsed.data);
    QUOTE_PATHS.forEach((p) => revalidatePath(p));
    return { success: true, quoteId: id, referenceNumber: reference_number };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to submit quote request" };
  }
}

export async function updateQuoteStatusAction(id: string, status: string): Promise<{ success: boolean; error?: string }> {
  const allowed = ["new", "reviewing", "contacted", "quoted", "won", "lost", "expired", "closed"];
  if (!allowed.includes(status)) return { success: false, error: "Invalid status" };
  try {
    await updateQuoteRequestStatus(id, status as "new" | "reviewing" | "contacted" | "quoted" | "won" | "lost" | "expired" | "closed");
    revalidatePath("/dashboard/quotes");
    revalidatePath("/dashboard/rfq");
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update status" };
  }
}

export async function markQuoteWonAction(id: string, orderId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { markQuoteWon } = await import("@/lib/quotes/service");
    await markQuoteWon(id, orderId);
    revalidatePath("/dashboard/quotes");
    revalidatePath("/dashboard/rfq");
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to mark as won" };
  }
}

export async function markQuoteLostAction(id: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { markQuoteLost } = await import("@/lib/quotes/service");
    await markQuoteLost(id, reason);
    revalidatePath("/dashboard/quotes");
    revalidatePath("/dashboard/rfq");
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to mark as lost" };
  }
}

export async function setQuoteExpirationAction(id: string, expiresAt: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { setQuoteExpiration } = await import("@/lib/quotes/service");
    await setQuoteExpiration(id, new Date(expiresAt));
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to set expiration" };
  }
}

export async function updateQuoteAssignmentAction(
  id: string,
  assignedTo: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateQuoteRequest(id, { assigned_to: assignedTo });
    if (assignedTo) {
      const { getQuoteRequestById } = await import("@/lib/quotes/service");
      const q = await getQuoteRequestById(id);
      if (q?.reference_number) notifyAssigneeAssigned(id, q.reference_number, assignedTo).catch(() => {});
    }
    revalidatePath("/dashboard/quotes");
    revalidatePath("/dashboard/rfq");
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update assignment" };
  }
}

export async function updateQuotePriorityAction(
  id: string,
  priority: string
): Promise<{ success: boolean; error?: string }> {
  const allowed = ["low", "normal", "high", "urgent"];
  if (!allowed.includes(priority)) return { success: false, error: "Invalid priority" };
  try {
    await updateQuoteRequest(id, { priority: priority as "low" | "normal" | "high" | "urgent" });
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update priority" };
  }
}

export async function updateQuoteDueByAction(id: string, dueBy: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    await updateQuoteRequest(id, { due_by: dueBy });
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update due date" };
  }
}

export async function updateQuoteInternalNotesAction(id: string, internalNotes: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    await updateQuoteRequest(id, { internal_notes: internalNotes });
    revalidatePath(`/dashboard/quotes/${id}`);
    revalidatePath(`/dashboard/rfq/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update notes" };
  }
}

export async function recordRfqFirstViewedAction(id: string): Promise<void> {
  await recordFirstViewed(id);
  revalidatePath(`/dashboard/quotes/${id}`);
  revalidatePath(`/dashboard/rfq/${id}`);
}
