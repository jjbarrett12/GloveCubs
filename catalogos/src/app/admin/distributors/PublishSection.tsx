"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PublishSection() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    published: number;
    approvedCount?: number;
    message?: string;
  } | null>(null);

  async function handlePublish() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/publish-distributor-approved", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      setResult({
        published: data.published ?? 0,
        approvedCount: data.approvedCount,
        message: data.message,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Publish</CardTitle>
        <p className="text-sm text-muted-foreground">
          Publish approved distributor products to the live catalog (uses existing publish pipeline when linked).
        </p>
      </CardHeader>
      <CardContent>
        <Button onClick={handlePublish} disabled={loading}>
          {loading ? "Publishing…" : "Publish Approved Products"}
        </Button>
        {result && (
          <div className="mt-3 text-sm text-muted-foreground">
            <p>Published: {result.published}</p>
            {result.approvedCount != null && (
              <p>Approved in distributor staging: {result.approvedCount}</p>
            )}
            {result.message && <p className="mt-1">{result.message}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
