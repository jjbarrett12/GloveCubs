"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requestMoreInfoOnboardingAction } from "@/app/actions/onboarding";

export function RequestMoreInfoCard({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const canRequest = ["initiated", "ready_for_review"].includes(status);

  if (!canRequest) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    const result = await requestMoreInfoOnboardingAction(requestId, notes);
    setBusy(false);
    if (result.success) {
      setMessage({ type: "success", text: "Status set to waiting for supplier. They can use their link to respond." });
      setNotes("");
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.error ?? "Failed" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Request more information</CardTitle>
        <p className="text-sm text-muted-foreground">
          Set status to &quot;waiting for supplier&quot; and add a note. The supplier can return via their link to update details or upload files.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What information do you need? (e.g. feed URL, catalog PDF, pricing basis)"
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            rows={3}
          />
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Sending…" : "Request more info"}
          </Button>
        </form>
        {message && (
          <p className={`mt-2 text-sm ${message.type === "success" ? "text-green-600" : "text-destructive"}`}>
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
