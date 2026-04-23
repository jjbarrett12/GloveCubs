"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface BulkQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName?: string;
}

export function BulkQuoteModal({
  open,
  onOpenChange,
  productId,
  productName,
}: BulkQuoteModalProps) {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [boxesPerMonth, setBoxesPerMonth] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/bulk-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          business_name: businessName.trim(),
          email: email.trim(),
          boxes_per_month: boxesPerMonth.trim() ? parseInt(boxesPerMonth, 10) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit");
        return;
      }
      setSent(true);
      setTimeout(() => {
        onOpenChange(false);
        setBusinessName("");
        setEmail("");
        setBoxesPerMonth("");
        setNotes("");
        setSent(false);
      }, 1500);
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request bulk pricing</DialogTitle>
        </DialogHeader>
        {productName && (
          <p className="text-sm text-muted-foreground">Product: {productName}</p>
        )}
        {sent ? (
          <p className="text-sm text-green-600">Thanks! We&apos;ll be in touch soon.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="bulk-business">Business name</Label>
              <Input
                id="bulk-business"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                placeholder="Your company name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="bulk-email">Email</Label>
              <Input
                id="bulk-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="bulk-boxes">Boxes per month</Label>
              <Input
                id="bulk-boxes"
                type="number"
                min={0}
                value={boxesPerMonth}
                onChange={(e) => setBoxesPerMonth(e.target.value)}
                placeholder="e.g. 50"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="bulk-notes">Notes</Label>
              <Textarea
                id="bulk-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Volume, delivery needs, etc."
                rows={3}
                className="mt-1"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending…" : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
