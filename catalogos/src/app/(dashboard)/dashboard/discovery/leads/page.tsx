import Link from "next/link";
import { listLeads } from "@/lib/discovery/leads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DiscoveryLeadsPage() {
  let leads: Awaited<ReturnType<typeof listLeads>> = [];
  try {
    leads = await listLeads({ limit: 100, orderBy: "created_at", orderDesc: true });
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Supplier leads</h1>
        <p className="text-destructive">Failed to load. Ensure Supabase and migrations are configured.</p>
      </div>
    );
  }

  const statusVariant = (s: string) =>
    s === "onboarded" ? "default" : s === "rejected" ? "destructive" : "secondary";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Supplier leads</h1>
        <Link href="/dashboard/discovery/runs" className="text-sm text-primary hover:underline">
          Discovery runs →
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Review queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leads.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No leads yet. Run discovery or add a lead manually.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">Company</th>
                    <th className="text-left p-3 font-medium">Domain</th>
                    <th className="text-left p-3 font-medium">Score</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Method</th>
                    <th className="text-left p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{l.company_name}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{l.domain ?? "—"}</td>
                      <td className="p-3">{l.lead_score}</td>
                      <td className="p-3"><Badge variant={statusVariant(l.status)}>{l.status}</Badge></td>
                      <td className="p-3 text-muted-foreground">{l.discovery_method}</td>
                      <td className="p-3">
                        <Link href={`/dashboard/discovery/leads/${l.id}`} className="text-primary hover:underline">View</Link>
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
