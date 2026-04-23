"use client";

import { useState } from "react";
import { resolveProductImageUrl } from "@/lib/images";

interface ProductImageGalleryProps {
  urls: string[];
  productName: string;
}

export function ProductImageGallery({ urls, productName }: ProductImageGalleryProps) {
  const resolved = urls.map((u) => resolveProductImageUrl(u)).filter(Boolean);
  const [idx, setIdx] = useState(0);
  if (resolved.length === 0) return null;
  const main = resolved[idx] ?? resolved[0]!;

  return (
    <div className="space-y-3">
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted">
        <img
          src={main}
          alt={productName}
          className="h-full w-full object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </div>
      {resolved.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]" role="list">
          {resolved.map((url, i) => (
            <li key={i} className="shrink-0">
              <button
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Show image ${i + 1} of ${resolved.length}`}
                aria-pressed={i === idx}
                className={`h-16 w-16 overflow-hidden rounded-md border-2 transition-colors sm:h-20 sm:w-20 ${
                  i === idx ? "border-primary ring-1 ring-primary/20" : "border-border opacity-90 hover:opacity-100"
                }`}
              >
                <img src={url} alt="" className="h-full w-full object-cover" width={80} height={80} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
