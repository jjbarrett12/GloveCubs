"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuoteWithSla {
  submitted_at: string | null;
  first_viewed_at: string | null;
  first_contacted_at: string | null;
  quoted_at: string | null;
  closed_at: string | null;
  created_at: string;
  due_by: string | null;
  status: string;
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function age(ts: string | null): string {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  const m = Math.floor(ms / 60000);
  return `${m}m`;
}

export function RfqSlaTimestamps({ quote }: { quote: QuoteWithSla }) {
  const submitted = quote.submitted_at ?? quote.created_at;
  const isOverdue = quote.due_by && quote.status !== "closed" && new Date(quote.due_by) < new Date();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">SLA</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p><span className="text-muted-foreground">Submitted:</span> {formatTs(submitted)} {submitted && <span className="text-muted-foreground">({age(submitted)} ago)</span>}</p>
        <p><span className="text-muted-foreground">First viewed:</span> {formatTs(quote.first_viewed_at)}</p>
        <p><span className="text-muted-foreground">First contacted:</span> {formatTs(quote.first_contacted_at)}</p>
        <p><span className="text-muted-foreground">Quoted:</span> {formatTs(quote.quoted_at)}</p>
        <p><span className="text-muted-foreground">Closed:</span> {formatTs(quote.closed_at)}</p>
        {quote.due_by && (
          <p className={isOverdue ? "text-destructive font-medium" : ""}>
            <span className="text-muted-foreground">Due by:</span> {formatTs(quote.due_by)}
            {isOverdue && " (overdue)"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
