import { Suspense } from "react";
import Link from "next/link";
import { getQuoteByReference, getQuoteStatusHistory, isValidQuoteReference } from "@/lib/quotes/buyerService";
import { QuoteStatusBadge, getStatusDescription } from "@/components/quotes/QuoteStatusBadge";
import { QuoteTimeline } from "@/components/quotes/QuoteTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Building2, 
  User, 
  Mail, 
  Phone,
  Package,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { getNextAction } from "@/lib/quotes/nextAction";
import { QuoteDetailRefreshButton } from "@/components/quotes/QuoteDetailRefreshButton";

export const metadata = {
  title: "Quote Status | GloveCubs",
  description: "Check the status of your quote request.",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function QuoteStatusSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}

function InvalidReferenceCard({ refNumber }: { refNumber: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center py-8">
          <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold">Invalid reference format</h2>
          <p className="text-muted-foreground mt-2">
            <span className="font-mono">{refNumber || "—"}</span> is not a valid quote reference.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Reference numbers look like <span className="font-mono">RFQ-A1B2C3D4</span>. Check the number and try again.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/quote/status">
              <Button variant="outline">Check another quote</Button>
            </Link>
            <Link href="/quote">
              <Button>New quote request</Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function QuoteStatusContent({ refNumber }: { refNumber: string }) {
  let quote: Awaited<ReturnType<typeof getQuoteByReference>> = null;
  let history: Awaited<ReturnType<typeof getQuoteStatusHistory>> = [];
  let loadError: string | null = null;

  try {
    quote = await getQuoteByReference(refNumber);
    if (quote) {
      history = await getQuoteStatusHistory(quote.id);
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load quote";
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground mt-2">
              We couldn&apos;t load this quote. Please try again later.
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{loadError}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" asChild>
                <Link href={`/quote/status/${encodeURIComponent(refNumber)}`}>Try Again</Link>
              </Button>
              <Link href="/quote/status">
                <Button>Check Another Quote</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!quote) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Quote Not Found</h2>
            <p className="text-muted-foreground mt-2">
              We couldn't find a quote with reference <span className="font-mono">{refNumber}</span>.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Please check the reference number and try again.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/quote/status">
                <Button variant="outline">Try Again</Button>
              </Link>
              <Link href="/quote">
                <Button>New Quote Request</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const nextAction = getNextAction(quote.status, quote.expires_at);
  const statusDescription = getStatusDescription(quote.status);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Quote {quote.reference_number}</h1>
            <QuoteStatusBadge status={quote.status} size="lg" />
          </div>
          <p className="text-muted-foreground mt-1">{statusDescription}</p>
        </div>
        <QuoteDetailRefreshButton />
      </div>
      
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timeline */}
          <QuoteTimeline
            currentStatus={quote.status}
            history={history}
            submittedAt={quote.submitted_at || quote.created_at}
            quotedAt={quote.quoted_at}
            wonAt={quote.won_at}
            lostAt={quote.lost_at}
            expiredAt={quote.expired_at}
            expiresAt={quote.expires_at}
          />
          
          {/* Lost Reason */}
          {quote.status === "lost" && quote.lost_reason && (
            <div className="bg-red-50 border border-red-100 rounded-md p-4">
              <p className="text-sm font-medium text-red-800">Reason</p>
              <p className="text-sm text-red-700 mt-1">{quote.lost_reason}</p>
            </div>
          )}
          
          {/* Next Action */}
          <div className="bg-muted/50 rounded-md p-4">
            <p className="text-sm font-medium">What's Next?</p>
            <p className="text-sm text-muted-foreground mt-1">{nextAction.message}</p>
            {nextAction.action && (
              <Link href={nextAction.action.href} className="mt-3 inline-block">
                <Button size="sm">{nextAction.action.label}</Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Request Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <dt className="text-xs text-muted-foreground">Submitted</dt>
                <dd className="text-sm">{formatDate(quote.submitted_at || quote.created_at)}</dd>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <dt className="text-xs text-muted-foreground">Company</dt>
                <dd className="text-sm">{quote.company_name}</dd>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="text-sm">{quote.contact_name}</dd>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="text-sm">{quote.email}</dd>
              </div>
            </div>
            
            {quote.phone && (
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd className="text-sm">{quote.phone}</dd>
                </div>
              </div>
            )}
            
            {quote.urgency && (
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <dt className="text-xs text-muted-foreground">Urgency</dt>
                  <dd className="text-sm capitalize">{quote.urgency}</dd>
                </div>
              </div>
            )}

            {quote.expires_at && (
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <dt className="text-xs text-muted-foreground">Expiration date</dt>
                  <dd className="text-sm">
                    {formatDate(quote.expires_at)}
                    {new Date(quote.expires_at) < new Date() && (
                      <span className="ml-2 text-orange-600 font-medium">(expired)</span>
                    )}
                  </dd>
                </div>
              </div>
            )}
          </dl>
          
          {quote.notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{quote.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Line Items if available */}
      {quote.line_items && quote.line_items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5" />
              Requested Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {quote.line_items.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">
                        {(item.product_snapshot as { name?: string })?.name || "Product"}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                      )}
                    </div>
                    <Badge variant="outline">Qty: {item.quantity}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      {/* Help */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Have questions about your quote?{" "}
            <Link href="/contact" className="text-primary underline-offset-4 hover:underline">
              Contact our sales team
            </Link>
            {" "}or call us at <span className="font-medium">1-800-XXX-XXXX</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function QuoteStatusPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const refNumber = decodeURIComponent(ref || "").trim().toUpperCase();

  if (!isValidQuoteReference(refNumber)) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/quote"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quote Request
        </Link>
        <InvalidReferenceCard refNumber={refNumber || ref} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/quote"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Quote Request
      </Link>

      <Suspense fallback={<QuoteStatusSkeleton />}>
        <QuoteStatusContent refNumber={refNumber} />
      </Suspense>
    </div>
  );
}
