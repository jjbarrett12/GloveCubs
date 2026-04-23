import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteRequestById } from "@/lib/quotes/service";
import { getOffersForQuoteLineItems } from "@/lib/quotes/offer-matching";
import { recordFirstViewed } from "@/lib/quotes/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuoteStatusUpdate } from "@/app/(dashboard)/dashboard/quotes/[id]/QuoteStatusUpdate";
import { RfqAssignmentControls } from "./RfqAssignmentControls";
import { RfqInternalNotes } from "./RfqInternalNotes";
import { RfqSlaTimestamps } from "./RfqSlaTimestamps";
import { RfqLineItemsWithOffers } from "./RfqLineItemsWithOffers";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  normal: "secondary",
  high: "default",
  urgent: "destructive",
};

export default async function RfqWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuoteRequestById(id);
  if (!quote) notFound();

  await recordFirstViewed(id);

  const productIds = quote.line_items.map((i) => i.product_id);
  const offersByProduct = await getOffersForQuoteLineItems(productIds);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/rfq" className="text-sm text-muted-foreground hover:text-foreground">
          ← RFQ queue
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href={`/dashboard/quotes/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Quote view
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
        <div className="flex items-center gap-2">
          <Badge variant={PRIORITY_VARIANT[quote.priority ?? "normal"] ?? "secondary"}>
            {quote.priority ?? "normal"}
          </Badge>
          <Badge variant="outline">{quote.status}</Badge>
          {(quote.urgency === "urgent" || quote.urgency === "asap") && (
            <Badge variant="destructive">{quote.urgency}</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Company:</span> {quote.company_name}</p>
            <p><span className="text-muted-foreground">Contact:</span> {quote.contact_name}</p>
            <p><span className="text-muted-foreground">Email:</span> {quote.email}</p>
            {quote.phone && <p><span className="text-muted-foreground">Phone:</span> {quote.phone}</p>}
            {quote.urgency && <p><span className="text-muted-foreground">Buyer urgency:</span> {quote.urgency}</p>}
            {quote.notes && (
              <p className="mt-2"><span className="text-muted-foreground">Notes:</span> {quote.notes}</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <RfqAssignmentControls
            quoteId={quote.id}
            assignedTo={quote.assigned_to}
            priority={quote.priority ?? "normal"}
            dueBy={quote.due_by}
          />
          <RfqSlaTimestamps quote={quote} />
        </div>
      </div>

      <QuoteStatusUpdate quoteId={quote.id} currentStatus={quote.status} />

      <RfqInternalNotes quoteId={quote.id} initialNotes={quote.internal_notes} />

      <RfqLineItemsWithOffers lineItems={quote.line_items} offersByProduct={offersByProduct} />
    </div>
  );
}
