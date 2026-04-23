import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteRequestById } from "@/lib/quotes/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuoteStatusUpdate } from "./QuoteStatusUpdate";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuoteRequestById(id);
  if (!quote) notFound();

  const snapshot = (q: { product_snapshot?: Record<string, unknown> }) =>
    (q.product_snapshot as { name?: string })?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/quotes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Quotes
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href={`/dashboard/rfq/${quote.id}`} className="text-sm text-primary hover:underline">
          RFQ workspace
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {quote.reference_number ?? quote.id.slice(0, 8)}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {quote.company_name} · {quote.contact_name}
          </p>
        </div>
        <Badge variant={quote.status === "new" ? "default" : "secondary"}>
          {quote.status}
        </Badge>
      </div>

      <QuoteStatusUpdate quoteId={quote.id} currentStatus={quote.status} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="text-muted-foreground">Email:</span> {quote.email}</p>
          {quote.phone && <p><span className="text-muted-foreground">Phone:</span> {quote.phone}</p>}
          {quote.urgency && <p><span className="text-muted-foreground">Urgency:</span> {quote.urgency}</p>}
          {quote.notes && (
            <p className="mt-2"><span className="text-muted-foreground">Notes:</span> {quote.notes}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Line items ({quote.line_items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-right p-3 font-medium">Qty</th>
                <th className="text-left p-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {quote.line_items.map((line) => (
                <tr key={line.id} className="border-b border-border/50">
                  <td className="p-3">{snapshot(line)}</td>
                  <td className="p-3 text-right">{line.quantity}</td>
                  <td className="p-3 text-muted-foreground">{line.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
