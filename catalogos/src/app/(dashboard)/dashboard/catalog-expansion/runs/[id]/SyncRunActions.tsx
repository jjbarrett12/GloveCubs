"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  resolveSyncItemResultAction,
  approveAndPromoteSyncItemAction,
  updateDiscontinuedCandidateAction,
} from "@/app/actions/catalog-expansion";

interface ItemResultActionsProps {
  itemResultId: string;
  resolvedAt: string | null;
  resolution: string | null;
  resultType?: string;
  promotionStatus?: string | null;
  promotedNormalizedId?: string | null;
  lifecycleStatus?: string | null;
  supersededBySyncItemResultId?: string | null;
}

interface DiscontinuedActionsProps {
  discontinuedId: string;
  discontinuedStatus: string;
  externalId: string;
}

type Props = (ItemResultActionsProps | DiscontinuedActionsProps) & {
  discontinuedId?: string;
  discontinuedStatus?: string;
  externalId?: string;
  itemResultId?: string;
  resolvedAt?: string | null;
  resolution?: string | null;
};

function isItemResult(p: Props): p is ItemResultActionsProps {
  return "itemResultId" in p && p.itemResultId != null;
}

function isDiscontinued(p: Props): p is DiscontinuedActionsProps {
  return "discontinuedId" in p && p.discontinuedId != null;
}

export function SyncRunActions(props: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isItemResult(props)) {
    const { itemResultId, resolvedAt, resolution, resultType, promotionStatus, promotedNormalizedId, lifecycleStatus, supersededBySyncItemResultId } = props;
    const canPromote = resultType === "new" || resultType === "changed";
    const isPromoted = promotionStatus === "promoted" && promotedNormalizedId;
    const isSuperseded = lifecycleStatus === "superseded";

    if (isSuperseded) {
      return (
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="secondary">Superseded</Badge>
          <Link href="/dashboard/catalog-expansion" className="text-xs text-muted-foreground hover:underline">
            Sync runs →
          </Link>
        </div>
      );
    }
    if (isPromoted) {
      return (
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline">Promoted</Badge>
          <Link href={`/dashboard/review?normalized_id=${promotedNormalizedId}`} className="text-xs text-primary hover:underline">
            Review →
          </Link>
        </div>
      );
    }
    if (resolvedAt != null && !canPromote) {
      return (
        <Badge variant="outline">{resolution === "approved" ? "Approved" : "Rejected"}</Badge>
      );
    }
    return (
      <div className="flex items-center gap-1 shrink-0">
        {error && <span className="text-xs text-destructive">{error}</span>}
        {canPromote && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setError(null);
              setPending(true);
              const r = await approveAndPromoteSyncItemAction(itemResultId);
              setError(r.error ?? null);
              setPending(false);
              router.refresh();
            }}
          >
            Approve & promote
          </Button>
        )}
        {!canPromote && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setError(null);
              setPending(true);
              const r = await resolveSyncItemResultAction(itemResultId, "approved");
              setError(r.error ?? null);
              setPending(false);
              router.refresh();
            }}
          >
            Approve
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={async () => {
            setError(null);
            setPending(true);
            const r = await resolveSyncItemResultAction(itemResultId, "rejected");
            setError(r.error ?? null);
            setPending(false);
            router.refresh();
          }}
        >
          Reject
        </Button>
      </div>
    );
  }

  if (isDiscontinued(props)) {
    const { discontinuedId, discontinuedStatus } = props;
    if (discontinuedStatus !== "pending_review") {
      return <Badge variant="outline">{discontinuedStatus}</Badge>;
    }
    return (
      <div className="flex items-center gap-1 shrink-0">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={async () => {
            setError(null);
            setPending(true);
            const r = await updateDiscontinuedCandidateAction(discontinuedId, "confirmed_discontinued");
            setError(r.error ?? null);
            setPending(false);
            router.refresh();
          }}
        >
          Mark discontinued
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={async () => {
            setError(null);
            setPending(true);
            const r = await updateDiscontinuedCandidateAction(discontinuedId, "false_positive");
            setError(r.error ?? null);
            setPending(false);
            router.refresh();
          }}
        >
          False positive
        </Button>
      </div>
    );
  }

  return null;
}
