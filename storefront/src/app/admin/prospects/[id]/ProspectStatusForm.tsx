"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  STOREFRONT_ADMIN_PROSPECT_STATUSES,
  type StorefrontAdminProspectStatus,
} from "@/lib/admin/launch-ops-status";
import { adminFormInput, adminPrimaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { updateProspectStatusAction } from "../actions";

type Props = {
  prospectId: number;
  currentStatus: string;
};

export function ProspectStatusForm({ prospectId, currentStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = React.useState<StorefrontAdminProspectStatus>(
    STOREFRONT_ADMIN_PROSPECT_STATUSES.includes(currentStatus as StorefrontAdminProspectStatus)
      ? (currentStatus as StorefrontAdminProspectStatus)
      : "new",
  );
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    const r = await updateProspectStatusAction(prospectId, status);
    if (!r.ok) {
      setMsg(r.error ?? "Update failed");
    } else {
      setMsg("Saved.");
      router.refresh();
    }
    setPending(false);
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-3 border-t border-admin-border-subtle pt-4">
      <label className="block text-xs font-semibold text-admin-muted">
        Staff status
        <select
          className={cn(adminFormInput, "mt-1 w-full max-w-xs")}
          value={status}
          onChange={(e) => setStatus(e.target.value as StorefrontAdminProspectStatus)}
          disabled={pending}
        >
          {STOREFRONT_ADMIN_PROSPECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={adminPrimaryButton}>
        {pending ? "Saving…" : "Update status"}
      </button>
      {msg ? (
        <p className={cn("text-xs", msg === "Saved." ? "text-admin-success" : "text-admin-danger")}>{msg}</p>
      ) : null}
    </form>
  );
}
