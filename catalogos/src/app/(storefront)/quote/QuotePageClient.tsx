"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuoteBasket } from "@/contexts/QuoteBasketContext";
import { submitQuoteRequestAction } from "@/app/actions/quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QuotePageClient() {
  const { items, removeItem, updateItem, clear } = useQuoteBasket();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<string>("standard");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await submitQuoteRequestAction({
      company_name: companyName.trim(),
      contact_name: contactName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      urgency: urgency || null,
      items: items.map((i) => ({
        productId: i.productId,
        canonicalProductId: i.canonicalProductId ?? i.productId,
        slug: i.slug,
        name: i.name,
        quantity: i.quantity,
        notes: i.notes || "",
      })),
    });
    setBusy(false);
    if (result.success && result.quoteId && result.referenceNumber) {
      clear();
      router.push(`/quote/confirmation?id=${result.quoteId}&ref=${encodeURIComponent(result.referenceNumber)}`);
      router.refresh();
    } else {
      setError(result.error ?? "Submission failed");
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-4">Your quote list is empty.</p>
          <Link href="/catalog/disposable_gloves">
            <Button variant="outline">Browse catalog</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/product/${item.slug}`} className="font-medium text-foreground hover:underline line-clamp-1">
                  {item.name}
                </Link>
                <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                  <label className="flex items-center gap-1">
                    Qty
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.productId, { quantity: parseInt(e.target.value, 10) || 1 })}
                      className="h-8 w-16 rounded border border-input bg-background px-2 text-center text-sm"
                    />
                  </label>
                  <input
                    type="text"
                    placeholder="Line notes (optional)"
                    value={item.notes}
                    onChange={(e) => updateItem(item.productId, { notes: e.target.value })}
                    className="h-8 flex-1 min-w-[120px] rounded border border-input bg-background px-2 text-sm"
                  />
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.productId)}>
                Remove
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your details</CardTitle>
          <p className="text-sm text-muted-foreground">We’ll use this to send your quote.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Company name *</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Inc."
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Contact name *</label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Email *</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@acme.com"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Phone</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1..."
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Urgency</label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="standard">Standard</option>
              <option value="urgent">Urgent</option>
              <option value="asap">ASAP</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery requirements, questions, etc."
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Submit quote request"}
        </Button>
        <Link href="/catalog/disposable_gloves">
          <Button type="button" variant="outline">Continue shopping</Button>
        </Link>
      </div>
    </form>
  );
}
