"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/50 focus-visible:border-[hsl(var(--primary))]/40";

export type QuickBulkBuilderProps = {
  className?: string;
};

export function QuickBulkBuilder({ className }: QuickBulkBuilderProps) {
  const router = useRouter();
  const [industryKey, setIndustryKey] = React.useState<IndustryKey | "">("");
  const [cases, setCases] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function onContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!industryKey) {
      setError("Choose an industry.");
      return;
    }
    const n = parseInt(cases, 10);
    if (!Number.isFinite(n) || n < 1 || n > 999_999) {
      setError("Enter a case quantity between 1 and 999,999.");
      return;
    }
    router.push(`/industries/${industryKey}?cases=${encodeURIComponent(String(n))}`);
  }

  return (
    <Card
      className={cn(
        "rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-black/40 shadow-lg shadow-black/40 ring-1 ring-[hsl(var(--primary))]/20 mb-0",
        className
      )}
    >
      <CardHeader className="space-y-1 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">
          Case purchasing
        </p>
        <CardTitle className="text-white text-lg sm:text-xl font-semibold tracking-tight">
          Quick bulk builder
        </CardTitle>
        <CardDescription className="text-white/60 text-sm leading-relaxed">
          Pick your vertical and case count — we route you straight to case-level SKUs and pricing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onContinue} className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="bulk-industry" className="text-xs font-medium uppercase tracking-wide text-white/70">
              Industry
            </label>
            <select
              id="bulk-industry"
              className={selectClass}
              value={industryKey}
              onChange={(e) => setIndustryKey(e.target.value as IndustryKey | "")}
            >
              <option value="" disabled className="bg-neutral-950 text-white/80">
                Select industry
              </option>
              {INDUSTRY_KEYS.map((key) => (
                <option key={key} value={key} className="bg-neutral-950 text-white">
                  {INDUSTRIES[key].name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-36 space-y-1.5">
            <label htmlFor="bulk-cases" className="text-xs font-medium uppercase tracking-wide text-white/70">
              Cases
            </label>
            <Input
              id="bulk-cases"
              inputMode="numeric"
              type="number"
              min={1}
              max={999_999}
              placeholder="e.g. 24"
              value={cases}
              onChange={(e) => setCases(e.target.value)}
              className="rounded-xl border-white/15 bg-black/40 text-white placeholder:text-white/35 focus-visible:ring-[hsl(var(--primary))]/40"
            />
          </div>
          <Button
            type="submit"
            className="h-10 shrink-0 rounded-xl bg-[hsl(var(--primary))] px-6 font-semibold text-white shadow-md shadow-[hsl(var(--primary))]/25 hover:opacity-95"
          >
            Continue
          </Button>
        </form>
        {error ? (
          <p className="text-sm text-red-300 mt-3" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
