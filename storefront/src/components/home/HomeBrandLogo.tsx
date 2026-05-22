"use client";

import * as React from "react";
import Link from "next/link";
import { getBrandLogoPath, getBrandLogoSlugPath } from "@/config/homeBrands";
import { cn } from "@/lib/utils";

type HomeBrandLogoProps = {
  brand: string;
  className?: string;
  imgClassName?: string;
  /** When set, wraps the logo in a link (carousel / nav). */
  href?: string;
  title?: string;
};

/** Raster or SVG brand mark with slug fallback and text fallback — never shows a broken image icon. */
export function HomeBrandLogo({ brand, className, imgClassName, href, title }: HomeBrandLogoProps) {
  const primary = getBrandLogoPath(brand);
  const slugSrc = getBrandLogoSlugPath(brand);
  const [src, setSrc] = React.useState(primary);
  const [failed, setFailed] = React.useState(!primary);

  React.useEffect(() => {
    setSrc(primary);
    setFailed(!primary);
  }, [primary, brand]);

  const handleError = () => {
    if (src && slugSrc && src !== slugSrc) {
      setSrc(slugSrc);
      return;
    }
    setFailed(true);
  };

  const inner = failed ? (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center text-center text-xs font-bold leading-tight text-neutral-700",
        className,
      )}
    >
      {brand}
    </span>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src!}
      alt={title ?? brand}
      className={cn("block max-h-full max-w-full object-contain object-center", imgClassName)}
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  );

  if (href) {
    return (
      <Link href={href} className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", className)} title={title ?? brand}>
        {inner}
      </Link>
    );
  }

  return <span className={cn("inline-flex items-center justify-center overflow-hidden", className)}>{inner}</span>;
}
