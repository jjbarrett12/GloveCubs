import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ExternalLink } from "lucide-react";

export const metadata = {
  title: "Quote request received | GloveCubs",
  description: "Your quote request has been submitted.",
};

export default async function QuoteConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; ref?: string }>;
}) {
  const { id, ref } = await searchParams;
  const referenceNumber = ref ?? "—";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Quote Request Received</h1>
              <p className="text-muted-foreground text-sm">
                We&apos;ll get back to you shortly.
              </p>
            </div>
          </div>
          
          <div className="bg-muted/50 rounded-lg p-4 mt-4">
            <p className="text-xs text-muted-foreground mb-1">Your Reference Number</p>
            <p className="font-mono text-lg font-medium text-foreground">
              {referenceNumber}
            </p>
            <p className="text-muted-foreground text-xs mt-2">
              Save this reference to track your quote status.
            </p>
          </div>
          
          <div className="border-t mt-6 pt-6 space-y-4">
            <h2 className="font-medium text-sm">What happens next?</h2>
            <ol className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">1</span>
                <span>Our team will review your request within 1-2 business days.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-muted text-muted-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">2</span>
                <span>We&apos;ll prepare a custom quote based on your requirements.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-muted text-muted-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium shrink-0">3</span>
                <span>You&apos;ll receive the quote via email with pricing details.</span>
              </li>
            </ol>
          </div>
          
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {referenceNumber !== "—" && (
              <Link href={`/quote/status/${encodeURIComponent(referenceNumber)}`} className="flex-1">
                <Button className="w-full" variant="default">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Track Quote Status
                </Button>
              </Link>
            )}
            <Link href="/catalog/disposable_gloves" className="flex-1">
              <Button className="w-full" variant="outline">Continue Browsing</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Have questions? You can always{" "}
            <Link href={`/quote/status/${encodeURIComponent(referenceNumber)}`} className="text-primary hover:underline">
              check your quote status
            </Link>
            {" "}or{" "}
            <Link href="/contact" className="text-primary hover:underline">
              contact our team
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
