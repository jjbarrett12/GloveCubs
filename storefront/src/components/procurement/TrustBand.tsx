import { cn } from "@/lib/utils";

export type TrustBandProps = {
  items: readonly string[];
  variant?: "line" | "grid";
  className?: string;
};

export function TrustBand({ items, variant = "grid", className }: TrustBandProps) {
  if (variant === "line") {
    return (
      <div className={cn("border-y border-border-subtle bg-surface-raised px-6 py-6 text-center md:py-7", className)}>
        <p className="m-0 text-base font-semibold tracking-wide text-white/90 md:text-[17px]">{items[0]}</p>
      </div>
    );
  }

  return (
    <section className={cn("border-y border-border-subtle py-12", className)}>
      <ul className="mx-auto grid max-w-proc gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map((text) => (
          <li
            key={text}
            className="border-l-2 border-brand/50 py-1 pl-4 text-sm font-medium leading-snug text-white/85"
          >
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
