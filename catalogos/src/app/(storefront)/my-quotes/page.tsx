import { Suspense } from "react";
import Link from "next/link";
import { getQuotesByEmail, getBuyerNotifications } from "@/lib/quotes/buyerService";
import { QuoteStatusBadge } from "@/components/quotes/QuoteStatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Plus, 
  Clock, 
  ChevronRight,
  AlertCircle,
  Inbox,
  Bell
} from "lucide-react";
import { cookies } from "next/headers";

export const metadata = {
  title: "My Quotes | GloveCubs",
  description: "View and track your quote requests.",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(dateStr);
}

function QuoteListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function QuoteListContent({ email }: { email: string }) {
  let quotes: Awaited<ReturnType<typeof getQuotesByEmail>> = [];
  let loadError: string | null = null;
  let notifications: Awaited<ReturnType<typeof getBuyerNotifications>> = [];

  try {
    quotes = await getQuotesByEmail(email);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load quotes";
  }

  try {
    notifications = await getBuyerNotifications(email);
  } catch {
    notifications = [];
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Unable to Load Quotes</h2>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
              {loadError}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Please try again or contact support if the problem persists.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold">No Quote Requests Yet</h2>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
              You haven&apos;t submitted any quote requests. Start building your first quote to get competitive pricing.
            </p>
            <Link href="/quote" className="mt-6 inline-block">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Request a Quote
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Group quotes by status category
  const activeQuotes = quotes.filter(q => 
    ["new", "reviewing", "contacted", "quoted"].includes(q.status)
  );
  const completedQuotes = quotes.filter(q => 
    ["won", "lost", "expired", "closed"].includes(q.status)
  );
  
  return (
    <div className="space-y-8">
      {/* Launch notice: portal is source of truth when email delivery is stubbed */}
      <Card className="border-muted bg-muted/20">
        <CardContent className="py-3">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Source of truth at launch:</strong> Quote status and updates in this portal are authoritative. Check this page for the latest; email notifications may be delayed or unavailable.
          </p>
        </CardContent>
      </Card>

      {/* Updates banner: surface quote notifications in-portal (no email dependency) */}
      {notifications.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h2 className="font-semibold text-sm">You have quote updates</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {notifications.length} update{notifications.length !== 1 ? "s" : ""} on your quote
                  {notifications.length !== 1 ? "s" : ""}. Check status below or use the reference to view details.
                </p>
                <ul className="mt-2 space-y-1">
                  {notifications.slice(0, 5).map((n, i) => (
                    <li key={i}>
                      <Link
                        href={`/quote/status/${encodeURIComponent(n.referenceNumber || n.quoteId)}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {n.referenceNumber || n.quoteId} — {n.type.replace(/_/g, " ")}
                      </Link>
                    </li>
                  ))}
                  {notifications.length > 5 && (
                    <li className="text-xs text-muted-foreground">
                      +{notifications.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Quotes */}
      {activeQuotes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Active Quotes
            <Badge variant="secondary" className="ml-2">{activeQuotes.length}</Badge>
          </h2>
          <div className="space-y-3">
            {activeQuotes.map((quote) => (
              <Link 
                key={quote.id} 
                href={`/quote/status/${encodeURIComponent(quote.reference_number || quote.id)}`}
              >
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-medium">
                            {quote.reference_number || "—"}
                          </span>
                          <QuoteStatusBadge status={quote.status} size="sm" />
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Submitted {formatRelativeDate(quote.submitted_at || quote.created_at)}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
      
      {/* Completed Quotes */}
      {completedQuotes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Past Quotes
            <Badge variant="outline" className="ml-2">{completedQuotes.length}</Badge>
          </h2>
          <div className="space-y-3">
            {completedQuotes.map((quote) => (
              <Link 
                key={quote.id} 
                href={`/quote/status/${encodeURIComponent(quote.reference_number || quote.id)}`}
              >
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer opacity-75 hover:opacity-100">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-medium">
                            {quote.reference_number || "—"}
                          </span>
                          <QuoteStatusBadge status={quote.status} size="sm" />
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(quote.created_at)}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default async function MyQuotesPage() {
  // Get user email from session/cookie
  // This is a simplified check - adjust based on your auth system
  const cookieStore = await cookies();
  const userEmail = cookieStore.get("user_email")?.value;
  
  // If no email, show lookup form
  if (!userEmail) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Quotes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track and manage your quote requests.
          </p>
        </div>
        
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold">Sign In Required</h2>
              <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                Sign in to view your quote history, or use your reference number to check a specific quote.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link href="/quote/status">
                  <Button variant="outline">
                    Look Up by Reference
                  </Button>
                </Link>
                <Link href="/login">
                  <Button>Sign In</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Need to request a new quote?{" "}
              <Link href="/quote" className="text-primary hover:underline">
                Start a quote request →
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Quotes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track and manage your quote requests.
          </p>
        </div>
        <Link href="/quote">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Quote
          </Button>
        </Link>
      </div>
      
      <Suspense fallback={<QuoteListSkeleton />}>
        <QuoteListContent email={userEmail} />
      </Suspense>
    </div>
  );
}
