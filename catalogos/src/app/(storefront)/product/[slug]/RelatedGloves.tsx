"use client";

import Link from "next/link";
import type { LiveProductItem } from "@/lib/catalog/types";
import { resolveProductImageUrl } from "@/lib/images";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface RelatedGlovesProps {
  products: LiveProductItem[];
  imageByProductId: Record<string, string>;
  currentProductId: string;
}

export function RelatedGloves({ products, imageByProductId, currentProductId }: RelatedGlovesProps) {
  const list = products.filter((p) => p.id !== currentProductId).slice(0, 4);
  if (list.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-base font-semibold">Related gloves</h2>
      </CardHeader>
      <CardContent>
        <ul className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-4">
          {list.map((item) => {
            const slug = item.slug ?? item.id;
            const img = resolveProductImageUrl(imageByProductId[item.id]);
            return (
              <li key={item.id} className="min-w-0">
                <Link href={`/product/${slug}`} className="block min-w-0 rounded-lg border border-border p-2 hover:bg-muted/50">
                  <div className="aspect-square w-full overflow-hidden rounded bg-muted">
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">{item.name}</p>
                  {item.best_price != null && (
                    <p className="text-xs text-muted-foreground">From ${Number(item.best_price).toFixed(2)}</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
