"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveMatch, rejectStaged } from "@/app/actions/review";

interface MatchCandidateActionsProps {
  normalizedId: string;
  suggestedMasterId: string | null;
  requiresReview: boolean;
}

export function MatchCandidateActions({
  normalizedId,
  suggestedMasterId,
  requiresReview,
}: MatchCandidateActionsProps) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 shrink-0 flex-wrap">
      <Link
        href={`/dashboard/review?normalized_id=${normalizedId}`}
        className="text-xs text-primary hover:underline"
      >
        Review
      </Link>
      {suggestedMasterId && requiresReview && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              const r = await approveMatch(normalizedId, suggestedMasterId);
              if (r.success) router.refresh();
            }}
          >
            Approve match
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={async () => {
              const r = await rejectStaged(normalizedId);
              if (r.success) router.refresh();
            }}
          >
            Reject
          </Button>
        </>
      )}
      {!suggestedMasterId && (
        <Link href={`/dashboard/review?normalized_id=${normalizedId}`}>
          <Button type="button" size="sm" variant="secondary">
            Create new master
          </Button>
        </Link>
      )}
    </div>
  );
}
