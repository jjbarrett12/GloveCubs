"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { adminPrimaryButton, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Props = {
  poId: number;
  status: string;
  canReceive: boolean;
};

export function PoRowActions({ poId, status, canReceive }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"send" | "receive" | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const sent = status === "sent" || status === "received";

  async function run(action: "send" | "receive") {
    setPending(action);
    setMsg(null);
    try {
      const path =
        action === "send"
          ? `/admin/api/purchase-orders/${poId}/send`
          : `/admin/api/purchase-orders/${poId}/receive`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "receive" ? JSON.stringify({}) : "{}",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string; message?: string };
      if (!res.ok) {
        const text = j.error ? (j.code ? `${j.error} (${j.code})` : j.error) : res.statusText;
        setMsg(text);
        return;
      }
      setMsg(action === "send" ? "PO sent to vendor." : "PO received into stock.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {!sent ? (
          <button type="button" disabled={pending !== null} onClick={() => void run("send")} className={adminPrimaryButton}>
            {pending === "send" ? "Sending…" : "Send"}
          </button>
        ) : null}
        {canReceive ? (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void run("receive")}
            className={adminSecondaryButton}
          >
            {pending === "receive" ? "Receiving…" : "Receive full qty"}
          </button>
        ) : null}
      </div>
      {msg ? (
        <span
          className={cn(
            "text-xs",
            msg.includes("sent") || msg.includes("received") ? "text-admin-success" : "text-admin-danger",
          )}
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
}
