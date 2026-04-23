import Link from "next/link";
import { getRfqQueueSummary, listQuoteRequestsByQueue } from "@/lib/quotes/rfq-queue";
import type { RfqQueueFilter } from "@/lib/quotes/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RfqQueueTabs } from "./RfqQueueTabs";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  normal: "secondary",
  high: "default",
  urgent: "destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  new: "default",
  reviewing: "secondary",
  contacted: "secondary",
  quoted: "outline",
  closed: "outline",
};

export default async function RfqQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const { queue } = await searchParams;
  const filter = (queue === "unassigned" || queue === "mine" || queue === "overdue" || queue === "urgent" || queue === "awaiting_response"
    ? queue
    : "all") as RfqQueueFilter;
  const currentUserId = process.env.RFQ_CURRENT_USER ?? "";

  let summary = { unassigned: 0, mine: 0, overdue: 0, urgent: 0, awaiting_response: 0 };
  try {
    summary = await getRfqQueueSummary(currentUserId);
  } catch {
    // ignore
  }

  let quotes: Awaited<ReturnType<typeof listQuoteRequestsByQueue>> = [];
  try {
    quotes = await listQuoteRequestsByQueue(filter, {
      assignedToUserId: filter === "mine" ? currentUserId : undefined,
      limit: 100,
    });
  } catch (e) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">RFQ queue</h1>
        <p className="text-destructive">Failed to load queue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">RFQ queue</h1>
        <Link href="/dashboard/quotes" className="text-sm text-muted-foreground hover:text-foreground">
          All quotes →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unassigned</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary.unassigned}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mine</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary.mine}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-destructive">{summary.overdue}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Urgent</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary.urgent}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting response</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary.awaiting_response}</span>
          </CardContent>
        </Card>
      </div>

      <RfqQueueTabs currentFilter={filter} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filter === "all" ? "All RFQs" : filter.replace("_", " ")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quotes.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No RFQs in this queue.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">Reference</th>
                    <th className="text-left p-3 font-medium">Company</th>
                    <th className="text-left p-3 font-medium">Assigned</th>
                    <th className="text-left p-3 font-medium">Priority</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Due</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-left p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{q.reference_number ?? "—"}</td>
                      <td className="p-3 font-medium">{q.company_name}</td>
                      <td className="p-3 text-muted-foreground">{q.assigned_to ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant={PRIORITY_VARIANT[q.priority ?? "normal"] ?? "secondary"}>
                          {q.priority ?? "normal"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANT[q.status] ?? "secondary"}>{q.status}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {q.due_by ? new Date(q.due_by).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(q.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <Link href={`/dashboard/rfq/${q.id}`} className="text-primary hover:underline">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
