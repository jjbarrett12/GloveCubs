"use client";

import { useState, useCallback } from "react";
import { UseCaseGrid } from "./UseCaseGrid";
import { RecommendationResults } from "./RecommendationResults";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GloveUseCase } from "@/lib/gloves/types";
import type { RecommendAnswers, RecommendResponse } from "@/lib/gloves/types";
import { cn } from "@/lib/utils";
import { ChevronLeft, Loader2 } from "lucide-react";

interface FindMyGloveWizardProps {
  useCases: GloveUseCase[];
  initialUseCaseKey?: string | null;
}

const defaultAnswers: RecommendAnswers = {
  gloveTypePreference: "either",
  chemicalsLevel: "none",
  chemicalsType: [],
  cutAbrasionLevel: "none",
  biohazard: false,
  foodContact: false,
  coldEnvironment: false,
  dexterityImportance: "med",
  budgetSensitivity: "balanced",
  quantity: "single_box",
};

export function FindMyGloveWizard({ useCases, initialUseCaseKey }: FindMyGloveWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [useCaseKey, setUseCaseKey] = useState<string | null>(initialUseCaseKey ?? null);
  const [answers, setAnswers] = useState<RecommendAnswers>(defaultAnswers);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<"disposable" | "reusable" | "either">("either");

  const handleSelectUseCase = useCallback((key: string) => {
    setUseCaseKey(key);
  }, []);

  const handleNextFromStep1 = useCallback(() => {
    if (useCaseKey) setStep(2);
  }, [useCaseKey]);

  const handleNextFromStep2 = useCallback(async () => {
    if (!useCaseKey) return;
    setLoading(true);
    try {
      const res = await fetch("/api/gloves/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCaseKey, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data?.error && typeof data.error === "object" && "message" in data.error
            ? String(data.error.message)
            : data?.error ?? "Request failed";
        throw new Error(typeof msg === "string" ? msg : "Request failed");
      }
      setResult(data);
      setStep(3);
    } catch (e) {
      console.error(e);
      setResult({
        recommendations: [],
        confidence_0_1: 0,
        clarifying_questions: [],
      });
      setStep(3);
    } finally {
      setLoading(false);
    }
  }, [useCaseKey, answers]);

  const productBySku = new Map<string, { name: string; price_cents: number; glove_type?: "disposable" | "reusable"; image_url?: string | null }>();
  if (result) {
    result.recommendations.forEach((r) => {
      productBySku.set(r.sku, {
        name: r.name ?? r.sku,
        price_cents: r.price_cents ?? 0,
        glove_type: r.glove_type,
      });
    });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 overflow-x-hidden min-w-0">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-white/60">
        <span className={cn(step >= 1 && "text-white")}>1. Use case</span>
        <span>→</span>
        <span className={cn(step >= 2 && "text-white")}>2. Details</span>
        <span>→</span>
        <span className={cn(step >= 3 && "text-white")}>3. Results</span>
      </div>

      {step === 1 && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Find your glove</h1>
            <p className="text-white/70">Choose the use case that best fits your work.</p>
          </div>
          <UseCaseGrid
            useCases={useCases}
            selectedKey={useCaseKey}
            onSelect={handleSelectUseCase}
          />
          <div className="flex justify-end">
            <Button onClick={handleNextFromStep1} disabled={!useCaseKey} size="lg">
              Continue
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">A few quick questions</h1>
              <p className="text-white/60 text-sm">
                Use case: {useCases.find((u) => u.key === useCaseKey)?.label ?? useCaseKey}
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-white">Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Glove type
                </label>
                <select
                  className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  value={answers.gloveTypePreference}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      gloveTypePreference: e.target.value as RecommendAnswers["gloveTypePreference"],
                    }))
                  }
                >
                  <option value="either">Either</option>
                  <option value="disposable">Disposable</option>
                  <option value="reusable">Reusable</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Chemical / disinfectant exposure
                </label>
                <select
                  className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  value={answers.chemicalsLevel}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      chemicalsLevel: e.target.value as RecommendAnswers["chemicalsLevel"],
                    }))
                  }
                >
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Cut / abrasion risk
                </label>
                <select
                  className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  value={answers.cutAbrasionLevel}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      cutAbrasionLevel: e.target.value as RecommendAnswers["cutAbrasionLevel"],
                    }))
                  }
                >
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={answers.biohazard}
                    onChange={(e) => setAnswers((a) => ({ ...a, biohazard: e.target.checked }))}
                    className="rounded border-white/20"
                  />
                  <span className="text-sm text-white/90">Biohazard exposure</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={answers.foodContact}
                    onChange={(e) => setAnswers((a) => ({ ...a, foodContact: e.target.checked }))}
                    className="rounded border-white/20"
                  />
                  <span className="text-sm text-white/90">Food contact</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={answers.coldEnvironment}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, coldEnvironment: e.target.checked }))
                    }
                    className="rounded border-white/20"
                  />
                  <span className="text-sm text-white/90">Cold environment</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Dexterity importance
                </label>
                <select
                  className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  value={answers.dexterityImportance}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      dexterityImportance: e.target.value as RecommendAnswers["dexterityImportance"],
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High (fine work)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Budget
                </label>
                <select
                  className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  value={answers.budgetSensitivity}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      budgetSensitivity: e.target.value as RecommendAnswers["budgetSensitivity"],
                    }))
                  }
                >
                  <option value="lowest_price">Lowest price</option>
                  <option value="balanced">Balanced</option>
                  <option value="best_protection">Best protection</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Quantity
                </label>
                <select
                  className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  value={answers.quantity}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      quantity: e.target.value as RecommendAnswers["quantity"],
                    }))
                  }
                >
                  <option value="single_box">Single box</option>
                  <option value="cases">Cases</option>
                  <option value="ongoing_reorder">Ongoing reorder</option>
                </select>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={handleNextFromStep2} disabled={loading} size="lg" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Get recommendations
            </Button>
          </div>
        </>
      )}

      {step === 3 && result && (
        <>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Your recommendations</h1>
              <p className="text-white/60 text-sm">
                Based on {useCases.find((u) => u.key === useCaseKey)?.label ?? useCaseKey}
              </p>
            </div>
          </div>
          <RecommendationResults
            data={result}
            productBySku={productBySku}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
          />
          <div className="pt-4 border-t border-white/10">
            <Button variant="outline" onClick={() => { setStep(1); setResult(null); setUseCaseKey(null); }}>
              Start over
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
