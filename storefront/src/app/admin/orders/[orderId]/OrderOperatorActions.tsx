"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ADMIN_SETTABLE_ORDER_STATUSES } from "@/lib/admin/admin-order-express-statuses";

type Props = {
  orderId: string;
  currentStatus: string;
  paymentMethod: string | null;
  paymentIntegrityHold: boolean | null;
  invoiceAmountDue: number | null;
  invoiceAmountPaid: number | null;
  trackingNumber: string;
  trackingUrl: string;
};

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function OrderOperatorActions({
  orderId,
  currentStatus,
  paymentMethod,
  paymentIntegrityHold,
  invoiceAmountDue,
  invoiceAmountPaid,
  trackingNumber: initialTrackingNumber,
  trackingUrl: initialTrackingUrl,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = React.useState(currentStatus);
  const [trackingNumber, setTrackingNumber] = React.useState(initialTrackingNumber);
  const [trackingUrl, setTrackingUrl] = React.useState(initialTrackingUrl);
  const [carrier, setCarrier] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [payAmount, setPayAmount] = React.useState("");
  const [payNote, setPayNote] = React.useState("");
  const [mfrId, setMfrId] = React.useState("");

  React.useEffect(() => {
    setStatus(currentStatus);
    setTrackingNumber(initialTrackingNumber);
    setTrackingUrl(initialTrackingUrl);
  }, [currentStatus, initialTrackingNumber, initialTrackingUrl]);

  const isNet30 = String(paymentMethod || "").toLowerCase() === "net30";
  const due = invoiceAmountDue != null ? Number(invoiceAmountDue) : NaN;
  const paid = invoiceAmountPaid != null ? Number(invoiceAmountPaid) : 0;
  const remaining =
    Number.isFinite(due) ? Math.max(0, Math.round((due - paid) * 100) / 100) : null;

  React.useEffect(() => {
    if (remaining != null && payAmount === "") {
      setPayAmount(remaining.toFixed(2));
    }
  }, [remaining, payAmount]);

  async function run(action: string, fn: () => Promise<Response>) {
    setPending(action);
    setMsg(null);
    try {
      const res = await fn();
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
        code?: string;
        message?: string;
        sent?: boolean;
        manufacturers?: { id: number; name?: string; line_count?: number }[];
        blocked_lines?: unknown[];
      };
      if (!res.ok) {
        let text = j.error || j.message || res.statusText || "Request failed";
        if (j.code) text += ` (${j.code})`;
        if (j.manufacturers?.length) {
          text +=
            " — manufacturers: " +
            j.manufacturers.map((m) => `${m.name || "id " + m.id} (${m.line_count ?? 0} lines)`).join(", ");
        }
        if (j.blocked_lines?.length) {
          text += ` — ${j.blocked_lines.length} blocked line(s). See server logs.`;
        }
        setMsg({ kind: "err", text });
        return;
      }
      const okText =
        action === "create_po"
          ? j.sent === true
            ? "Purchase order created and sent to vendor."
            : typeof j.message === "string"
              ? j.message
              : "Purchase order created."
          : action === "invoice_payment"
            ? "Invoice payment recorded."
            : "Order updated.";
      setMsg({ kind: "ok", text: okText });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6 rounded-lg border border-amber-200/80 bg-amber-50/40 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Operator actions</h3>
        <p className="mt-1 text-xs text-slate-600">
          Changes run through the transitional Express admin API (same rules as legacy admin). Refresh after success.
        </p>
        {paymentIntegrityHold ? (
          <p className="mt-2 text-xs font-medium text-amber-900">
            Payment integrity hold is active — shipping and PO creation may be blocked until resolved.
          </p>
        ) : null}
      </div>

      {msg ? (
        <p className={`text-sm ${msg.kind === "ok" ? "text-green-800" : "text-red-700"}`} role="status">
          {msg.text}
        </p>
      ) : null}

      <form
        className="grid max-w-xl gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("update", () =>
            fetch(`/admin/api/orders/${orderId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: status !== currentStatus ? status : undefined,
                tracking_number: trackingNumber,
                tracking_url: trackingUrl,
                carrier: carrier.trim() || undefined,
              }),
            }),
          );
        }}
      >
        <div className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fulfillment</div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Status</label>
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={pending !== null}
          >
            <option value={currentStatus}>{currentStatus} (current)</option>
            {ADMIN_SETTABLE_ORDER_STATUSES.filter((s) => s !== currentStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Carrier (optional)</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            disabled={pending !== null}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Tracking number</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            disabled={pending !== null}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Tracking URL</label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            disabled={pending !== null}
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending !== null}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending === "update" ? "Saving…" : "Save fulfillment"}
          </button>
        </div>
      </form>

      {isNet30 && remaining != null ? (
        <form
          className="max-w-xl space-y-3 border-t border-amber-200/60 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const amount = Number(payAmount);
            if (!Number.isFinite(amount) || amount <= 0) {
              setMsg({ kind: "err", text: "Enter a valid payment amount." });
              return;
            }
            void run("invoice_payment", () =>
              fetch(`/admin/api/orders/${orderId}/invoice-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, note: payNote.trim() || undefined }),
              }),
            );
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net-30 invoice payment</div>
          <p className="text-xs text-slate-600">
            Remaining balance: <strong>{fmtUsd(remaining)}</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">Amount (USD)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                disabled={pending !== null}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Note (optional)</label>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                disabled={pending !== null}
                placeholder="Check #, wire ref…"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={pending !== null}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending === "invoice_payment" ? "Recording…" : "Record payment"}
          </button>
        </form>
      ) : null}

      <div className="border-t border-amber-200/60 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase order</div>
        <p className="mt-1 text-xs text-slate-600">
          Creates a drop-ship PO from this order (Express validation). For multi-manufacturer orders, pass manufacturer id.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Manufacturer id (optional)</label>
            <input
              className="mt-1 w-32 rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={mfrId}
              onChange={(e) => setMfrId(e.target.value)}
              disabled={pending !== null}
              placeholder="e.g. 12"
            />
          </div>
          <button
            type="button"
            disabled={pending !== null}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              const payload: { manufacturer_id?: number } = {};
              const n = parseInt(mfrId.trim(), 10);
              if (mfrId.trim() && Number.isFinite(n) && n > 0) payload.manufacturer_id = n;
              void run("create_po", () =>
                fetch(`/admin/api/orders/${orderId}/create-po`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }),
              );
            }}
          >
            {pending === "create_po" ? "Creating…" : "Create PO"}
          </button>
        </div>
      </div>
    </div>
  );
}
