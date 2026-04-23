"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  resolveDuplicateCandidateAction,
  mergeDuplicatesAction,
} from "@/app/actions/product-matching";

interface DuplicateCandidateActionsProps {
  duplicateId: string;
  status: string;
  productIdA: string;
  productIdB: string;
}

export function DuplicateCandidateActions({
  duplicateId,
  status,
  productIdA,
  productIdB,
}: DuplicateCandidateActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending_review") {
    return <Badge variant="outline">{status}</Badge>;
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
          const r = await mergeDuplicatesAction(productIdA, productIdB);
          setError(r.error ?? null);
          if (r.success) {
            await resolveDuplicateCandidateAction(duplicateId, "merged");
            router.refresh();
          }
          setPending(false);
        }}
      >
        Merge (A←B)
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={async () => {
          setError(null);
          setPending(true);
          const r = await resolveDuplicateCandidateAction(duplicateId, "dismissed");
          setError(r.error ?? null);
          if (r.success) router.refresh();
          setPending(false);
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}
