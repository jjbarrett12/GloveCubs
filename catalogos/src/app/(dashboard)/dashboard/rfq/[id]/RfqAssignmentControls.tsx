"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateQuoteAssignmentAction,
  updateQuotePriorityAction,
  updateQuoteDueByAction,
} from "@/app/actions/quotes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export function RfqAssignmentControls({
  quoteId,
  assignedTo,
  priority,
  dueBy,
}: {
  quoteId: string;
  assignedTo: string | null;
  priority: string;
  dueBy: string | null;
}) {
  const router = useRouter();
  const [assignee, setAssignee] = useState(assignedTo ?? "");
  const [assignBusy, setAssignBusy] = useState(false);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [dueBusy, setDueBusy] = useState(false);

  const dueDateValue = dueBy ? new Date(dueBy).toISOString().slice(0, 16) : "";

  const handleAssign = async () => {
    setAssignBusy(true);
    await updateQuoteAssignmentAction(quoteId, assignee.trim() || null);
    setAssignBusy(false);
    router.refresh();
  };

  const handlePriority = async (p: string) => {
    setPriorityBusy(true);
    await updateQuotePriorityAction(quoteId, p);
    setPriorityBusy(false);
    router.refresh();
  };

  const handleDueBy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.querySelector<HTMLInputElement>('input[name="due_by"]');
    const value = input?.value ? new Date(input.value).toISOString() : null;
    setDueBusy(true);
    await updateQuoteDueByAction(quoteId, value);
    setDueBusy(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Assignment & priority</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="assigned_to" className="text-xs">Assigned to</Label>
            <Input
              id="assigned_to"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Email or user id"
              className="text-sm"
            />
          </div>
          <Button size="sm" onClick={handleAssign} disabled={assignBusy}>
            {assignBusy ? "Saving…" : "Save"}
          </Button>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Priority</span>
          <div className="flex gap-1 mt-1">
            {PRIORITIES.map((p) => (
              <Button
                key={p}
                variant={priority === p ? "default" : "outline"}
                size="sm"
                disabled={priorityBusy}
                onClick={() => handlePriority(p)}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        <form onSubmit={handleDueBy} className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <label htmlFor="due_by" className="text-xs text-muted-foreground block">Due by</label>
            <Input
              id="due_by"
              name="due_by"
              type="datetime-local"
              defaultValue={dueDateValue}
              className="text-sm"
            />
          </div>
          <Button type="submit" size="sm" disabled={dueBusy}>
            {dueBusy ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
