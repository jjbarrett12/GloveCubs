"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, FileText, AlertCircle, Loader2 } from "lucide-react";

export default function QuoteStatusLookupPage() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    const ref = reference.trim().toUpperCase();
    
    if (!ref) {
      setError("Please enter a reference number");
      return;
    }
    
    // Basic validation - reference numbers start with RFQ-
    if (!ref.startsWith("RFQ-") && ref.length < 4) {
      setError("Please enter a valid reference number (e.g., RFQ-XXXXXXXX)");
      return;
    }
    
    setLoading(true);
    
    // Navigate to the status page
    router.push(`/quote/status/${encodeURIComponent(ref)}`);
  };
  
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link 
        href="/quote" 
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Quote Request
      </Link>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Check Quote Status
          </CardTitle>
          <CardDescription>
            Enter your quote reference number to check the status of your request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number</Label>
              <div className="relative">
                <Input
                  id="reference"
                  type="text"
                  placeholder="RFQ-XXXXXXXX"
                  value={reference}
                  onChange={(e) => {
                    setReference(e.target.value.toUpperCase());
                    setError("");
                  }}
                  className="font-mono uppercase"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                You received this reference number when you submitted your quote request.
              </p>
            </div>
            
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || !reference.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Check Status
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <h3 className="font-medium text-sm mb-2">Can't find your reference number?</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Check your email for the confirmation message</li>
            <li>• Reference numbers look like: RFQ-A1B2C3D4</li>
            <li>• Contact us if you need help locating your quote</li>
          </ul>
          <div className="mt-4">
            <Link href="/contact">
              <Button variant="link" className="h-auto p-0 text-sm">
                Contact Support →
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
