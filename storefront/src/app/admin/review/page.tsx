/**
 * Admin Review Queue Dashboard
 * 
 * Operator view for reviewing ingestion, matches, pricing, and QA findings.
 * Supports filtering by type, priority, confidence, date, and status.
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  PageHeader,
  StatCard,
  StatGrid,
  TableCard,
  LoadingState,
} from "@/components/admin";
import { ReviewQueueClient } from "./ReviewQueueClient";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export interface ReviewRow {
  id: string;
  review_type: string;
  status: string;
  priority: string;
  title: string;
  issue_category: string;
  issue_summary: string;
  recommended_action: string | null;
  agent_name: string | null;
  confidence: number | null;
  details: Record<string, unknown>;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_notes: string | null;
}

interface SearchParams {
  status?: string;
  type?: string;
  priority?: string;
  confidence?: string;
  category?: string;
  days?: string;
}

async function getReviewStats() {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("review_queue")
    .select("status, priority, review_type, issue_category, confidence");

  const stats = {
    total: 0,
    open: 0,
    byPriority: { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>,
    byType: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
  };

  (data || []).forEach((row) => {
    stats.total++;
    if (row.status === "open" || row.status === "in_review") {
      stats.open++;
      stats.byPriority[row.priority] = (stats.byPriority[row.priority] || 0) + 1;
      stats.byType[row.review_type] = (stats.byType[row.review_type] || 0) + 1;
      stats.byCategory[row.issue_category] = (stats.byCategory[row.issue_category] || 0) + 1;
    }
  });

  return stats;
}

async function getReviewItems(params: SearchParams): Promise<ReviewRow[]> {
  const supabase = await getSupabase();

  let query = supabase
    .from("review_queue")
    .select("*")
    .order("priority_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  // Status filter
  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  } else {
    query = query.in("status", ["open", "in_review"]);
  }

  // Type filter
  if (params.type && params.type !== "all") {
    query = query.eq("review_type", params.type);
  }

  // Priority filter
  if (params.priority && params.priority !== "all") {
    query = query.eq("priority", params.priority);
  }

  // Confidence band filter
  if (params.confidence) {
    if (params.confidence === "low") {
      query = query.lt("confidence", 0.5);
    } else if (params.confidence === "medium") {
      query = query.gte("confidence", 0.5).lt("confidence", 0.8);
    } else if (params.confidence === "high") {
      query = query.gte("confidence", 0.8);
    }
  }

  // Date filter
  if (params.days) {
    const days = parseInt(params.days, 10);
    if (!isNaN(days)) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("created_at", since.toISOString());
    }
  }

  // Category filter
  if (params.category && params.category !== "all") {
    query = query.eq("issue_category", params.category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ReviewRow[];
}

function ReviewStats({ stats }: { stats: Awaited<ReturnType<typeof getReviewStats>> }) {
  return (
    <StatGrid columns={5}>
      <StatCard
        label="Open Items"
        value={stats.open}
        color={stats.byPriority.critical > 0 ? "red" : stats.open > 0 ? "amber" : "green"}
      />
      <StatCard
        label="Critical"
        value={stats.byPriority.critical}
        color="red"
        href="/admin/review?priority=critical"
      />
      <StatCard
        label="High"
        value={stats.byPriority.high}
        color="orange"
        href="/admin/review?priority=high"
      />
      <StatCard
        label="Medium"
        value={stats.byPriority.medium}
        color="amber"
        href="/admin/review?priority=medium"
      />
      <StatCard
        label="Low"
        value={stats.byPriority.low}
        color="green"
        href="/admin/review?priority=low"
      />
    </StatGrid>
  );
}

async function ReviewContent({ params }: { params: SearchParams }) {
  const [stats, items] = await Promise.all([
    getReviewStats(),
    getReviewItems(params),
  ]);

  // Extract unique categories for filter
  const categories = Object.keys(stats.byCategory).sort();

  return (
    <>
      <div className="mb-6">
        <ReviewStats stats={stats} />
      </div>

      <TableCard>
        <ReviewQueueClient
          items={items}
          categories={categories}
          currentFilters={params}
          stats={stats}
        />
      </TableCard>
    </>
  );
}

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <div>
      <PageHeader
        title="Review Queue"
        description="Items requiring human review before proceeding"
      />

      <Suspense fallback={<LoadingState message="Loading review items..." />}>
        <ReviewContent params={params} />
      </Suspense>
    </div>
  );
}
