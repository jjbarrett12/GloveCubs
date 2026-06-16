"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import { writeReorderSource } from "@/lib/quote-cart/reorder-source-session";
import { formatMinorAmount } from "@/lib/admin/admin-orders-read-model";

export type ReorderLineChoice = {
  id: string;
  lineNumber: number;
  quantity: number;
  unitPriceMinor: number;
  label: string;
};

type ApiAvailable = {
  orderLineId: string;
  lineNumber: number;
  defaultQty: number;
  cart: {
    product_id: string;
    name: string;
    slug: string;
    brandName: string | null;
    catalog_variant_id?: string | null;
    variant_sku?: string | null;
    size_code?: string | null;
    line_note?: string | null;
  };
};

type ApiBlocked = {
  status: string;
  orderLineId: string;
  lineNumber: number;
  explanation: string;
};

export function AccountReorderToQuoteClient({
  orderId,
  orderNumber,
  currencyCode,
  lines,
}: {
  orderId: string;
  orderNumber: string;
  currencyCode: string;
  lines: ReorderLineChoice[];
}) {
  const router = useRouter();
  const { addItem } = useQuoteCart();
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const ln of lines) o[ln.id] = true;
    return o;
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    available: ApiAvailable[];
    blocked: ApiBlocked[];
    summary: { available: number; blocked: number };
  } | null>(null);

  const selectedIds = useMemo(() => lines.filter((l) => selected[l.id]).map((l) => l.id), [lines, selected]);

  async function mapLines() {
    setErr(null);
    setPreview(null);
    if (selectedIds.length === 0) {
      setErr("Select at least one line.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/account/reorder-quote-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, selectedLineIds: selectedIds }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Could not prepare repeat quote.");
        return;
      }
      const available = Array.isArray(data.availableLines) ? (data.availableLines as ApiAvailable[]) : [];
      const blocked = Array.isArray(data.blockedLines) ? (data.blockedLines as ApiBlocked[]) : [];
      const summary = data.summary as { available?: number; blocked?: number } | undefined;
      setPreview({
        available,
        blocked,
        summary: { available: summary?.available ?? available.length, blocked: summary?.blocked ?? blocked.length },
      });
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function addToCartAndGo() {
    if (!preview || preview.available.length === 0) return;
    for (const row of preview.available) {
      addItem(row.cart, row.defaultQty);
    }
    writeReorderSource({
      orderId,
      orderNumber,
      createdAt: new Date().toISOString(),
    });
    setPreview(null);
    router.push("/quote-cart");
  }

  return (
    <section className="mt-10 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Build repeat quote</h2>
      <p className="mt-2 text-sm text-white/70">
        Reuse lines from this past order to start a new quote request. Historical prices are shown for reference only.
        Current pricing and availability will be confirmed before fulfillment — not checkout.
      </p>

      <div className="mt-4 space-y-2">
        {lines.map((ln) => (
          <label key={ln.id} className="flex cursor-pointer items-start gap-2 rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/85">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(selected[ln.id])}
              onChange={(e) => setSelected((s) => ({ ...s, [ln.id]: e.target.checked }))}
            />
            <span>
              <span className="font-mono text-xs text-white/50">#{ln.lineNumber}</span> {ln.label}
              <span className="mt-1 block text-xs text-white/45">
                Previously ordered: qty {ln.quantity} · unit {formatMinorAmount(ln.unitPriceMinor, currencyCode)}{" "}
                <span className="text-white/35">(historical reference only)</span>
              </span>
            </span>
          </label>
        ))}
      </div>

      {err ? <p className="mt-3 text-sm text-red-300">{err}</p> : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => void mapLines()}
          className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Checking catalog…" : "Prepare selected lines"}
        </button>
      </div>

      {preview ? (
        <div className="mt-6 rounded border border-white/10 bg-black/25 px-3 py-3 text-sm text-white/80">
          <p className="font-medium text-white/90">
            {preview.summary.available} line(s) can be added to your quote request cart
            {preview.summary.blocked > 0 ? ` · ${preview.summary.blocked} line(s) need review or are unavailable` : ""}.
          </p>
          {preview.blocked.length > 0 ? (
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-amber-200/90">
              {preview.blocked.map((b) => (
                <li key={b.orderLineId}>
                  Line {b.lineNumber} ({b.status}): {b.explanation}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {preview.available.length > 0 ? (
              <button
                type="button"
                onClick={() => addToCartAndGo()}
                className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Add {preview.available.length} to quote cart &amp; continue
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-md px-4 py-2 text-sm text-white/60 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
