"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuoteStatusAction, markQuoteWonAction, markQuoteLostAction } from "@/app/actions/quotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

const WORKFLOW_STATUSES = ["new", "reviewing", "contacted", "quoted"] as const;
const OUTCOME_STATUSES = ["won", "lost", "expired", "closed"] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon?: React.ReactNode }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-800 border-blue-200" },
  reviewing: { label: "Reviewing", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  contacted: { label: "Contacted", color: "bg-purple-100 text-purple-800 border-purple-200" },
  quoted: { label: "Quoted", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  won: { label: "Won", color: "bg-green-100 text-green-800 border-green-200", icon: <CheckCircle2 className="w-4 h-4" /> },
  lost: { label: "Lost", color: "bg-red-100 text-red-800 border-red-200", icon: <XCircle className="w-4 h-4" /> },
  expired: { label: "Expired", color: "bg-orange-100 text-orange-800 border-orange-200", icon: <Clock className="w-4 h-4" /> },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-800 border-gray-200" },
};

export function QuoteStatusUpdate({ quoteId, currentStatus }: { quoteId: string; currentStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostDialogOpen, setLostDialogOpen] = useState(false);

  const handleStatus = async (status: string) => {
    setBusy(true);
    await updateQuoteStatusAction(quoteId, status);
    setBusy(false);
    router.refresh();
  };

  const handleWon = async () => {
    setBusy(true);
    await markQuoteWonAction(quoteId);
    setBusy(false);
    router.refresh();
  };

  const handleLost = async () => {
    setBusy(true);
    await markQuoteLostAction(quoteId, lostReason || undefined);
    setBusy(false);
    setLostDialogOpen(false);
    setLostReason("");
    router.refresh();
  };

  const isTerminal = ["won", "lost", "expired", "closed"].includes(currentStatus);
  const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.new;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Status</span>
          <Badge className={`${config.color} border font-medium`}>
            {config.icon && <span className="mr-1">{config.icon}</span>}
            {config.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Workflow statuses */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Workflow</Label>
          <div className="flex flex-wrap gap-2">
            {WORKFLOW_STATUSES.map((s) => (
              <Button
                key={s}
                variant={currentStatus === s ? "default" : "outline"}
                size="sm"
                disabled={busy || isTerminal}
                onClick={() => handleStatus(s)}
              >
                {STATUS_CONFIG[s].label}
              </Button>
            ))}
          </div>
        </div>

        {/* Outcome actions */}
        {currentStatus === "quoted" && (
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Outcome</Label>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                disabled={busy}
                onClick={handleWon}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Won
              </Button>
              
              <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Lost
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Mark Quote as Lost</DialogTitle>
                    <DialogDescription>
                      Optionally provide a reason for losing this quote.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="reason">Reason (optional)</Label>
                    <Textarea
                      id="reason"
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value)}
                      placeholder="e.g., Price too high, went with competitor, budget cut..."
                      className="mt-2"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setLostDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleLost} disabled={busy}>
                      Mark as Lost
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {/* Terminal status notice */}
        {isTerminal && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
            <AlertTriangle className="w-4 h-4" />
            <span>This quote is {currentStatus}. Workflow changes are disabled.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
