import Link from "next/link";
import { listQuoteRequests } from "@/lib/quotes/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  new: "default",
  reviewing: "secondary",
  contacted: "secondary",
  quoted: "outline",
  closed: "outline",
};

export default async function QuotesListPage() {
  let quotes: Awaited<ReturnType<typeof listQuoteRequests>> = [];
  try {
    quotes = await listQuoteRequests({ limit: 100 });
  } catch (e) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Quote requests</h1>
        <p className="text-destructive">Failed to load. Ensure Supabase and migrations are configured.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Quote requests</h1>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Incoming RFQs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quotes.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No quote requests yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">Reference</th>
                    <th className="text-left p-3 font-medium">Company</th>
                    <th className="text-left p-3 font-medium">Contact</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-left p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{q.reference_number ?? "—"}</td>
                      <td className="p-3 font-medium">{q.company_name}</td>
                      <td className="p-3 text-muted-foreground">
                        {q.contact_name} · {q.email}
                      </td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANT[q.status] ?? "secondary"}>{q.status}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(q.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <Link href={`/dashboard/quotes/${q.id}`} className="text-primary hover:underline">
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
