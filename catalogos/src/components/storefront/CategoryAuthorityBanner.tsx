"use client";

interface CategoryAuthorityBannerProps {
  className?: string;
  text?: string;
}

const DEFAULT_TEXT =
  "Trusted by thousands of restaurants, janitorial companies, auto shops, and tattoo studios.";

export function CategoryAuthorityBanner({
  className = "",
  text = DEFAULT_TEXT,
}: CategoryAuthorityBannerProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground ${className}`}
    >
      {text}
    </div>
  );
}
