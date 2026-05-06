"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import { quoteCartLineReactKey } from "@/lib/quote-cart/line-utils";

export default function QuoteCartPage() {
  const { items, hydrated, setQuantity, removeItem, clear } = useQuoteCart();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** Mirrors API `email_notification_sent` for smoke testing */
  const [emailNotificationSent, setEmailNotificationSent] = useState<boolean | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one product from the store.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || null,
          notes: notes.trim() || null,
          items: items.map((i) => ({
            product_id: i.product_id,
            name: i.name,
            slug: i.slug,
            brandName: i.brandName,
            quantity: i.quantity,
            catalog_variant_id: i.catalog_variant_id ?? null,
            variant_sku: i.variant_sku ?? null,
            size_code: i.size_code ?? null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setEmailNotificationSent(
        typeof data.email_notification_sent === "boolean" ? data.email_notification_sent : null
      );
      clear();
      setDone(true);
      setName("");
      setEmail("");
      setCompany("");
      setNotes("");
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold text-white">
            GloveCubs
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/store" className="text-white/80 hover:text-white text-sm">
              Store
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">Quote cart</h1>
        <p className="text-white/60 text-sm mb-8">Review items and request pricing.</p>

        {!hydrated && <p className="text-white/50 text-sm">Loading cart…</p>}

        {hydrated && done && (
          <div className="text-sm mb-6 border border-emerald-500/30 rounded-lg px-4 py-3 space-y-2">
            <p className="text-emerald-400/90">
              Thanks — your quote request was submitted. We’ll follow up shortly.
            </p>
            {emailNotificationSent === false && (
              <p className="text-amber-200/90 text-xs">
                Email notification was not sent (check SMTP env). Your request is still saved.
              </p>
            )}
          </div>
        )}

        {hydrated && items.length === 0 && !done && (
          <p className="text-white/50 text-sm mb-6">
            Your cart is empty.{" "}
            <Link href="/store" className="text-[hsl(var(--primary))] underline">
              Browse the store
            </Link>
            .
          </p>
        )}

        {hydrated && items.length > 0 && (
          <ul className="space-y-4 mb-10">
            {items.map((i, idx) => {
              const lineKey = quoteCartLineReactKey(i, idx);
              return (
              <li
                key={lineKey}
                className="flex flex-col sm:flex-row sm:items-center gap-3 border border-white/10 rounded-xl p-4 bg-white/5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{i.name}</p>
                  <p className="text-white/50 text-xs truncate">{i.brandName ?? "—"}</p>
                  {(i.variant_sku || i.size_code) ? (
                    <p className="text-white/40 text-[11px] mt-1 font-mono truncate">
                      {[i.size_code ? `Size ${i.size_code}` : null, i.variant_sku ? `SKU ${i.variant_sku}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="sr-only" htmlFor={`qty-${lineKey}`}>
                    Quantity
                  </label>
                  <Input
                    id={`qty-${lineKey}`}
                    type="number"
                    min={1}
                    className="w-20 bg-white/10 border-white/20 text-white"
                    value={i.quantity}
                    onChange={(e) => setQuantity(i.product_id, Number(e.target.value), i.catalog_variant_id ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeItem(i.product_id, i.catalog_variant_id ?? null)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
            })}
          </ul>
        )}

        {hydrated && items.length > 0 && (
          <div className="space-y-4 border border-white/10 rounded-xl p-6 bg-white/[0.03]">
            <div>
              <label className="block text-sm text-white/70 mb-1">Your name *</label>
              <Input
                className="bg-white/10 border-white/20 text-white"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Work email *</label>
              <Input
                type="email"
                className="bg-white/10 border-white/20 text-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Company</label>
              <Input
                className="bg-white/10 border-white/20 text-white"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="organization"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Notes</label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              type="button"
              className="w-full bg-[hsl(var(--primary))] text-white"
              disabled={submitting}
              onClick={submit}
            >
              {submitting ? "Sending…" : "Request pricing"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
