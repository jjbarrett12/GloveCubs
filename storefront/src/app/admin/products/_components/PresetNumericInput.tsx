"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

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
    "w-full rounded-lg border bg-white tabular-nums shadow-inner focus:outline-none focus:ring-2",
    compact ? "px-2 py-1 text-xs" : "px-2.5 py-2 text-sm",
    blocking
      ? "border-2 border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-200"
      : "border-slate-200 focus:border-[#f06232]/50 focus:ring-[#f06232]/20"
  );

  return (
    <div
      className={cn(
        compact ? "space-y-1" : "space-y-1.5",
        blocking && "rounded-lg border-2 border-red-400 bg-red-50/30 p-2",
        className
      )}
    >
      <span className={cn("font-semibold text-slate-600", compact ? "text-[11px]" : "text-xs")}>
        {label}
        {blocking ? (
          <span className="ml-1.5 text-[10px] font-bold uppercase text-red-700">Required</span>
        ) : null}
      </span>
      <div
        className={cn(
          "flex gap-1",
          compact ? "flex-nowrap overflow-x-auto pb-0.5 [scrollbar-width:thin]" : "flex-wrap"
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
                ? "border-[#f06232] bg-[#f06232]/10 text-[#f06232]"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
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
              ? "border-[#f06232] bg-[#f06232]/10 text-[#f06232]"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
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
      {hint ? <p className="text-[10px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}
