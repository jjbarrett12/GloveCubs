import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatchRunById, listMatchCandidates, listDuplicateCandidates } from "@/lib/product-matching/match-runs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchCandidateActions } from "./MatchCandidateActions";
import { DuplicateCandidateActions } from "./DuplicateCandidateActions";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductMatchRunDetailPage({ params }: PageProps) {
  const { id } = await params;
  let run: Awaited<ReturnType<typeof getMatchRunById>>;
  let candidates: Awaited<ReturnType<typeof listMatchCandidates>>;
  let duplicates: Awaited<ReturnType<typeof listDuplicateCandidates>>;
  try {
    [run, candidates, duplicates] = await Promise.all([
      getMatchRunById(id),
      listMatchCandidates(id),
      listDuplicateCandidates(id),
    ]);
  } catch (e) {
    notFound();
  }
  if (!run) notFound();

  const stats = (run.stats as { total?: number; matched?: number; uncertain?: number; no_match?: number; duplicates_found?: number }) ?? {};
  const needsReview = candidates.filter((c) => c.requires_review);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/product-matching" className="text-sm text-muted-foreground hover:text-foreground">
          ← Match runs
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Match run {run.id.slice(0, 8)}…</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Scope:</span> {run.scope}
            {run.batch_id && ` · Batch ${run.batch_id.slice(0, 8)}…`}
          </p>
          <p>
            <span className="text-muted-foreground">Status:</span>{" "}
            <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
              {run.status}
            </Badge>
          </p>
          <p>
            <span className="text-muted-foreground">Total:</span> {stats.total ?? 0} · Matched: {stats.matched ?? 0} · Uncertain: {stats.uncertain ?? 0} · No match: {stats.no_match ?? 0} · Duplicate pairs: {stats.duplicates_found ?? 0}
          </p>
          <p>
            <span className="text-muted-foreground">Requires review:</span> {needsReview.length}
          </p>
          {run.error_message && (
            <p className="text-destructive">
              <span className="text-muted-foreground">Error:</span> {run.error_message}
            </p>
          )}
        </CardContent>
      </Card>

      {duplicates.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Duplicate candidates ({duplicates.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border max-h-80 overflow-y-auto">
              {duplicates.map((d) => (
                <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="font-mono text-sm">
                    {d.product_id_a?.slice(0, 8)}… ↔ {d.product_id_b?.slice(0, 8)}… · score {(d.score as number) * 100}%
                  </div>
                  <Badge variant={d.status === "pending_review" ? "secondary" : "outline"}>{d.status}</Badge>
                  <DuplicateCandidateActions duplicateId={d.id} status={d.status} productIdA={d.product_id_a} productIdB={d.product_id_b} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Match candidates ({candidates.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border max-h-[28rem] overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">normalized {c.normalized_id?.slice(0, 8)}…</p>
                  <p className="text-sm">
                    → {(c as { suggested_master_product_id?: string | null }).suggested_master_product_id
                      ? `master ${(c as { suggested_master_product_id: string }).suggested_master_product_id.slice(0, 8)}…`
                      : "no match"}
                    {" · "}
                    {(c.confidence as number) * 100}% · {c.reason}
                    {(c as { duplicate_warning?: boolean }).duplicate_warning && " · duplicate warning"}
                  </p>
                </div>
                <MatchCandidateActions
                  normalizedId={c.normalized_id}
                  suggestedMasterId={
                    (c as { suggested_master_product_id?: string | null }).suggested_master_product_id ?? null
                  }
                  requiresReview={c.requires_review}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
