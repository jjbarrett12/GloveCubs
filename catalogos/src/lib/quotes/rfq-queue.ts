/**
 * RFQ queue queries: unassigned, mine, overdue, urgent, awaiting response.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { QuoteRequestRow } from "./types";
import type { RfqQueueFilter } from "./types";

export interface RfqQueueSummary {
  unassigned: number;
  mine: number;
  overdue: number;
  urgent: number;
  awaiting_response: number;
}

export async function getRfqQueueSummary(assignedToUserId: string): Promise<RfqQueueSummary> {
  const supabase = getSupabaseCatalogos(true);
  const now = new Date().toISOString();

  const [unassigned, mine, overdue, urgent, awaiting] = await Promise.all([
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).is("assigned_to", null).neq("status", "closed"),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("assigned_to", assignedToUserId).neq("status", "closed"),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).lt("due_by", now).neq("status", "closed").not("due_by", "is", null),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).in("priority", ["high", "urgent"]).neq("status", "closed"),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "quoted"),
  ]);

  return {
    unassigned: unassigned.count ?? 0,
    mine: mine.count ?? 0,
    overdue: overdue.count ?? 0,
    urgent: urgent.count ?? 0,
    awaiting_response: awaiting.count ?? 0,
  };
}

export async function listQuoteRequestsByQueue(
  filter: RfqQueueFilter,
  options: { assignedToUserId?: string; limit?: number }
): Promise<QuoteRequestRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const limit = Math.min(options.limit ?? 50, 100);
  let q = supabase
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  switch (filter) {
    case "unassigned":
      q = q.is("assigned_to", null).neq("status", "closed");
      break;
    case "mine":
      if (options.assignedToUserId) q = q.eq("assigned_to", options.assignedToUserId);
      q = q.neq("status", "closed");
      break;
    case "overdue":
      q = q.lt("due_by", new Date().toISOString()).not("due_by", "is", null).neq("status", "closed");
      break;
    case "urgent":
      q = q.in("priority", ["high", "urgent"]).neq("status", "closed");
      break;
    case "awaiting_response":
      q = q.eq("status", "quoted");
      break;
    default:
      break;
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as QuoteRequestRow[];
}
