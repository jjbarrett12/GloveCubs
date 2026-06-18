"use client";

import { cn } from "@/lib/utils";
import type { AdminThemePreference } from "@/lib/admin/admin-theme";
import { useAdminTheme } from "./AdminThemeProvider";

const OPTIONS: { value: AdminThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export function AdminThemeToggle({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "compact";
}) {
  const { preference, resolved, setPreference } = useAdminTheme();
  const compact = variant === "compact";

  return (
    <div className={cn(compact ? "flex items-center gap-2" : "flex flex-col gap-2", className)}>
      <div
        className={cn(
          "inline-flex gap-0.5 rounded-lg border border-admin-border bg-admin-surface-muted p-0.5",
          compact ? "flex-nowrap" : "flex-wrap gap-1 p-1",
        )}
        role="group"
        aria-label="Admin theme"
      >
        {OPTIONS.map((opt) => {
          const active = preference === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPreference(opt.value)}
              aria-pressed={active}
              className={cn(
                "rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-focus-ring",
                compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-sm",
                active
                  ? "bg-admin-accent text-white shadow-sm"
                  : "text-admin-secondary hover:bg-admin-surface hover:text-admin-primary",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {!compact ? (
        <p className="text-xs text-admin-muted">
          Active appearance: <span className="font-medium capitalize text-admin-secondary">{resolved}</span>
          {preference === "system" ? " (from system preference)" : null}
        </p>
      ) : null}
    </div>
  );
}
