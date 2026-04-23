import Link from "next/link";
import { listMatchRuns } from "@/lib/product-matching/match-runs";
import { getBatchesList } from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RunMatchingForm } from "./RunMatchingForm";

export default async function ProductMatchingPage() {
  let runs: Awaited<ReturnType<typeof listMatchRuns>> = [];
  let batches: Awaited<ReturnType<typeof getBatchesList>> = [];
  try {
    [runs, batches] = await Promise.all([listMatchRuns({ limit: 50 }), getBatchesList(100)]);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Product matching</h1>
        <p className="text-destructive">Failed to load. Ensure Supabase and migrations are configured.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Product matching</h1>
      <p className="text-muted-foreground text-sm max-w-2xl">
        Match normalized supplier products to master catalog. Rules-first: UPC, attributes, title similarity. Uncertain matches and duplicate masters go to review.
      </p>

      <Card className="max-w-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Run matching</CardTitle>
        </CardHeader>
        <CardContent>
          <RunMatchingForm batches={batches.filter((b) => b.status === "completed").slice(0, 30)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Match runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No match runs yet. Run matching above.</div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => {
                const stats = (r.stats as { total?: number; matched?: number; uncertain?: number; no_match?: number; duplicates_found?: number }) ?? {};
                return (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}…</span>
                      <Badge variant="secondary">{r.scope}</Badge>
                      <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                      {r.status === "completed" && (
                        <span className="text-muted-foreground text-sm">
                          total: {stats.total ?? 0} · matched: {stats.matched ?? 0} · uncertain: {stats.uncertain ?? 0} · no_match: {stats.no_match ?? 0}
                          {(stats.duplicates_found ?? 0) > 0 && ` · dup: ${stats.duplicates_found}`}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs">{new Date(r.started_at).toLocaleString()}</span>
                    </div>
                    <Link href={`/dashboard/product-matching/runs/${r.id}`} className="text-sm text-primary hover:underline shrink-0">
                      Details
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
