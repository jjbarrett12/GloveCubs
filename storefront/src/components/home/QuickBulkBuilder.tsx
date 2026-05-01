"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const selectClass =
  "flex h-10 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:border-white/30";

export function QuickBulkBuilder() {
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
    <Card className="rounded-2xl border-white/10 bg-white/[0.06] mb-12">
      <CardHeader>
        <CardTitle className="text-white text-xl">Quick Bulk Builder</CardTitle>
        <CardDescription className="text-white/65">
          Jump straight to case-level collections for your vertical.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onContinue} className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="bulk-industry" className="text-sm font-medium text-white/90">
              Industry
            </label>
            <select
              id="bulk-industry"
              className={selectClass}
              value={industryKey}
              onChange={(e) => setIndustryKey(e.target.value as IndustryKey | "")}
            >
              <option value="" disabled className="bg-neutral-900">
                Select industry
              </option>
              {INDUSTRY_KEYS.map((key) => (
                <option key={key} value={key} className="bg-neutral-900">
                  {INDUSTRIES[key].name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-40 space-y-1.5">
            <label htmlFor="bulk-cases" className="text-sm font-medium text-white/90">
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
            />
          </div>
          <Button type="submit" className="bg-[hsl(var(--primary))] text-white hover:opacity-90 shrink-0">
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
