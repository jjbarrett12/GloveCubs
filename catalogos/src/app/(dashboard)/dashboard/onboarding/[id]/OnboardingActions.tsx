"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setOnboardingStatusAction,
  approveOnboardingAction,
  createSupplierFromOnboardingAction,
  createFeedFromOnboardingAction,
  triggerIngestionForOnboardingAction,
  completeOnboardingAction,
  rejectOnboardingAction,
} from "@/app/actions/onboarding";
import type { SupplierOnboardingRequestRow } from "@/lib/onboarding/types";

interface OnboardingActionsProps {
  request: SupplierOnboardingRequestRow;
}

export function OnboardingActions({ request }: OnboardingActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const run = async (
    fn: () => Promise<{ success: boolean; error?: string }>
  ) => {
    setBusy(true);
    setMessage(null);
    const result = await fn();
    setBusy(false);
    if (result.success) {
      setMessage({ type: "success", text: "Done." });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.error ?? "Failed" });
    }
  };

  const canMarkReady = ["initiated", "waiting_for_supplier"].includes(request.status);
  const canApprove = request.status === "ready_for_review";
  const canCreateSupplier = request.status === "approved" && !request.created_supplier_id;
  const canCreateFeed =
    request.status === "created_supplier" &&
    request.created_supplier_id &&
    !request.created_feed_id &&
    !!request.feed_url?.trim();
  const canTriggerIngestion =
    request.status === "feed_created" &&
    request.created_feed_id;
  const canComplete = request.status === "ingestion_triggered";
  const canReject = !["rejected", "completed"].includes(request.status);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Actions</h2>
      <div className="flex flex-wrap gap-2">
        {canMarkReady && (
          <Button
            variant="default"
            size="sm"
            disabled={busy}
            onClick={() => run(() => setOnboardingStatusAction(request.id, "ready_for_review"))}
          >
            Mark ready for review
          </Button>
        )}
        {canApprove && (
          <Button
            variant="default"
            size="sm"
            disabled={busy}
            onClick={() => run(() => approveOnboardingAction(request.id))}
          >
            Approve
          </Button>
        )}
        {canCreateSupplier && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => createSupplierFromOnboardingAction(request.id))}
          >
            Create supplier
          </Button>
        )}
        {canCreateFeed && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => createFeedFromOnboardingAction(request.id))}
          >
            Create feed
          </Button>
        )}
        {canTriggerIngestion && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => triggerIngestionForOnboardingAction(request.id))}
          >
            Trigger ingestion
          </Button>
        )}
        {canComplete && (
          <Button
            variant="default"
            size="sm"
            disabled={busy}
            onClick={() => run(() => completeOnboardingAction(request.id))}
          >
            Mark completed
          </Button>
        )}
        {canReject && (
          <>
            <Input
              placeholder="Reject reason (optional)"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => run(() => rejectOnboardingAction(request.id, rejectNotes || undefined))}
            >
              Reject
            </Button>
          </>
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

