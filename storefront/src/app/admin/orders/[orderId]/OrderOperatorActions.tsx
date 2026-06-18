"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ADMIN_SETTABLE_ORDER_STATUSES } from "@/lib/admin/admin-order-express-statuses";
import {
  adminAlertSurface,
  adminCardSurface,
  adminFormInput,
  adminFormLabel,
  adminPrimaryButton,
  adminSecondaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

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
    <div className={cn(adminCardSurface, "space-y-6 p-4")}>
      <div>
        <h3 className="text-sm font-semibold text-admin-primary">Operator actions</h3>
        <p className="mt-1 text-xs text-admin-secondary">
          Changes run through the transitional Express admin API (same rules as legacy admin). Refresh after success.
        </p>
        {paymentIntegrityHold ? (
          <p className={cn("mt-2 text-xs font-medium", adminAlertSurface("warning", "inline-block px-2 py-1"))}>
            Payment integrity hold is active — shipping and PO creation may be blocked until resolved.
          </p>
        ) : null}
      </div>

      {msg ? (
        <p
          className={cn("text-sm", msg.kind === "ok" ? "text-admin-success" : "text-admin-danger")}
          role="status"
        >
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
        <div className="text-xs font-semibold uppercase tracking-wide text-admin-muted sm:col-span-2">Fulfillment</div>
        <div>
          <label className={adminFormLabel}>Status</label>
          <select
            className={cn(adminFormInput, "w-full")}
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
          <label className={adminFormLabel}>Carrier (optional)</label>
          <input
            className={cn(adminFormInput, "w-full")}
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            disabled={pending !== null}
          />
        </div>
        <div>
          <label className={adminFormLabel}>Tracking number</label>
          <input
            className={cn(adminFormInput, "w-full")}
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            disabled={pending !== null}
          />
        </div>
        <div>
          <label className={adminFormLabel}>Tracking URL</label>
          <input
            className={cn(adminFormInput, "w-full")}
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            disabled={pending !== null}
          />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending !== null} className={adminPrimaryButton}>
            {pending === "update" ? "Saving…" : "Save fulfillment"}
          </button>
        </div>
      </form>

      {isNet30 && remaining != null ? (
        <form
          className="max-w-xl space-y-3 border-t border-admin-border-subtle pt-4"
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
          <div className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Net-30 invoice payment</div>
          <p className="text-xs text-admin-secondary">
            Remaining balance: <strong className="text-admin-primary">{fmtUsd(remaining)}</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={adminFormLabel}>Amount (USD)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className={cn(adminFormInput, "w-full")}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                disabled={pending !== null}
              />
            </div>
            <div>
              <label className={adminFormLabel}>Note (optional)</label>
              <input
                className={cn(adminFormInput, "w-full")}
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                disabled={pending !== null}
                placeholder="Check #, wire ref…"
              />
            </div>
          </div>
          <button type="submit" disabled={pending !== null} className={adminSecondaryButton}>
            {pending === "invoice_payment" ? "Recording…" : "Record payment"}
          </button>
        </form>
      ) : null}

      <div className="border-t border-admin-border-subtle pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Purchase order</div>
        <p className="mt-1 text-xs text-admin-secondary">
          Creates a drop-ship PO from this order (Express validation). For multi-manufacturer orders, pass manufacturer id.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className={adminFormLabel}>Manufacturer id (optional)</label>
            <input
              className={cn(adminFormInput, "mt-1 w-32")}
              value={mfrId}
              onChange={(e) => setMfrId(e.target.value)}
              disabled={pending !== null}
              placeholder="e.g. 12"
            />
          </div>
          <button
            type="button"
            disabled={pending !== null}
            className={adminSecondaryButton}
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
