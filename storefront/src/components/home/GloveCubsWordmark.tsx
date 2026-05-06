import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";

export type GloveCubsWordmarkVariant = "header" | "footer";

/**
 * Vector GLOVECUBS mark (transparent). Header: orange on white; footer: all white on dark.
 */
export function GloveCubsWordmark({
  variant,
  className,
}: {
  variant: GloveCubsWordmarkVariant;
  className?: string;
}) {
  const footer = variant === "footer";
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-0 font-black leading-none tracking-[-0.035em]",
        footer
          ? "text-[1.35rem] text-white sm:text-[1.5rem] lg:text-[1.65rem]"
          : "bg-transparent text-[1.65rem] text-[#FF7A00] [forced-color-adjust:none] sm:text-[1.85rem] lg:text-[2rem]",
        className
      )}
      aria-hidden
    >
      <span>GL</span>
      <span className="relative mx-[0.04em] inline-flex aspect-square h-[0.95em] w-[0.95em] shrink-0 items-center justify-center rounded-full border-[0.09em] border-current bg-transparent">
        <PawPrint
          className={cn("h-[48%] w-[48%]", footer ? "text-white" : "text-neutral-900")}
          strokeWidth={2.25}
          aria-hidden
        />
      </span>
      <span>VECUBS</span>
    </span>
  );
}
