import Link from "next/link";
import { notFound } from "next/navigation";
import { getRunById, getRunEvents } from "@/lib/discovery/runs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DiscoveryRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [run, events] = await Promise.all([getRunById(id), getRunEvents(id)]);
  if (!run) notFound();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/discovery/runs" className="text-sm text-muted-foreground hover:text-foreground">← Runs</Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Run {run.id.slice(0, 8)}…</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><span className="text-muted-foreground">Adapter:</span> {run.adapter_name}</p>
          <p><span className="text-muted-foreground">Status:</span> <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge></p>
          <p><span className="text-muted-foreground">Leads created:</span> {run.leads_created}</p>
          <p><span className="text-muted-foreground">Duplicates skipped:</span> {run.leads_duplicate_skipped}</p>
          <p><span className="text-muted-foreground">Started:</span> {new Date(run.started_at).toLocaleString()}</p>
          {run.completed_at && <p><span className="text-muted-foreground">Completed:</span> {new Date(run.completed_at).toLocaleString()}</p>}
          {run.error_message && <p className="text-destructive"><span className="text-muted-foreground">Error:</span> {run.error_message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="p-4 text-muted-foreground text-sm">No events.</div>
          ) : (
            <ul className="divide-y divide-border max-h-96 overflow-y-auto">
              {events.map((ev) => (
                <li key={ev.id} className="px-4 py-2 text-sm flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ev.event_type}</span>
                  {ev.payload && typeof ev.payload === "object" && "company_name" in ev.payload && (
                    <span>{(ev.payload as { company_name?: string }).company_name}</span>
                  )}
                  {ev.supplier_lead_id && (
                    <Link href={`/dashboard/discovery/leads/${ev.supplier_lead_id}`} className="text-primary hover:underline">View lead</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
