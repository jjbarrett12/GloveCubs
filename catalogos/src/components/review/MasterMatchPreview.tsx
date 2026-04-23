import Link from "next/link";

interface MasterMatchPreviewProps {
  masterProductId: string;
  sku?: string;
  name?: string;
}

export function MasterMatchPreview({ masterProductId, sku, name }: MasterMatchPreviewProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Proposed master product</p>
      <p className="font-mono text-sm">{sku ?? "—"}</p>
      <p className="text-sm font-medium mt-0.5">{name ?? "—"}</p>
      <Link href={`/dashboard/master-products?highlight=${masterProductId}`} className="text-xs text-primary hover:underline mt-2 inline-block">
        View in Master catalog →
      </Link>
    </div>
  );
}
