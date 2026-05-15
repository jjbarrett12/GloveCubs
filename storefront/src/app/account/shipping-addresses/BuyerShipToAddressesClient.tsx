"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminShipToAddressRow, ShipToAddressJsonV1 } from "@/lib/admin/admin-ship-to-addresses";

const API_BASE = "/api/account/shipping-addresses";

type Props = {
  initialAddresses: AdminShipToAddressRow[];
  canMutate: boolean;
};

function formatOneLine(a: ShipToAddressJsonV1): string {
  const p2 = a.address_line_2 ? `, ${a.address_line_2}` : "";
  return `${a.address_line_1}${p2}, ${a.city}, ${a.region} ${a.postal_code}, ${a.country_code}`;
}

function emptyForm(): Record<string, string> {
  return {
    label: "",
    recipient_name: "",
    company_name: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    region: "",
    postal_code: "",
    country_code: "US",
    phone: "",
    delivery_notes: "",
  };
}

function rowToForm(row: AdminShipToAddressRow): Record<string, string> {
  const a = row.address;
  return {
    label: row.label ?? "",
    recipient_name: a.recipient_name,
    company_name: a.company_name ?? "",
    address_line_1: a.address_line_1,
    address_line_2: a.address_line_2 ?? "",
    city: a.city,
    region: a.region,
    postal_code: a.postal_code,
    country_code: a.country_code,
    phone: a.phone ?? "",
    delivery_notes: a.delivery_notes ?? "",
  };
}

export function BuyerShipToAddressesClient({ initialAddresses, canMutate }: Props) {
  const [addresses, setAddresses] = useState<AdminShipToAddressRow[]>(initialAddresses);
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(API_BASE, { method: "GET" });
    const data = (await res.json().catch(() => ({}))) as { addresses?: AdminShipToAddressRow[]; error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not load shipping addresses");
      return;
    }
    setAddresses(data.addresses ?? []);
  }, []);

  useEffect(() => {
    setAddresses(initialAddresses);
  }, [initialAddresses]);

  const visibleRows = useMemo(() => {
    if (showArchived) return addresses;
    return addresses.filter((r) => !r.address.is_archived);
  }, [addresses, showArchived]);

  const archivedCount = useMemo(() => addresses.filter((r) => r.address.is_archived).length, [addresses]);

  function startAdd() {
    if (!canMutate) return;
    setErr(null);
    setMsg(null);
    setEditingId(null);
    setForm(emptyForm());
    setAdding(true);
  }

  function startEdit(row: AdminShipToAddressRow) {
    if (!canMutate) return;
    setErr(null);
    setMsg(null);
    setAdding(false);
    setEditingId(row.id);
    setForm(rowToForm(row));
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!canMutate) return;
    setErr(null);
    setMsg(null);
    setPending(true);
    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim() || null,
          recipient_name: form.recipient_name,
          company_name: form.company_name.trim() || null,
          address_line_1: form.address_line_1,
          address_line_2: form.address_line_2.trim() || null,
          city: form.city,
          region: form.region,
          postal_code: form.postal_code,
          country_code: form.country_code.trim() || "US",
          phone: form.phone.trim() || null,
          delivery_notes: form.delivery_notes.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error || "Could not create address");
        return;
      }
      setMsg("Address saved.");
      cancelForm();
      await reload();
    } finally {
      setPending(false);
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!canMutate || !editingId) return;
    setErr(null);
    setMsg(null);
    setPending(true);
    try {
      const res = await fetch(`${API_BASE}/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim() || null,
          recipient_name: form.recipient_name,
          company_name: form.company_name.trim() || null,
          address_line_1: form.address_line_1,
          address_line_2: form.address_line_2.trim() || null,
          city: form.city,
          region: form.region,
          postal_code: form.postal_code,
          country_code: form.country_code.trim() || "US",
          phone: form.phone.trim() || null,
          delivery_notes: form.delivery_notes.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error || "Could not update address");
        return;
      }
      setMsg("Address updated.");
      cancelForm();
      await reload();
    } finally {
      setPending(false);
    }
  }

  async function archiveAddress(id: string) {
    if (!canMutate) return;
    if (!window.confirm("Archive this address? It will no longer appear in your active list.")) return;
    setErr(null);
    setMsg(null);
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not archive");
      return;
    }
    setMsg("Address archived.");
    await reload();
  }

  async function setDefault(id: string) {
    if (!canMutate) return;
    setErr(null);
    setMsg(null);
    const res = await fetch(`${API_BASE}/${id}/set-default`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { addresses?: AdminShipToAddressRow[]; error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not set default");
      return;
    }
    if (data.addresses) setAddresses(data.addresses);
    else await reload();
    setMsg("Default address updated.");
  }

  const formFields = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-white/70">
          Label
          <input
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Main DC"
            maxLength={200}
          />
        </label>
        <label className="block text-xs font-medium text-white/70">
          Country (ISO-2)
          <input
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm uppercase text-white placeholder:text-white/30"
            value={form.country_code}
            onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))}
            placeholder="US"
            maxLength={2}
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-white/70">
        Recipient name <span className="text-red-400">*</span>
        <input
          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
          value={form.recipient_name}
          onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))}
          required
        />
      </label>
      <label className="block text-xs font-medium text-white/70">
        Company / attention (optional)
        <input
          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
          value={form.company_name}
          onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
        />
      </label>
      <label className="block text-xs font-medium text-white/70">
        Address line 1 <span className="text-red-400">*</span>
        <input
          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
          value={form.address_line_1}
          onChange={(e) => setForm((f) => ({ ...f, address_line_1: e.target.value }))}
          required
        />
      </label>
      <label className="block text-xs font-medium text-white/70">
        Address line 2
        <input
          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
          value={form.address_line_2}
          onChange={(e) => setForm((f) => ({ ...f, address_line_2: e.target.value }))}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-white/70">
          City <span className="text-red-400">*</span>
          <input
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            required
          />
        </label>
        <label className="block text-xs font-medium text-white/70">
          Region / state <span className="text-red-400">*</span>
          <input
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            required
          />
        </label>
        <label className="block text-xs font-medium text-white/70">
          Postal code <span className="text-red-400">*</span>
          <input
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
            value={form.postal_code}
            onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
            required
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-white/70">
        Phone
        <input
          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </label>
      <label className="block text-xs font-medium text-white/70">
        Delivery notes (max 500)
        <textarea
          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
          value={form.delivery_notes}
          onChange={(e) => setForm((f) => ({ ...f, delivery_notes: e.target.value }))}
          rows={2}
          maxLength={500}
        />
      </label>
    </div>
  );

  return (
    <div className="mt-6 space-y-4">
      {!canMutate ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Your role can view shipping addresses but cannot change them.
        </p>
      ) : null}

      <p className="text-sm text-white/60">
        Saved addresses are for your company&apos;s records. Managing them here does not start a quote request or
        create an order record by itself.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/75">
          <input
            type="checkbox"
            className="rounded border-white/30 bg-black/40"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived ({archivedCount})
        </label>
        {canMutate && !adding && !editingId ? (
          <button
            type="button"
            onClick={startAdd}
            className="rounded-lg bg-[#f06232] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#d95528]"
          >
            Add address
          </button>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      {(adding || editingId) && canMutate ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <h4 className="mb-3 text-sm font-semibold text-white">{adding ? "New address" : "Edit address"}</h4>
          <form onSubmit={adding ? submitCreate : submitEdit} className="space-y-3">
            {formFields}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-white/90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/85 hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-white/10">
        {visibleRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-white/50">
            {addresses.length > 0 && !showArchived
              ? "All addresses are archived. Turn on “Show archived” to view them or add a new active address."
              : "No addresses yet. Add a delivery location your team can reuse."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs font-semibold uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2">Updated</th>
                  {canMutate ? <th className="px-3 py-2">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const a = row.address;
                  const muted = a.is_archived;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-white/10 last:border-0 ${muted ? "bg-white/[0.02] text-white/50" : "text-white/85"}`}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-white">{row.label?.trim() || "—"}</span>
                          {row.is_default && !a.is_archived ? (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
                              Default
                            </span>
                          ) : null}
                          {a.is_archived ? (
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/55">
                              Archived
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">{a.recipient_name}</td>
                      <td className="max-w-[280px] px-3 py-2 align-top">
                        <div className="break-words">{formatOneLine(a)}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-white/60">{a.phone || "—"}</td>
                      <td className="max-w-[160px] px-3 py-2 align-top text-xs text-white/55">
                        {a.delivery_notes ? <span className="line-clamp-3">{a.delivery_notes}</span> : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-white/45">
                        {new Date(row.updated_at).toLocaleString()}
                      </td>
                      {canMutate ? (
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                            <button
                              type="button"
                              className="text-left text-xs font-medium text-[#f06232] underline"
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </button>
                            {!a.is_archived ? (
                              <button
                                type="button"
                                className="text-left text-xs font-medium text-white/80 underline"
                                onClick={() => setDefault(row.id)}
                              >
                                Set default
                              </button>
                            ) : null}
                            {!a.is_archived ? (
                              <button
                                type="button"
                                className="text-left text-xs font-medium text-red-300 underline"
                                onClick={() => archiveAddress(row.id)}
                              >
                                Archive
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
