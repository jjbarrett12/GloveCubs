"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, TableCard } from "@/components/admin";
import { DetailTableShell, adminTableRowHover } from "@/components/admin/DetailTableShell";
import {
  adminFormInput,
  adminFormLabel,
  adminLink,
  adminMutedPanel,
  adminPrimaryButton,
  adminSecondaryButton,
  adminStatusBadgeClasses,
  adminTableCell,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { AdminShipToAddressRow, ShipToAddressJsonV1 } from "@/lib/admin/admin-ship-to-addresses";

type Props = {
  companyId: string;
  initialAddresses: AdminShipToAddressRow[];
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

const fieldInput = cn(adminFormInput, "mt-1 w-full");

export function CompanyShipToAddressesManager({ companyId, initialAddresses }: Props) {
  const [addresses, setAddresses] = useState<AdminShipToAddressRow[]>(initialAddresses);
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const base = `/admin/api/companies/${companyId}/ship-to-addresses`;

  const reload = useCallback(async () => {
    const res = await fetch(base, { method: "GET" });
    const data = (await res.json().catch(() => ({}))) as { addresses?: AdminShipToAddressRow[]; error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not load ship-to addresses");
      return;
    }
    setAddresses(data.addresses ?? []);
  }, [base]);

  useEffect(() => {
    setAddresses(initialAddresses);
  }, [initialAddresses]);

  const visibleRows = useMemo(() => {
    if (showArchived) return addresses;
    return addresses.filter((r) => !r.address.is_archived);
  }, [addresses, showArchived]);

  const archivedCount = useMemo(() => addresses.filter((r) => r.address.is_archived).length, [addresses]);

  function startAdd() {
    setErr(null);
    setMsg(null);
    setEditingId(null);
    setForm(emptyForm());
    setAdding(true);
  }

  function startEdit(row: AdminShipToAddressRow) {
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
    setErr(null);
    setMsg(null);
    setPending(true);
    try {
      const res = await fetch(base, {
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
      setMsg("Ship-to address saved.");
      cancelForm();
      await reload();
    } finally {
      setPending(false);
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setErr(null);
    setMsg(null);
    setPending(true);
    try {
      const res = await fetch(`${base}/${editingId}`, {
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
      setMsg("Ship-to address updated.");
      cancelForm();
      await reload();
    } finally {
      setPending(false);
    }
  }

  async function archiveAddress(id: string) {
    if (!window.confirm("Archive this ship-to address? It will be hidden from default selection.")) return;
    setErr(null);
    setMsg(null);
    const res = await fetch(`${base}/${id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not archive");
      return;
    }
    setMsg("Address archived.");
    await reload();
  }

  async function setDefault(id: string) {
    setErr(null);
    setMsg(null);
    const res = await fetch(`${base}/${id}/set-default`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { addresses?: AdminShipToAddressRow[]; error?: string };
    if (!res.ok) {
      setErr(data.error || "Could not set default");
      return;
    }
    if (data.addresses) setAddresses(data.addresses);
    else await reload();
    setMsg("Default ship-to updated.");
  }

  const formFields = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={adminFormLabel}>
          Label
          <input
            className={fieldInput}
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Main DC"
            maxLength={200}
          />
        </label>
        <label className={adminFormLabel}>
          Country (ISO-2)
          <input
            className={cn(fieldInput, "uppercase")}
            value={form.country_code}
            onChange={(e) => setForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))}
            placeholder="US"
            maxLength={2}
          />
        </label>
      </div>
      <label className={adminFormLabel}>
        Recipient name <span className="text-admin-danger">*</span>
        <input
          className={fieldInput}
          value={form.recipient_name}
          onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))}
          required
        />
      </label>
      <label className={adminFormLabel}>
        Company / attention (optional)
        <input
          className={fieldInput}
          value={form.company_name}
          onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
        />
      </label>
      <label className={adminFormLabel}>
        Address line 1 <span className="text-admin-danger">*</span>
        <input
          className={fieldInput}
          value={form.address_line_1}
          onChange={(e) => setForm((f) => ({ ...f, address_line_1: e.target.value }))}
          required
        />
      </label>
      <label className={adminFormLabel}>
        Address line 2
        <input
          className={fieldInput}
          value={form.address_line_2}
          onChange={(e) => setForm((f) => ({ ...f, address_line_2: e.target.value }))}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={adminFormLabel}>
          City <span className="text-admin-danger">*</span>
          <input
            className={fieldInput}
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            required
          />
        </label>
        <label className={adminFormLabel}>
          Region / state <span className="text-admin-danger">*</span>
          <input
            className={fieldInput}
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            required
          />
        </label>
        <label className={adminFormLabel}>
          Postal code <span className="text-admin-danger">*</span>
          <input
            className={fieldInput}
            value={form.postal_code}
            onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
            required
          />
        </label>
      </div>
      <label className={adminFormLabel}>
        Phone
        <input
          className={fieldInput}
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </label>
      <label className={adminFormLabel}>
        Delivery notes (max 500)
        <textarea
          className={fieldInput}
          value={form.delivery_notes}
          onChange={(e) => setForm((f) => ({ ...f, delivery_notes: e.target.value }))}
          rows={2}
          maxLength={500}
        />
      </label>
    </>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-admin-secondary">
        Ship-to addresses are company-scoped delivery locations. They do not place orders or calculate shipping yet.
        Future quotes and orders will snapshot selected addresses. A future billing profile will handle bill-to
        separately.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-admin-secondary">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived ({archivedCount})
        </label>
        {!adding && !editingId ? (
          <button type="button" onClick={startAdd} className={adminPrimaryButton}>
            Add ship-to address
          </button>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-admin-success">{msg}</p> : null}
      {err ? <p className="text-sm text-admin-danger">{err}</p> : null}

      {(adding || editingId) && (
        <div className={cn(adminMutedPanel, "p-4")}>
          <h4 className="mb-3 text-sm font-semibold text-admin-primary">{adding ? "New ship-to" : "Edit ship-to"}</h4>
          <form onSubmit={adding ? submitCreate : submitEdit} className="space-y-3">
            {formFields}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={pending} className={adminPrimaryButton}>
                {pending ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={cancelForm} className={adminSecondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <TableCard>
        {visibleRows.length === 0 ? (
          <EmptyState
            title="No ship-to addresses"
            description={
              addresses.length > 0 && !showArchived
                ? 'All ship-to addresses are archived. Enable "Show archived" to view or add a new active address.'
                : "Add customer delivery locations before checkout or fulfillment is enabled."
            }
          />
        ) : (
          <DetailTableShell
            headers={[
              { label: "Label" },
              { label: "Recipient" },
              { label: "Address" },
              { label: "Phone" },
              { label: "Notes" },
              { label: "Updated" },
              { label: "Actions" },
            ]}
          >
            {visibleRows.map((row) => {
              const a = row.address;
              const muted = a.is_archived;
              return (
                <tr
                  key={row.id}
                  className={cn(adminTableRowHover, muted && "bg-admin-surface-muted text-admin-muted")}
                >
                  <td className={cn(adminTableCell, "px-3 py-2 align-top")}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{row.label?.trim() || "—"}</span>
                      {row.is_default && !a.is_archived ? (
                        <span
                          className={cn(
                            "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset",
                            adminStatusBadgeClasses("success"),
                          )}
                        >
                          Default
                        </span>
                      ) : null}
                      {a.is_archived ? (
                        <span
                          className={cn(
                            "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset",
                            adminStatusBadgeClasses("neutral"),
                          )}
                        >
                          Archived
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className={cn(adminTableCell, "px-3 py-2 align-top")}>{a.recipient_name}</td>
                  <td className={cn(adminTableCell, "max-w-[280px] px-3 py-2 align-top")}>
                    <div className="break-words">{formatOneLine(a)}</div>
                  </td>
                  <td className={cn(adminTableCell, "px-3 py-2 align-top")}>{a.phone || "—"}</td>
                  <td className={cn(adminTableCell, "max-w-[160px] px-3 py-2 align-top text-xs")}>
                    {a.delivery_notes ? <span className="line-clamp-3">{a.delivery_notes}</span> : "—"}
                  </td>
                  <td className={cn(adminTableCell, "whitespace-nowrap px-3 py-2 align-top text-xs")}>
                    {new Date(row.updated_at).toLocaleString()}
                  </td>
                  <td className={cn(adminTableCell, "whitespace-nowrap px-3 py-2 align-top")}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                      <button type="button" className={cn("text-left text-xs", adminLink)} onClick={() => startEdit(row)}>
                        Edit
                      </button>
                      {!a.is_archived ? (
                        <button
                          type="button"
                          className={cn("text-left text-xs", adminLink)}
                          onClick={() => setDefault(row.id)}
                        >
                          Set default
                        </button>
                      ) : null}
                      {!a.is_archived ? (
                        <button
                          type="button"
                          className="text-left text-xs font-medium text-admin-danger underline"
                          onClick={() => archiveAddress(row.id)}
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DetailTableShell>
        )}
      </TableCard>
    </div>
  );
}
