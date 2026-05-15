"use client";

import { useCallback, useEffect, useState } from "react";
import { TableCard } from "@/components/admin";
import type { CompanyQuicklistItemRow, QuicklistCatalogSearchRow } from "@/lib/admin/admin-company-quicklist";

type Props = {
  companyId: string;
  initialItems: CompanyQuicklistItemRow[];
};

function availabilityLabel(row: CompanyQuicklistItemRow): { text: string; className: string } {
  const productOk = row.product_status === "active";
  const variantOk = row.variant_is_active;
  if (productOk && variantOk) return { text: "Available", className: "bg-emerald-100 text-emerald-900" };
  if (!productOk) return { text: "Product inactive", className: "bg-amber-100 text-amber-900" };
  return { text: "Variant inactive", className: "bg-amber-100 text-amber-900" };
}

export function CompanyQuicklistManager({ companyId, initialItems }: Props) {
  const [items, setItems] = useState<CompanyQuicklistItemRow[]>(initialItems);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<QuicklistCatalogSearchRow[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const base = `/admin/api/companies/${companyId}/quicklist-items`;

  const reload = useCallback(async () => {
    const res = await fetch(base, { method: "GET" });
    const data = (await res.json().catch(() => ({}))) as { items?: CompanyQuicklistItemRow[]; error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not load quicklist");
      return;
    }
    setItems(data.items ?? []);
  }, [base]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const t = search.trim();
    if (t.length < 2) {
      setSearchResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setSearchPending(true);
      setErr(null);
      try {
        const res = await fetch(`${base}?q=${encodeURIComponent(t)}`);
        const data = (await res.json().catch(() => ({}))) as { variants?: QuicklistCatalogSearchRow[]; error?: string };
        if (!res.ok) {
          setSearchResults([]);
          setErr(data.error || "Search failed");
          return;
        }
        setSearchResults(data.variants ?? []);
      } finally {
        setSearchPending(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [search, base]);

  async function addVariant(v: QuicklistCatalogSearchRow) {
    setErr(null);
    setMsg(null);
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        catalog_product_id: v.catalog_product_id,
        catalog_variant_id: v.catalog_variant_id,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 409) {
      setErr(data.error || "This variant is already on the quicklist.");
      return;
    }
    if (!res.ok) {
      setErr(data.error || "Could not add variant");
      return;
    }
    setMsg("Added to quicklist.");
    setSearch("");
    setSearchResults([]);
    await reload();
  }

  async function archiveItem(itemId: string) {
    if (!window.confirm("Remove this variant from the customer quicklist?")) return;
    setErr(null);
    setMsg(null);
    const res = await fetch(`${base}/${itemId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not remove");
      return;
    }
    setMsg("Removed from quicklist.");
    await reload();
  }

  async function saveNote(itemId: string, admin_note: string) {
    setErr(null);
    const res = await fetch(`${base}/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_note: admin_note.trim() || null }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not save note");
      return;
    }
    await reload();
  }

  async function saveSort(itemId: string, sort_order: number) {
    setErr(null);
    const res = await fetch(`${base}/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sort_order }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not save order");
      return;
    }
    await reload();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        <strong>Customer glove quicklist</strong> — curated variants this customer is likely to reorder for{" "}
        <strong>quote requests</strong>. Pricing is resolved server-side when quotes are requested; nothing here is a
        price guarantee. This list is separate from procurement reorder memory.
      </p>

      {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div>
        <label htmlFor="ql-search" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Search active catalog (variants only)
        </label>
        <input
          id="ql-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Product name, slug, SKU, or size — pick a variant row to add"
          className="mt-1 w-full max-w-xl rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
        <p className="mt-1 text-xs text-slate-500">
          Results are active catalog products/variants only. You must add a specific variant — no silent default size.
        </p>
        {searchPending ? <p className="mt-2 text-xs text-slate-500">Searching…</p> : null}
        {searchResults.length > 0 ? (
          <TableCard className="mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Brand</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((v) => (
                    <tr key={v.catalog_variant_id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-900">{v.product_name}</td>
                      <td className="px-3 py-2 text-slate-700">{v.brand_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{v.variant_sku}</td>
                      <td className="px-3 py-2 text-slate-700">{v.size_code ?? "—"}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="rounded-md bg-[#f06232] px-2 py-1 text-xs font-semibold text-white hover:bg-[#d8552a]"
                          onClick={() => void addVariant(v)}
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableCard>
        ) : null}
      </div>

      <TableCard>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-600">
            No glove quicklist items yet. Add variants so this customer can request quotes without searching the full
            catalog.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sort</th>
                  <th className="px-3 py-2">Admin note</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const badge = availabilityLabel(row);
                  return (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-900">{row.product_name}</td>
                      <td className="px-3 py-2 text-slate-700">{row.brand_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.variant_sku}</td>
                      <td className="px-3 py-2 text-slate-700">{row.size_code ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          defaultValue={row.sort_order}
                          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-xs"
                          onBlur={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (Number.isNaN(n) || n < 0 || n === row.sort_order) return;
                            void saveSort(row.id, n);
                          }}
                        />
                      </td>
                      <td className="max-w-[200px] px-3 py-2">
                        <textarea
                          key={`${row.id}-${row.updated_at}`}
                          defaultValue={row.admin_note ?? ""}
                          rows={2}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          onBlur={(e) => {
                            const next = e.target.value;
                            const prev = row.admin_note ?? "";
                            if (next.trim() === prev.trim()) return;
                            void saveNote(row.id, next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-red-700 underline"
                          onClick={() => void archiveItem(row.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TableCard>
    </div>
  );
}
