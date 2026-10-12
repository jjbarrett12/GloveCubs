"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export function BrandSearchSelect({
  brands,
  value,
  brandId,
  onChange,
  disabled,
}: {
  brands: { id: string; name: string }[];
  value: string;
  brandId: string | null;
  onChange: (next: { name: string; brandId: string | null }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return brands.slice(0, 12);
    return brands.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 12);
  }, [brands, q]);
  const exact = brands.find((b) => b.name.toLowerCase() === q);

  return (
    <div className="space-y-1.5 relative">
      <label className="text-xs font-medium text-muted-foreground">Brand</label>
      <Input
        className="h-9 text-sm"
        value={value}
        disabled={disabled}
        placeholder="Search or create brand"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const name = e.target.value;
          const match = brands.find((b) => b.name.toLowerCase() === name.trim().toLowerCase());
          onChange({ name, brandId: match?.id ?? null });
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card shadow-sm">
          {matches.map((b) => (
            <button
              key={b.id}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ name: b.name, brandId: b.id });
                setOpen(false);
              }}
            >
              {b.name}
            </button>
          ))}
          {value.trim() && !exact ? (
            <button
              type="button"
              className="block w-full border-t border-border px-3 py-1.5 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ name: value.trim(), brandId: null });
                setOpen(false);
              }}
            >
              Create “{value.trim()}”
            </button>
          ) : null}
          {matches.length === 0 && !value.trim() ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No brands yet — type a name to create one.</p>
          ) : null}
        </div>
      ) : null}
      {brandId ? (
        <p className="text-[10px] text-muted-foreground">Existing catalog brand</p>
      ) : value.trim() ? (
        <p className="text-[10px] text-muted-foreground">New brand name — created when the family is published later</p>
      ) : null}
    </div>
  );
}
