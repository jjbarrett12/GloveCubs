"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";
import {
  buyerQuicklistRowToQuoteCartLine,
  type BuyerQuicklistRow,
} from "@/lib/account/buyer-quicklist-read-model";
import { writeQuicklistQuoteSourceNote } from "@/lib/quote-cart/quicklist-quote-source-session";

type Props = {
  rows: BuyerQuicklistRow[];
  tierCode: string | null;
};

export function BuyerQuicklistClient({ rows, tierCode }: Props) {
  const router = useRouter();
  const { addItem } = useQuoteCart();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const r of rows) {
      if (r.availability === "available") init[r.id] = 1;
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const availableRows = useMemo(() => rows.filter((r) => r.availability === "available"), [rows]);

  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: on }));
  }, []);

  const selectAllAvailable = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const r of availableRows) next[r.id] = true;
    setSelected(next);
  }, [availableRows]);

  const clearSelection = useCallback(() => setSelected({}), []);

  const setQty = useCallback((id: string, raw: string) => {
    const n = parseInt(raw, 10);
    setQuantities((prev) => ({
      ...prev,
      [id]: Number.isFinite(n) && n >= 1 ? Math.min(99999, n) : 1,
    }));
  }, []);

  async function addSelectedToCart() {
    setMsg(null);
    const lines: { row: BuyerQuicklistRow; qty: number }[] = [];
    for (const r of availableRows) {
      if (!selected[r.id]) continue;
      const q = quantities[r.id] ?? 1;
      if (!Number.isFinite(q) || q < 1) {
        setMsg("Each selected line needs a quantity of at least 1.");
        return;
      }
      lines.push({ row: r, qty: q });
    }
    if (lines.length === 0) {
      setMsg("Select at least one available variant.");
      return;
    }
    setBusy(true);
    try {
      for (const { row, qty } of lines) {
        addItem(buyerQuicklistRowToQuoteCartLine(row), qty);
      }
      writeQuicklistQuoteSourceNote();
      router.push("/quote-cart");
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/70">
        <p className="font-medium text-white/85">
          No quicklist items yet. Your GloveCubs team can assign approved glove variants so you can build repeat quotes faster.
        </p>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link className="font-semibold text-[#f06232] hover:underline" href="/store">
            Browse store
          </Link>
          <Link className="font-semibold text-[#f06232] hover:underline" href="/quote-cart">
            Quote request cart
          </Link>
          <Link className="font-semibold text-[#f06232] hover:underline" href="/request-pricing">
            Request pricing
          </Link>
          <Link className="font-semibold text-[#f06232] hover:underline" href="/contact">
            Contact
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {tierCode ? (
        <p className="text-xs text-white/50">
          Company tier:{" "}
          <span className="rounded bg-white/10 px-2 py-0.5 font-semibold text-white/85">{b2bTierLabel(tierCode)}</span>
        </p>
      ) : null}

      <p className="text-sm text-white/70">
        These are the glove variants assigned to your account. Add selected items to a quote request. Pricing and availability are confirmed when your quote is reviewed.
      </p>

      {msg ? <p className="text-sm text-amber-200">{msg}</p> : null}

      {availableRows.length > 0 ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            className="font-semibold text-[#f06232] underline disabled:opacity-50"
            onClick={() => selectAllAvailable()}
            disabled={busy}
          >
            Select all available
          </button>
          <button
            type="button"
            className="font-semibold text-white/60 underline disabled:opacity-50"
            onClick={() => clearSelection()}
            disabled={busy}
          >
            Clear selection
          </button>
          <button
            type="button"
            className="rounded-md bg-[#f06232] px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            onClick={() => void addSelectedToCart()}
            disabled={busy}
          >
            {busy ? "Adding…" : "Add selected to quote request cart"}
          </button>
          <Link href="/quote-cart" className="self-center text-xs font-semibold text-[#f06232] underline">
            Open quote request cart
          </Link>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.06] text-[11px] font-semibold uppercase tracking-wide text-white/45">
            <tr>
              <th className="px-3 py-2.5 w-10" />
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Brand</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Size</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 w-28">Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ok = r.availability === "available";
              const badge =
                r.availability === "available"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : r.availability === "product_inactive"
                    ? "bg-amber-500/20 text-amber-100"
                    : r.availability === "variant_inactive"
                      ? "bg-amber-500/20 text-amber-100"
                      : "bg-white/10 text-white/60";
              const label =
                r.availability === "available"
                  ? "Available"
                  : r.availability === "product_inactive"
                    ? "Product inactive"
                    : r.availability === "variant_inactive"
                      ? "Variant inactive"
                      : "Unavailable";
              return (
                <tr key={r.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2.5 align-top">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#f06232] disabled:cursor-not-allowed disabled:opacity-40"
                      checked={Boolean(selected[r.id])}
                      disabled={!ok || busy}
                      onChange={(e) => toggle(r.id, e.target.checked)}
                      aria-label={`Select ${r.product_name}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 align-top font-medium text-white/90">{r.product_name}</td>
                  <td className="px-3 py-2.5 align-top text-white/70">{r.brand_name ?? "—"}</td>
                  <td className="px-3 py-2.5 align-top font-mono text-xs text-white/70">{r.variant_sku}</td>
                  <td className="px-3 py-2.5 align-top text-white/70">{r.size_code ?? "—"}</td>
                  <td className="px-3 py-2.5 align-top">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}>
                      {label}
                    </span>
                    {r.availability_note ? (
                      <p className="mt-1 max-w-xs text-[11px] leading-snug text-white/45">{r.availability_note}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <input
                      type="number"
                      min={1}
                      disabled={!ok || busy}
                      value={quantities[r.id] ?? 1}
                      onChange={(e) => setQty(r.id, e.target.value)}
                      className="w-full max-w-[5rem] rounded border border-white/15 bg-black/30 px-2 py-1 text-xs text-white disabled:opacity-40"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
