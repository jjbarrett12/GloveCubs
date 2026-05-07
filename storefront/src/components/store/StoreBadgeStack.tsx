import { Badge } from "@/components/ui/badge";

/** Badges from catalog_v2 metadata only — no synthetic sale tags. */
export function StoreBadgeStack({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <div className="absolute left-1.5 top-1.5 z-[1] flex max-w-[calc(100%-0.75rem)] flex-wrap gap-1">
      {labels.map((label) => (
        <Badge
          key={label}
          variant="secondary"
          className="border border-[#f06232]/40 bg-black/55 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-[#f06232] backdrop-blur-sm"
        >
          {label}
        </Badge>
      ))}
    </div>
  );
}
