"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { adminPrimaryButton, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Props = {
  poId: number;
  status: string;
  canReceive: boolean;
  purchaseOrderType: string;
};

export function PoRowActions({ poId, status, canReceive, purchaseOrderType }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const sent = status === "sent" || status === "received" || status === "partially_received";

  async function sendPo() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch(`/admin/api/purchase-orders/${poId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setMsg(j.error ? (j.code ? `${j.error} (${j.code})` : j.error) : res.statusText);
        return;
      }
      setMsg("PO sent to vendor.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {!sent ? (
          <button type="button" disabled={pending} onClick={() => void sendPo()} className={adminPrimaryButton}>
            {pending ? "Sending…" : "Send"}
          </button>
        ) : null}
        {canReceive && purchaseOrderType === "inbound_stock" ? (
          <Link href={`/admin/purchase-orders/${poId}/receive`} className={adminSecondaryButton}>
            Receive warehouse shipment
          </Link>
        ) : null}
      </div>
      {msg ? (
        <span
          className={cn(
            "text-xs",
            msg.includes("sent") ? "text-admin-success" : "text-admin-danger",
          )}
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
}
