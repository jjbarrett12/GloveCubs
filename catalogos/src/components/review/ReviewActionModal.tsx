"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveMatch,
  rejectStaged,
  createNewMasterProduct,
  mergeWithStaged,
  type ReviewResult,
} from "@/app/actions/review";
import { CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID } from "@/lib/publish/ensure-catalog-v2-link";

interface ReviewActionModalProps {
  normalizedId: string;
  action: "approve" | "reject" | "create_master" | "merge";
  categories?: { id: string; slug: string; name: string }[];
  initialMasterProductId?: string;
  initialName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewActionModal({ normalizedId, action, categories = [], initialMasterProductId = "", initialName = "", onClose, onSuccess }: ReviewActionModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [masterProductId, setMasterProductId] = useState(initialMasterProductId);
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState(initialName);
  const [categoryId, setCategoryId] = useState("");
  const [listPriceUsd, setListPriceUsd] = useState("");
  const [publishToLive, setPublishToLive] = useState(true);
  useEffect(() => {
    if (initialMasterProductId) setMasterProductId(initialMasterProductId);
    if (initialName) setNewName(initialName);
  }, [initialMasterProductId, initialName]);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      let result: ReviewResult;
      if (action === "approve") {
        result = await approveMatch(normalizedId, masterProductId, { publishToLive, publishedBy: "admin" });
      } else if (action === "reject") {
        result = await rejectStaged(normalizedId, notes || undefined);
      } else if (action === "create_master") {
        const listNum = Number(String(listPriceUsd).trim());
        if (!Number.isFinite(listNum) || listNum < 0) {
          setError("List price (USD) is required and must be non-negative.");
          setBusy(false);
          return;
        }
        const list_price_minor = Math.round(listNum * 100);
        if (!Number.isInteger(list_price_minor) || list_price_minor < 0) {
          setError("Invalid list price.");
          setBusy(false);
          return;
        }
        result = await createNewMasterProduct(
          normalizedId,
          {
            sku: newSku,
            name: newName,
            category_id: categoryId,
            product_type_id: CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
            list_price_minor,
          },
          { publishToLive, publishedBy: "admin" }
        );
      } else if (action === "merge") {
        result = await mergeWithStaged(normalizedId, masterProductId, { publishToLive, publishedBy: "admin" });
      } else {
        result = { success: false, error: "Unknown action" };
      }
      if (result.success) {
        if (result.publishError) {
          setError(`Saved, but live publish did not complete: ${result.publishError}`);
          return;
        }
        onSuccess();
      } else setError(result.error ?? "Failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const title =
    action === "approve" ? "Approve match" :
    action === "reject" ? "Reject item" :
    action === "create_master" ? "Create new master product" :
    action === "merge" ? "Merge with master" : "Review";

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {(action === "approve" || action === "create_master" || action === "merge") && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={publishToLive} onChange={(e) => setPublishToLive(e.target.checked)} className="rounded border-border" />
              Publish to live catalog
            </label>
          )}
          {action === "approve" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Master product ID (UUID)</label>
              <Input value={masterProductId} onChange={(e) => setMasterProductId(e.target.value)} placeholder="uuid" className="font-mono text-sm" />
            </div>
          )}
          {action === "reject" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for rejection" />
            </div>
          )}
          {action === "create_master" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">SKU</label>
                <Input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="e.g. GLV-001" required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Product name" required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">List price (USD)</label>
                <Input
                  value={listPriceUsd}
                  onChange={(e) => setListPriceUsd(e.target.value)}
                  placeholder="e.g. 19.99"
                  inputMode="decimal"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Category</label>
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {action === "merge" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Target master product ID (UUID)</label>
              <Input value={masterProductId} onChange={(e) => setMasterProductId(e.target.value)} placeholder="uuid" className="font-mono text-sm" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy || (action === "approve" && !masterProductId) || (action === "create_master" && (!newSku || !newName || !categoryId)) || (action === "merge" && !masterProductId)}>
            {busy ? "…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
