import Link from "next/link";
import { listOnboardingRequests } from "@/lib/onboarding/requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function OnboardingListPage() {
  let requests: Awaited<ReturnType<typeof listOnboardingRequests>> = [];
  try {
    requests = await listOnboardingRequests({ limit: 50 });
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Onboarding</h1>
        <p className="text-destructive">Failed to load. Ensure Supabase and migrations are configured.</p>
      </div>
    );
  }

  const statusVariant = (s: string) =>
    s === "completed" ? "default" : s === "rejected" ? "destructive" : "secondary";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Supplier onboarding</h1>
        <div className="flex items-center gap-3">
          <Link href="/supplier-intake" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
            Supplier intake portal ↗
          </Link>
          <Link href="/dashboard/onboarding/new" className="text-sm text-primary hover:underline">
            New request →
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No onboarding requests. Create one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">Company</th>
                    <th className="text-left p-3 font-medium">Source</th>
                    <th className="text-left p-3 font-medium">Feed</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.company_name}</td>
                      <td className="p-3">
                        {(r as { submitted_via?: string }).submitted_via === "supplier_portal" ? (
                          <Badge variant="outline">Portal</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Admin</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {r.feed_type ?? "—"} {r.feed_url ? "· URL" : ""}
                      </td>
                      <td className="p-3">
                        <Badge variant={statusVariant(r.status)}>{r.status.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="p-3">
                        <Link href={`/dashboard/onboarding/${r.id}`} className="text-primary hover:underline">
                          View
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
