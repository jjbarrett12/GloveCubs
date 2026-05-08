"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { PrepLineOperationalCopy } from "@/lib/prep-line/operational-copy";
import {
  PREP_LINE_CHECKLIST_ITEMS,
  PREP_LINE_ENVIRONMENT_HEADER,
  getPrepLineCautionLines,
  type PrepLineChecklistId,
} from "@/lib/prep-line/guidance";

const TRANSITION = "transition-all duration-200";

export function PrepLineGuidancePanel({ className }: { className?: string }) {
  const [selected, setSelected] = React.useState<Set<PrepLineChecklistId>>(() => new Set());

  const toggle = (id: PrepLineChecklistId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cautionLines = getPrepLineCautionLines(selected);

  return (
    <section className={cn("space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4", TRANSITION, className)}>
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-white">{PREP_LINE_ENVIRONMENT_HEADER.title}</h2>
        <p className="text-xs leading-relaxed text-white/65">{PREP_LINE_ENVIRONMENT_HEADER.body}</p>
      </header>

      <p className="text-[11px] leading-snug text-white/55 border-l-2 border-primary/60 pl-2">
        {PrepLineOperationalCopy.evidenceStrip}
      </p>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-white/90">{PrepLineOperationalCopy.checklistTitle}</h3>
        <p className="text-[10px] leading-snug text-white/50">{PrepLineOperationalCopy.checklistDisclaimer}</p>
        <ul className="space-y-1.5">
          {PREP_LINE_CHECKLIST_ITEMS.map((item) => (
            <li key={item.id} className="flex gap-2 text-xs text-white/80">
              <input
                type="checkbox"
                id={`prep-check-${item.id}`}
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/30"
              />
              <label htmlFor={`prep-check-${item.id}`} className="cursor-pointer leading-snug">
                {item.label}
              </label>
            </li>
          ))}
        </ul>
      </div>

      {cautionLines.length > 0 ? (
        <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200/80">Caution rails</p>
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-amber-50/90">
            {cautionLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
