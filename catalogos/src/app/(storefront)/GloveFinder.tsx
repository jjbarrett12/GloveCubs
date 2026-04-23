"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const USE_CASES = [
  { id: "food_prep", label: "Food prep", industry: "restaurant_food_service" },
  { id: "cleaning", label: "Cleaning", industry: "janitorial" },
  { id: "mechanic", label: "Mechanic work", industry: "automotive" },
  { id: "tattoo_medical", label: "Tattoo / medical", industry: "tattoo" },
  { id: "general", label: "General use", industry: "general_use" },
] as const;

const TOUGHNESS = [
  { id: "light", label: "Light duty", value: "light" },
  { id: "medium", label: "Medium", value: "medium" },
  { id: "heavy", label: "Heavy duty", value: "heavy" },
] as const;

const COLORS = [
  { id: "black", label: "Black", value: "black" },
  { id: "blue", label: "Blue", value: "blue" },
  { id: "any", label: "Any", value: "" },
] as const;

interface RecommendationItem {
  id: string;
  slug: string | null;
  name: string;
  best_price?: number | null;
  pricePerGlove?: { display_per_glove: string; display_case: string };
  signals?: { label: string }[];
}

export function GloveFinder() {
  const [step, setStep] = useState(1);
  const [useCase, setUseCase] = useState<string>("");
  const [toughness, setToughness] = useState<string>("medium");
  const [color, setColor] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RecommendationItem[]>([]);
  const [done, setDone] = useState(false);

  const handleStep1 = (id: string) => {
    setUseCase(id);
    setStep(2);
  };

  const handleStep2 = (value: string) => {
    setToughness(value);
    setStep(3);
  };

  const handleStep3 = async (value: string) => {
    setColor(value);
    setLoading(true);
    setDone(true);
    try {
      const industry = USE_CASES.find((u) => u.id === useCase)?.industry ?? "";
      const params = new URLSearchParams();
      if (industry) params.set("industry", industry);
      params.set("toughness", toughness);
      if (value) params.set("color", value);
      params.set("powder_free", "true");
      const res = await fetch(`/api/catalog/recommendations?${params.toString()}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) setResults(data.items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Your top 3 gloves</h2>
        {loading ? (
          <p className="mt-4 text-muted-foreground">Finding the best matches…</p>
        ) : results.length > 0 ? (
          <ul className="mt-4 space-y-4">
            {results.map((item) => (
              <li key={item.id} className="rounded-lg border border-border p-4">
                <Link
                  href={`/product/${item.slug ?? item.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {item.name}
                </Link>
                {item.pricePerGlove && (
                  <p className="mt-1 text-sm text-muted-foreground">
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
        ) : (
          <p className="mt-4 text-muted-foreground">No matches. Try different options.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/catalog/disposable_gloves">Browse all gloves</Link>
          </Button>
          <Button variant="outline" onClick={() => { setDone(false); setStep(1); setResults([]); }}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Find the right glove in 15 seconds</h2>
      {step === 1 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">What are you using gloves for?</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {USE_CASES.map((u) => (
              <li key={u.id}>
                <Button
                  type="button"
                  variant={useCase === u.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleStep1(u.id)}
                >
                  {u.label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {step === 2 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">How tough do they need to be?</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {TOUGHNESS.map((t) => (
              <li key={t.id}>
                <Button
                  type="button"
                  variant={toughness === t.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleStep2(t.value)}
                >
                  {t.label}
                </Button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 text-sm text-muted-foreground hover:underline"
            onClick={() => setStep(1)}
          >
            ← Back
          </button>
        </div>
      )}
      {step === 3 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">Preferred color?</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <li key={c.id}>
                <Button
                  type="button"
                  variant={color === c.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleStep3(c.value)}
                >
                  {c.label}
                </Button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 text-sm text-muted-foreground hover:underline"
            onClick={() => setStep(2)}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
