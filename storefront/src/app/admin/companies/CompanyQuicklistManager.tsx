"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, TableCard } from "@/components/admin";
import { DetailTableShell, adminTableRowHover } from "@/components/admin/DetailTableShell";
import {
  adminFormInput,
  adminFormLabel,
  adminLink,
  adminPrimaryButton,
  adminStatusBadgeClasses,
  adminStatusTone,
  adminTableCell,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { CompanyQuicklistItemRow, QuicklistCatalogSearchRow } from "@/lib/admin/admin-company-quicklist";

type Props = {
  companyId: string;
  initialItems: CompanyQuicklistItemRow[];
};

function availabilityStatus(row: CompanyQuicklistItemRow): string {
  const productOk = row.product_status === "active";
  const variantOk = row.variant_is_active;
  if (productOk && variantOk) return "active";
  return "warning";
}

function availabilityText(row: CompanyQuicklistItemRow): string {
  const productOk = row.product_status === "active";
  const variantOk = row.variant_is_active;
  if (productOk && variantOk) return "Available";
  if (!productOk) return "Product inactive";
  return "Variant inactive";
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
      <p className="text-sm text-admin-secondary">
        <strong className="text-admin-primary">Customer glove quicklist</strong> — curated variants this customer is
        likely to reorder for <strong className="text-admin-primary">quote requests</strong>. Pricing is resolved
        server-side when quotes are requested; nothing here is a price guarantee. This list is separate from procurement
        reorder memory.
      </p>

      {msg ? <p className="text-sm text-admin-success">{msg}</p> : null}
      {err ? <p className="text-sm text-admin-danger">{err}</p> : null}

      <div>
        <label htmlFor="ql-search" className={adminFormLabel}>
          Search active catalog (variants only)
        </label>
        <input
          id="ql-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Product name, slug, SKU, or size — pick a variant row to add"
          className={cn(adminFormInput, "mt-1 w-full max-w-xl")}
        />
        <p className="mt-1 text-xs text-admin-muted">
          Results are active catalog products/variants only. You must add a specific variant — no silent default size.
        </p>
        {searchPending ? <p className="mt-2 text-xs text-admin-muted">Searching…</p> : null}
        {searchResults.length > 0 ? (
          <TableCard className="mt-3">
            <DetailTableShell
              headers={[
                { label: "Product" },
                { label: "Brand" },
                { label: "SKU" },
                { label: "Size" },
                { label: "" },
              ]}
            >
              {searchResults.map((v) => (
                <tr key={v.catalog_variant_id} className={adminTableRowHover}>
                  <td className={cn(adminTableCell, "px-3 py-2")}>{v.product_name}</td>
                  <td className={cn(adminTableCell, "px-3 py-2")}>{v.brand_name ?? "—"}</td>
                  <td className={cn(adminTableCell, "px-3 py-2 font-mono text-xs")}>{v.variant_sku}</td>
                  <td className={cn(adminTableCell, "px-3 py-2")}>{v.size_code ?? "—"}</td>
                  <td className={cn(adminTableCell, "px-3 py-2")}>
                    <button type="button" className={adminPrimaryButton} onClick={() => void addVariant(v)}>
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </DetailTableShell>
          </TableCard>
        ) : null}
      </div>

      <TableCard>
        {items.length === 0 ? (
          <EmptyState
            title="No glove quicklist items yet"
            description="Add variants so this customer can request quotes without searching the full catalog."
          />
        ) : (
          <DetailTableShell
            headers={[
              { label: "Product" },
              { label: "Brand" },
              { label: "SKU" },
              { label: "Size" },
              { label: "Status" },
              { label: "Sort" },
              { label: "Admin note" },
              { label: "" },
            ]}
          >
            {items.map((row) => (
              <tr key={row.id} className={adminTableRowHover}>
                <td className={cn(adminTableCell, "px-3 py-2 font-medium")}>{row.product_name}</td>
                <td className={cn(adminTableCell, "px-3 py-2")}>{row.brand_name ?? "—"}</td>
                <td className={cn(adminTableCell, "px-3 py-2 font-mono text-xs")}>{row.variant_sku}</td>
                <td className={cn(adminTableCell, "px-3 py-2")}>{row.size_code ?? "—"}</td>
                <td className={cn(adminTableCell, "px-3 py-2")}>
                  <span
                    className={cn(
                      "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                      adminStatusBadgeClasses(adminStatusTone(availabilityStatus(row))),
                    )}
                  >
                    {availabilityText(row)}
                  </span>
                </td>
                <td className={cn(adminTableCell, "px-3 py-2")}>
                  <input
                    type="number"
                    min={0}
                    defaultValue={row.sort_order}
                    className={cn(adminFormInput, "w-16 px-1 py-0.5 text-xs")}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isNaN(n) || n < 0 || n === row.sort_order) return;
                      void saveSort(row.id, n);
                    }}
                  />
                </td>
                <td className={cn(adminTableCell, "max-w-[200px] px-3 py-2")}>
                  <textarea
                    key={`${row.id}-${row.updated_at}`}
                    defaultValue={row.admin_note ?? ""}
                    rows={2}
                    className={cn(adminFormInput, "w-full px-2 py-1 text-xs")}
                    onBlur={(e) => {
                      const next = e.target.value;
                      const prev = row.admin_note ?? "";
                      if (next.trim() === prev.trim()) return;
                      void saveNote(row.id, next);
                    }}
                  />
                </td>
                <td className={cn(adminTableCell, "px-3 py-2")}>
                  <button
                    type="button"
                    className="text-xs font-medium text-admin-danger underline"
                    onClick={() => void archiveItem(row.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </DetailTableShell>
        )}
      </TableCard>
    </div>
  );
}
