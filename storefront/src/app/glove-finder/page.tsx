"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLOVE_FINDER_USE_CASES, WIZARD_STEPS, type WizardStepId } from "@/config/gloveFinder";
import { UseCaseGrid } from "@/components/glove-finder/UseCaseGrid";
import { WizardLayout } from "@/components/glove-finder/WizardLayout";
import { ResultsView, type GloveRecommendation } from "@/components/glove-finder/ResultsView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TRANSITION = "transition-all duration-200";

export default function GloveFinderPage() {
  const [step, setStep] = React.useState<WizardStepId>("use-case");
  const [useCaseId, setUseCaseId] = React.useState<string | null>(null);
  const [material, setMaterial] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [constraints, setConstraints] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<{
    recommendations: GloveRecommendation[];
    summary?: string;
  } | null>(null);

  const useCaseLabel = useCaseId
    ? GLOVE_FINDER_USE_CASES.find((u) => u.id === useCaseId)?.label
    : "";

  async function handleGetRecommendations() {
    setError(null);
    setLoading(true);
    try {
      // Use same-origin Next.js API (no proxy to Express)
      const url = "/api/ai/glove-finder";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          use_case: useCaseLabel || undefined,
          industry: useCaseLabel || undefined,
          material_preference: material || undefined,
          quantity_per_month: quantity || undefined,
          constraints: constraints || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setResults({
        recommendations: data.recommendations ?? [],
        summary: data.summary,
      });
      setStep("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const stepContent = (
    <>
      {step === "use-case" && (
        <div className={cn("space-y-6", TRANSITION)}>
          <UseCaseGrid
            options={GLOVE_FINDER_USE_CASES}
            selectedId={useCaseId}
            onSelect={setUseCaseId}
          />
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!useCaseId}
              onClick={() => setStep("details")}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      )}

      {step === "details" && (
        <div className={cn("space-y-6", TRANSITION)}>
          <div className="space-y-2">
            <label htmlFor="gf-material" className="text-sm font-medium text-white">
              Material preference
            </label>
            <Input
              id="gf-material"
              placeholder="e.g. Nitrile, Vinyl"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="gf-quantity" className="text-sm font-medium text-white">
              Quantity per month (optional)
            </label>
            <Input
              id="gf-quantity"
              type="text"
              placeholder="e.g. 5000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="gf-constraints" className="text-sm font-medium text-white">
              Budget or constraints (optional)
            </label>
            <Input
              id="gf-constraints"
              placeholder="e.g. budget-conscious, latex-free"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              className="max-w-md"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={loading}
              onClick={handleGetRecommendations}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finding...
                </>
              ) : (
                "Get recommendations"
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setStep("use-case")}
              disabled={loading}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
      )}

      {step === "results" && results && (
        <div className={cn("space-y-6", TRANSITION)}>
          <ResultsView
            recommendations={results.recommendations}
            summary={results.summary}
          />
          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-6">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                setResults(null);
                setStep("use-case");
                setUseCaseId(null);
                setMaterial("");
                setQuantity("");
                setConstraints("");
              }}
            >
              Start over
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-lg font-semibold text-white hover:text-white/90"
          >
            GloveCubs
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-white/70 hover:text-white"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <WizardLayout
          currentStep={step}
          title="Find My Glove"
          subtext="Select your use case and preferences for AI-powered product recommendations."
          showTrustCues={step !== "results"}
        >
          {stepContent}
        </WizardLayout>
      </main>
    </div>
  );
}
