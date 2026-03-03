"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RecommendResponse } from "@/lib/gloves/types";
import { cn } from "@/lib/utils";
import { ChevronDown, ShoppingCart } from "lucide-react";
import { useState } from "react";

interface RecommendationResultsProps {
  data: RecommendResponse;
  productBySku: Map<string, { name: string; price_cents: number; glove_type?: "disposable" | "reusable"; image_url?: string | null }>;
  filterType: "disposable" | "reusable" | "either";
  onFilterTypeChange: (v: "disposable" | "reusable" | "either") => void;
  className?: string;
}

export function RecommendationResults({
  data,
  productBySku,
  filterType,
  onFilterTypeChange,
  className,
}: RecommendationResultsProps) {
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const top3 = data.recommendations.slice(0, 3);
  const alsoConsider = data.recommendations.slice(3, 9);
  const breakdownBySku = new Map(
    (data.score_breakdown ?? []).map((b) => [b.sku, b.breakdown ?? {}])
  );

  return (
    <div className={cn("space-y-8 overflow-x-hidden min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-white/70">Show:</span>
        {(["either", "disposable", "reusable"] as const).map((t) => (
          <Button
            key={t}
            variant={filterType === t ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterTypeChange(t)}
          >
            {t === "either" ? "All" : t === "disposable" ? "Disposable" : "Reusable"}
          </Button>
        ))}
        {data.confidence_0_1 != null && (
          <Badge variant="secondary" className="ml-2">
            Confidence: {Math.round(data.confidence_0_1 * 100)}%
          </Badge>
        )}
      </div>

      <section>
        <h2 className="text-xl font-semibold text-white mb-4">Top recommendations</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
          {top3
            .filter((rec) => filterType === "either" || rec.glove_type === filterType)
            .map((rec, i) => {
            const product = productBySku.get(rec.sku);
            return (
              <Card key={rec.sku} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge className="mb-2 bg-[hsl(var(--primary))] text-white">
                        Best match {i + 1}
                      </Badge>
                      <CardTitle className="text-white">
                        {product?.name ?? rec.sku}
                      </CardTitle>
                    </div>
                    {product && (
                      <span className="text-lg font-semibold text-white">
                        ${(product.price_cents / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-white/70">{rec.reason}</p>
                  {rec.best_for && (
                    <p className="text-xs text-white/50">Best for: {rec.best_for}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1">
                      <ShoppingCart className="h-4 w-4" />
                      Add to cart
                    </Button>
                    {breakdownBySku.has(rec.sku) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpandedSku(expandedSku === rec.sku ? null : rec.sku)
                        }
                        className="gap-1"
                      >
                        Explain why
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            expandedSku === rec.sku && "rotate-180"
                          )}
                        />
                      </Button>
                    )}
                  </div>
                  {expandedSku === rec.sku && breakdownBySku.has(rec.sku) && (
                    <div className="rounded-lg bg-white/5 p-3 text-xs text-white/80 space-y-1">
                      {Object.entries(breakdownBySku.get(rec.sku)!).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span>{k}</span>
                          <span>{Number(v) > 0 ? `+${v}` : v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {alsoConsider.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Also consider</h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
            {alsoConsider
              .filter((rec) => filterType === "either" || rec.glove_type === filterType)
              .map((rec) => {
              const product = productBySku.get(rec.sku);
              return (
                <Card key={rec.sku} className="overflow-hidden">
                  <CardHeader className="py-3">
                    <CardTitle className="text-base text-white">
                      {product?.name ?? rec.sku}
                    </CardTitle>
                    {product && (
                      <p className="text-sm text-white/60">
                        ${(product.price_cents / 100).toFixed(2)} · Score: {rec.score_0_100}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="py-0 pb-3">
                    <p className="text-xs text-white/60 line-clamp-2 mb-2">{rec.reason}</p>
                    <Button size="sm" variant="outline" className="gap-1">
                      <ShoppingCart className="h-4 w-4" />
                      Add to cart
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {data.alternatives && data.alternatives.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Alternatives</h2>
          <div className="flex flex-wrap gap-4 min-w-0">
            {data.alternatives.map((alt) => (
              <div key={alt.type} className="rounded-xl border border-white/10 bg-white/5 p-4 min-w-[180px]">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
                  {alt.type.replace("_", " ")}
                </p>
                <ul className="text-sm text-white/90 space-y-1">
                  {alt.skus.slice(0, 3).map((sku) => {
                    const p = productBySku.get(sku);
                    return (
                      <li key={sku}>
                        {p?.name ?? sku}
                        {p && (
                          <span className="text-white/50 ml-1">
                            ${(p.price_cents / 100).toFixed(2)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
