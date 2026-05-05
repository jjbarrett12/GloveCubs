"use client";

import type { StoreProductRow } from "@/lib/catalog/store-products";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddToQuoteButton } from "./AddToQuoteButton";

export function StoreGrid({ products }: { products: StoreProductRow[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((p) => (
        <Card key={p.id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col">
          <div className="aspect-[4/3] bg-white/5 relative shrink-0">
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-contain p-3"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs">
                No image
              </div>
            )}
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base line-clamp-2">{p.name}</CardTitle>
            <CardDescription className="text-white/70">{p.brandName ?? "—"}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 mt-auto">
            <AddToQuoteButton product={p} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
