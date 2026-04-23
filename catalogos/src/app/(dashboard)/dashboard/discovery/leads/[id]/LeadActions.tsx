"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markLeadReviewed, rejectLead, promoteToSupplier } from "@/app/actions/discovery";
import type { LeadStatus } from "@/lib/discovery/types";

interface LeadActionsProps {
  leadId: string;
  status: LeadStatus;
  promotedSupplierId: string | null;
}

export function LeadActions({ leadId, status, promotedSupplierId }: LeadActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handle = async (
    fn: () => Promise<{ success: boolean; error?: string; supplierId?: string }>
  ) => {
    setBusy(true);
    setMessage(null);
    const result = await fn();
    setBusy(false);
    if (result.success) {
      setMessage({ type: "success", text: promotedSupplierId ? "Supplier link updated." : "Done." });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.error ?? "Failed" });
    }
  };

  const canReview = status === "new";
  const canReject = status !== "rejected" && status !== "onboarded";
  const canPromote = status !== "rejected" && status !== "onboarded" && !promotedSupplierId;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Actions</h2>
      <div className="flex flex-wrap gap-2">
        {canReview && (
          <Button
            variant="default"
            size="sm"
            disabled={busy}
            onClick={() => handle(() => markLeadReviewed(leadId))}
          >
            Mark reviewed
          </Button>
        )}
        {canReject && (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => handle(() => rejectLead(leadId))}
          >
            Reject
          </Button>
        )}
        {canPromote && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => handle(() => promoteToSupplier(leadId))}
          >
            Promote to supplier
          </Button>
        )}
      </div>
      {message && (
        <p className={message.type === "success" ? "text-green-600 text-sm" : "text-destructive text-sm"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
