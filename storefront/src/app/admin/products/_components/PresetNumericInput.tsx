"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  adminFormInput,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";

type Props = {
  label: string;
  value: number | null;
  presets: number[];
  onChange: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  blocking?: boolean;
  hint?: string | null;
};

export function PresetNumericInput({
  label,
  value,
  presets,
  onChange,
  disabled,
  className,
  compact,
  blocking,
  hint,
}: Props) {
  const [customMode, setCustomMode] = React.useState(() => value != null && !presets.includes(value));
  const customRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (value != null && !presets.includes(value)) setCustomMode(true);
  }, [value, presets]);

  function selectPreset(n: number) {
    setCustomMode(false);
    onChange(n);
  }

  function onCustomInput(raw: string) {
    const t = raw.trim();
    if (!t) {
      onChange(null);
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isFinite(n) && n > 0) onChange(n);
  }

  const inputClass = cn(
    adminFormInput,
    "w-full tabular-nums shadow-inner focus:outline-none focus:ring-2",
    compact ? "px-2 py-1 text-xs" : "px-2.5 py-2 text-sm",
    blocking
      ? "border-2 border-admin-danger/50 bg-[var(--admin-danger-surface)] focus:border-admin-danger focus:ring-admin-danger/30"
      : "focus:border-admin-accent focus:ring-admin-accent/30",
  );

  return (
    <div
      className={cn(
        compact ? "space-y-1" : "space-y-1.5",
        blocking && "rounded-lg border-2 border-admin-danger/50 bg-[var(--admin-danger-surface)] p-2",
        className,
      )}
    >
      <span className={cn("font-semibold text-admin-muted", compact ? "text-[11px]" : "text-xs")}>
        {label}
        {blocking ? (
          <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-danger">Required</span>
        ) : null}
      </span>
      <div
        className={cn(
          "flex gap-1",
          compact ? "flex-nowrap overflow-x-auto pb-0.5 [scrollbar-width:thin]" : "flex-wrap",
        )}
      >
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => selectPreset(n)}
            className={cn(
              "shrink-0 rounded-md border font-medium tabular-nums transition",
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
              !customMode && value === n
                ? cn("border-admin-accent bg-admin-accent-soft text-admin-accent", adminStatusBadgeClasses("accent"))
                : "border-admin-border bg-admin-surface text-admin-secondary hover:border-admin-accent/40",
            )}
          >
            {n.toLocaleString("en-US")}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomMode(true);
            setTimeout(() => customRef.current?.focus(), 0);
          }}
          className={cn(
            "shrink-0 rounded-md border font-medium transition",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
            customMode
              ? "border-admin-accent bg-admin-accent-soft text-admin-accent"
              : "border-admin-border bg-admin-surface text-admin-secondary hover:border-admin-accent/40",
          )}
        >
          …
        </button>
      </div>
      {customMode ? (
        <input
          ref={customRef}
          type="number"
          min={1}
          disabled={disabled}
          value={value ?? ""}
          onChange={(e) => onCustomInput(e.target.value)}
          className={inputClass}
          placeholder="Custom"
        />
      ) : null}
      {hint ? <p className="text-[10px] leading-snug text-admin-muted">{hint}</p> : null}
    </div>
  );
}
