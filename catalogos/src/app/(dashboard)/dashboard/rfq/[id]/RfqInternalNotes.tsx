"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuoteInternalNotesAction } from "@/app/actions/quotes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RfqInternalNotes({ quoteId, initialNotes }: { quoteId: string; initialNotes: string | null }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    await updateQuoteInternalNotesAction(quoteId, notes.trim() || null);
    setBusy(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Internal notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Team notes (not visible to buyer)"
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          rows={3}
        />
        <Button size="sm" onClick={handleSave} disabled={busy}>
          {busy ? "Saving…" : "Save notes"}
        </Button>
      </CardContent>
    </Card>
  );
}
