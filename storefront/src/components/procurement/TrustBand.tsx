import { cn } from "@/lib/utils";

export type TrustBandTone = "dark" | "light";

export type TrustBandProps = {
  items: readonly string[];
  variant?: "line" | "grid";
  tone?: TrustBandTone;
  className?: string;
};

export function TrustBand({ items, variant = "grid", tone = "dark", className }: TrustBandProps) {
  const isLight = tone === "light";

  if (variant === "line") {
    return (
      <div
        className={cn(
          "border-y px-6 py-6 text-center md:py-7",
          isLight ? "border-border-light bg-[#fafafa]" : "border-border-subtle bg-surface-raised",
          className
        )}
      >
        <p
          className={cn(
            "m-0 text-base font-semibold tracking-wide md:text-[17px]",
            isLight ? "text-ink" : "text-white/90"
          )}
        >
          {items[0]}
        </p>
      </div>
    );
  }

  return (
    <section className={cn("py-8", isLight ? "" : "border-y border-border-subtle py-12", className)}>
      <ul className="mx-auto grid max-w-proc gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((text) => (
          <li
            key={text}
            className={cn(
              "border-l-2 border-brand/50 py-1 pl-4 text-sm font-medium leading-snug",
              isLight ? "text-text-muted-light" : "text-white/85"
            )}
          >
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
