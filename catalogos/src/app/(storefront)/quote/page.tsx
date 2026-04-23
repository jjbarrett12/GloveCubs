import { QuotePageClient } from "./QuotePageClient";

export const metadata = {
  title: "Quote request | GloveCubs",
  description: "Submit your quote request. We’ll get back to you with pricing.",
};

export default function QuotePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quote request</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Add products from the catalog, then submit your details. We’ll prepare a quote and contact you.
        </p>
      </div>
      <QuotePageClient />
    </div>
  );
}
