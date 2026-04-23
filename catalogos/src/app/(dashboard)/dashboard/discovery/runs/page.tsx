import Link from "next/link";
import { listRuns } from "@/lib/discovery/runs";
import { listAdapters } from "@/lib/discovery/adapters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManualLeadForm } from "./ManualLeadForm";

export default async function DiscoveryRunsPage() {
  let runs: Awaited<ReturnType<typeof listRuns>> = [];
  let adapters: { name: string }[] = [];
  try {
    [runs, adapters] = await Promise.all([listRuns(30), listAdapters()]);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Discovery runs</h1>
        <p className="text-destructive">Failed to load. Ensure Supabase and migrations are configured.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Supplier Discovery</h1>
        <Link href="/dashboard/discovery/leads" className="text-sm text-primary hover:underline">
          View leads →
        </Link>
      </div>

      <Card className="max-w-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add lead manually</CardTitle>
        </CardHeader>
        <CardContent>
          <ManualLeadForm adapters={adapters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Discovery runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No runs yet. Add a lead above or run an adapter.</div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}…</span>
                    <span>{r.adapter_name}</span>
                    <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                    <span className="text-muted-foreground text-sm">
                      +{r.leads_created} leads{r.leads_duplicate_skipped > 0 ? `, ${r.leads_duplicate_skipped} skipped (dup)` : ""}
                    </span>
                  </div>
                  <Link href={`/dashboard/discovery/runs/${r.id}`} className="text-sm text-primary hover:underline">
                    Details
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
