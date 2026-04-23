"use client";

import { useState } from "react";
import Link from "next/link";
import { INDUSTRY_OPTIONS, INDUSTRY_MAP, type IndustryKey } from "@/lib/conversion";
import { trackConversionEvent } from "@/lib/conversion/analytics";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Toughness = "light" | "medium" | "heavy";
const TOUGHNESS_OPTIONS: { value: Toughness; label: string }[] = [
  { value: "light", label: "Light / flexible" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy duty" },
];

const COLOR_OPTIONS = ["blue", "black", "white", "nitrile_natural", "purple"] as const;

interface RecommendationItem {
  id: string;
  slug: string | null;
  name: string;
  best_price?: number | null;
  pricePerGlove?: { display_per_glove: string; display_case: string };
  signals?: { label: string }[];
  industryBadge?: string | null;
}

interface HelpMeChoosePanelProps {
  triggerLabel?: string;
  catalogBasePath?: string;
}

export function HelpMeChoosePanel({
  triggerLabel = "Help me choose gloves",
  catalogBasePath = "/catalog/disposable_gloves",
}: HelpMeChoosePanelProps) {
  const [open, setOpen] = useState(false);
  const [industry, setIndustry] = useState<IndustryKey | "">("");
  const [toughness, setToughness] = useState<Toughness>("medium");
  const [color, setColor] = useState<string>("");
  const [powderFree, setPowderFree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RecommendationItem[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setSubmitted(true);
    setResults([]);
    try {
      const params = new URLSearchParams();
      if (industry) params.set("industry", industry);
      params.set("toughness", toughness);
      if (color) params.set("color", color);
      params.set("powder_free", String(powderFree));
      const res = await fetch(`/api/catalog/recommendations?${params.toString()}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) setResults(data.items);
      trackConversionEvent("help_me_choose_submit", {
        industry: industry || undefined,
        toughness,
        color: color || undefined,
        powder_free: powderFree,
        result_count: data.items?.length ?? 0,
      });
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const buildCatalogLink = () => {
    const p = new URLSearchParams();
    if (industry && INDUSTRY_MAP.get(industry as IndustryKey)) {
      INDUSTRY_MAP.get(industry as IndustryKey)!.filterValues.forEach((v: string) => p.append("industries", v));
    }
    if (toughness === "heavy") p.set("thickness_mil", "6,7,8,9,10");
    if (toughness === "light") p.set("thickness_mil", "2,3,4");
    if (color) p.set("color", color);
    if (powderFree) p.set("powder", "powder_free");
    const q = p.toString();
    return q ? `${catalogBasePath}?${q}` : catalogBasePath;
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle>{triggerLabel}</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium">What industry?</label>
              <select
                value={industry}
                onChange={(e) => setIndustry((e.target.value || "") as IndustryKey)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">How tough do they need to be?</label>
              <select
                value={toughness}
                onChange={(e) => setToughness(e.target.value as Toughness)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TOUGHNESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Preferred color?</label>
              <select
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                {COLOR_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={powderFree}
                  onChange={(e) => setPowderFree(e.target.checked)}
                  className="rounded border-input"
                />
                Powder free
              </label>
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full">
              {loading ? "Finding gloves…" : "Get top 3 recommendations"}
            </Button>

            {submitted && !loading && (
              <div className="space-y-3">
                {results.length > 0 ? (
                  <>
                    <p className="text-sm font-medium">Top 3 for you:</p>
                    <ul className="space-y-2">
                      {results.map((item) => (
                        <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
                          <Link
                            href={`/product/${item.slug ?? item.id}`}
                            className="font-medium hover:underline"
                            onClick={() => setOpen(false)}
                          >
                            {item.name}
                          </Link>
                          {item.pricePerGlove && (
                            <p className="mt-1 text-muted-foreground">
                              {item.pricePerGlove.display_per_glove} · {item.pricePerGlove.display_case}
                            </p>
                          )}
                          {item.signals?.length ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.signals.map((s) => s.label).join(", ")}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={buildCatalogLink()}
                      onClick={() => setOpen(false)}
                      className="block text-center text-sm text-primary hover:underline"
                    >
                      View all matching gloves →
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No matches. Try loosening filters.</p>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
