"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFeedAction } from "@/app/actions/feeds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupplierRow } from "@/lib/catalogos/suppliers";

export function FeedCreateForm({
  suppliers,
  defaultSupplierId,
}: {
  suppliers: SupplierRow[];
  defaultSupplierId?: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [feedType, setFeedType] = useState<"url" | "csv" | "api">("url");
  const [feedUrl, setFeedUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("supplier_id", supplierId);
    formData.set("feed_type", feedType);
    formData.set("feed_url", feedUrl);
    const result = await createFeedAction(formData);
    setPending(false);
    if (result.success) {
      setFeedUrl("");
      router.refresh();
    } else {
      setError(result.error ?? "Failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Supplier</label>
        <select
          name="supplier_id"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
          required
        >
          <option value="">Select supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Feed type</label>
        <select
          name="feed_type"
          value={feedType}
          onChange={(e) => setFeedType(e.target.value as "url" | "csv" | "api")}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
        >
          <option value="url">URL</option>
          <option value="csv">CSV</option>
          <option value="api">API</option>
        </select>
      </div>
      {(feedType === "url" || feedType === "csv") && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Feed URL</label>
          <Input
            name="feed_url"
            type="url"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://example.com/products.csv"
            required={feedType === "url" || feedType === "csv"}
          />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create feed"}
      </Button>
    </form>
  );
}
