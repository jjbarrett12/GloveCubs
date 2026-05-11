"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Trust-aware product image:
 *   - consistent 1:1 aspect, object-contain, neutral background
 *   - graceful "No image" tile when src is null/empty/whitespace
 *   - graceful "No image" tile on load error (never the broken-image icon)
 *
 * Phase 1 stays on plain `<img>` (lazy loading) — Next/Image is intentionally
 * deferred so we don't need a remote-host allowlist for the Phase 1 density
 * push. `loading` defaults to "lazy"; pass "eager" for above-the-fold heroes.
 */

export type ProductImageProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  containerClassName?: string;
  loading?: "lazy" | "eager";
  fallbackLabel?: string;
};

/** Pure helper: returns the trimmed URL, or null when no usable src. */
export function resolveProductImageSrc(src: string | null | undefined): string | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  return trimmed;
}

const FALLBACK_TILE_CLASSES =
  "flex h-full w-full items-center justify-center text-[11px] text-white/35";

const NEUTRAL_CONTAINER_CLASSES =
  "relative aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-black/40";

export function ProductImage({
  src,
  alt,
  className,
  containerClassName,
  loading = "lazy",
  fallbackLabel = "No image",
}: ProductImageProps) {
  const initial = resolveProductImageSrc(src);
  const [errored, setErrored] = React.useState(false);

  React.useEffect(() => {
    setErrored(false);
  }, [initial]);

  const showFallback = initial === null || errored;

  return (
    <div className={cn(NEUTRAL_CONTAINER_CLASSES, containerClassName)}>
      {showFallback ? (
        <div className={FALLBACK_TILE_CLASSES} role="img" aria-label={`${alt} — image not available`}>
          {fallbackLabel}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={initial}
          alt={alt}
          className={cn("h-full w-full object-contain p-2", className)}
          loading={loading}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
