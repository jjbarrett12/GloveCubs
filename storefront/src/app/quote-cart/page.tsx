"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import { quoteCartLineReactKey } from "@/lib/quote-cart/line-utils";
import { RESTAURANT_PREP_LINE_ENVIRONMENT_KEY } from "@/lib/ontology/operational-environments";
import { PREP_LINE_QUOTE_SESSION_KEY } from "@/lib/procurement/session-storage";
import { PrepLineOperationalCopy } from "@/lib/prep-line/operational-copy";

function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 3 || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function QuoteCartPage() {
  const { items, hydrated, setQuantityAtIndex, setLineNoteAtIndex, removeItemAtIndex, clear } = useQuoteCart();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [quoteRequestId, setQuoteRequestId] = useState<string | null>(null);
  const [buyerDisplayRef, setBuyerDisplayRef] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const nameT = name.trim();
    const emailT = email.trim();
    if (!nameT) {
      setError("Name is required.");
      return;
    }
    if (!emailT || !isValidEmail(emailT)) {
      setError("A valid work email is required.");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one product from the store.");
      return;
    }

    setSubmitting(true);
    setQuoteRequestId(null);
    setBuyerDisplayRef(null);
    try {
      let operational_environment_key: "restaurant_prep_line" | undefined;
      try {
        if (sessionStorage.getItem(PREP_LINE_QUOTE_SESSION_KEY) === RESTAURANT_PREP_LINE_ENVIRONMENT_KEY) {
          operational_environment_key = RESTAURANT_PREP_LINE_ENVIRONMENT_KEY;
        }
      } catch {
        // ignore
      }

      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameT,
          email: emailT,
          phone: phone.trim() || null,
          company: company.trim() || null,
          notes: notes.trim() || null,
          website: honeypotRef.current?.value ?? null,
          operational_environment_key,
          items: items.map((i) => ({
            product_id: i.product_id,
            name: i.name,
            slug: i.slug,
            brandName: i.brandName,
            quantity: i.quantity,
            line_note: i.line_note?.trim() || null,
            catalog_variant_id: i.catalog_variant_id ?? null,
            variant_sku: i.variant_sku ?? null,
            size_code: i.size_code ?? null,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        if (res.status === 503) {
          setError("Pricing requests are temporarily unavailable. Please try again shortly.");
        } else if (res.status === 400) {
          setError(typeof data.error === "string" ? data.error : "Check the form and try again.");
        } else {
          setError("We could not save your quote request. Please try again.");
        }
        return;
      }
      if (data.ignored === true) {
        return;
      }
      const qid = typeof data.quote_request_id === "string" ? data.quote_request_id : null;
      if (!qid) {
        setError("We could not save your quote request. Please try again.");
        return;
      }

      const refRaw = typeof data.buyer_display_ref === "string" ? data.buyer_display_ref.trim() : "";
      const prepRef = refRaw.startsWith("GC-PREP-") ? refRaw : null;

      setQuoteRequestId(qid);
      setBuyerDisplayRef(prepRef);
      clear();
      setDone(true);
      setName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setNotes("");
    } catch {
      setError("Network error. Your quote request cart is unchanged — try again when you are back online.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <main className="max-w-2xl mx-auto px-4 py-10 pb-28 md:pb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Quote request cart</h1>
        <p className="text-white/60 text-sm mb-8">
          Request pricing for distributor review — not a checkout. We follow up on every saved request.
        </p>

        <input
          ref={honeypotRef}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="pointer-events-none fixed left-[-2400px] top-0 h-px w-px opacity-0"
        />

        {!hydrated && <p className="text-white/50 text-sm">Loading cart…</p>}

        {hydrated && done && quoteRequestId && (
          <div className="text-sm mb-6 border border-emerald-500/30 rounded-lg px-4 py-3 space-y-3">
            <p className="text-emerald-400/90 font-medium">Your quote request was received and saved.</p>
            <p className="text-white/80 text-sm">
              Our team will follow up using the contact details you provided. This is not an order confirmation — pricing
              and availability are confirmed during follow-up.
            </p>
            <div className="rounded-md bg-white/5 border border-white/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-white/45 mb-1">Quote request reference</p>
              <p className="font-mono text-xs text-white/90 break-all">{quoteRequestId}</p>
            </div>
            {buyerDisplayRef ? (
              <div className="text-xs text-white/75 space-y-1 border-t border-white/10 pt-2">
                <p>{PrepLineOperationalCopy.continuityRequestRef(buyerDisplayRef)}</p>
                <p className="text-white/55">{PrepLineOperationalCopy.continuityBusinessDays}</p>
              </div>
            ) : null}
            <p className="text-white/50 text-xs">
              If you do not hear from us within a couple of business days, reach out with your quote reference above.
            </p>
          </div>
        )}

        {hydrated && items.length === 0 && !done && (
          <p className="text-white/50 text-sm mb-6">
            Your quote request cart is empty.{" "}
            <Link href="/store" className="text-[hsl(var(--primary))] underline">
              Browse the store
            </Link>{" "}
            to add products.
          </p>
        )}

        {hydrated && items.length > 0 && (
          <ul className="space-y-4 mb-6">
            {items.map((i, idx) => {
              const lineKey = quoteCartLineReactKey(i, idx);
              return (
                <li
                  key={lineKey}
                  className="flex flex-col gap-3 border border-white/10 rounded-xl p-4 bg-white/5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium">{i.name}</p>
                      <p className="text-white/50 text-xs mt-0.5">{i.brandName ?? "—"}</p>
                      {i.slug ? (
                        <p className="text-white/40 text-[11px] mt-1">
                          Catalog:{" "}
                          <Link className="text-[#f06232]/90 hover:underline" href={`/store/p/${i.slug}`}>
                            /{i.slug}
                          </Link>
                        </p>
                      ) : null}
                      {i.variant_sku || i.size_code ? (
                        <p className="text-white/40 text-[11px] mt-1 font-mono">
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
                        max={99999}
                        className="w-24 min-h-11 bg-white/10 border-white/20 text-white"
                        value={i.quantity}
                        onChange={(e) => setQuantityAtIndex(idx, Number(e.target.value))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => removeItemAtIndex(idx)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-white/55 mb-1" htmlFor={`note-${lineKey}`}>
                      Line note (optional)
                    </label>
                    <textarea
                      id={`note-${lineKey}`}
                      className="w-full min-h-[72px] rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                      placeholder="Size mix, delivery window, substitution preferences…"
                      value={i.line_note ?? ""}
                      onChange={(e) => setLineNoteAtIndex(idx, e.target.value)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hydrated && items.length > 0 && (
          <>
            <div className="space-y-4 border border-white/10 rounded-xl p-6 bg-white/[0.03] md:mb-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Your name *</label>
                <Input
                  className="min-h-11 bg-white/10 border-white/20 text-white"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Work email *</label>
                <Input
                  type="email"
                  className="min-h-11 bg-white/10 border-white/20 text-white"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Phone (optional)</label>
                <Input
                  type="tel"
                  className="min-h-11 bg-white/10 border-white/20 text-white"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Company name (optional)</label>
                <Input
                  className="min-h-11 bg-white/10 border-white/20 text-white"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Notes for your request (optional)</label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Program context, billing entity, sites…"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0a0a0a]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:static md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
              <div className="max-w-2xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href="/store"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/20 px-4 text-sm font-medium text-white/90 hover:bg-white/10"
                >
                  Continue shopping
                </Link>
                <Button
                  type="button"
                  className="w-full min-h-12 bg-[hsl(var(--primary))] text-white sm:w-auto sm:min-w-[220px]"
                  disabled={submitting}
                  onClick={submit}
                >
                  {submitting ? "Saving…" : "Submit quote request"}
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
