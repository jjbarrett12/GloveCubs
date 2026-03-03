"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ShoppingCart, FileText, GitCompare } from "lucide-react";

const TRANSITION = "transition-all duration-200";

const RESULT_LABELS = ["Best Fit", "Best Value", "Most Durable"] as const;

export interface GloveRecommendation {
  sku?: string | null;
  name: string;
  brand?: string | null;
  reason: string;
  price?: string | number | null;
  badges?: string[];
}

function inferBadges(reason: string, name: string): string[] {
  const text = `${(reason || "").toLowerCase()} ${(name || "").toLowerCase()}`;
  const out: string[] = [];
  if (/\b(food|nsf|food-safe)\b/.test(text)) out.push("Food-safe");
  if (/\b(medical|exam|fda|nitrile)\b/.test(text)) out.push("Medical");
  if (/\b(cut|ansi|level)\b/.test(text)) out.push("Cut");
  if (/\b(chemical|solvent|resistant)\b/.test(text)) out.push("Chemical");
  return out.length ? out : ["General"];
}

interface ResultCardProps {
  item: GloveRecommendation;
  label: (typeof RESULT_LABELS)[number];
  onCompare?: () => void;
  isCompareSelected?: boolean;
}

function ResultCard({ item, label, onCompare, isCompareSelected }: ResultCardProps) {
  const badges = item.badges ?? inferBadges(item.reason, item.name);
  const priceStr =
    item.price != null
      ? typeof item.price === "number"
        ? `$${item.price.toFixed(2)}`
        : String(item.price)
      : "—";

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-200 hover:border-white/20",
        "flex flex-col"
      )}
    >
      <CardHeader className="space-y-2 p-5 pb-2 sm:p-6 sm:pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className="bg-primary/20 text-primary border-0 font-medium">
            {label}
          </Badge>
          {onCompare && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCompare}
              className={cn(
                "h-8 gap-1.5 text-xs text-white/70 hover:text-white",
                isCompareSelected && "text-primary"
              )}
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare
            </Button>
          )}
        </div>
        {item.sku && (
          <span className="text-xs font-mono text-white/50">{item.sku}</span>
        )}
        <h3 className="text-base font-semibold text-white sm:text-lg">
          {item.name}
        </h3>
        {item.brand && (
          <p className="text-xs text-white/60">{item.brand}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 p-5 pt-0 sm:p-6 sm:pt-0">
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <Badge key={b} variant="secondary" className="text-[10px] font-medium">
              {b}
            </Badge>
          ))}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm text-white/60">Price</span>
          <span className="text-sm font-semibold text-white">{priceStr}</span>
          <span className="text-xs text-white/50">per box/case</span>
        </div>
        <Accordion type="single" className="w-full">
          <AccordionItem value="why" className="border-0">
            <AccordionTrigger value="why" className="py-2 text-xs text-white/70 hover:text-white [&[data-state=open]>svg]:rotate-180">
              Why this works
              <ChevronDown className="h-4 w-4 shrink-0" />
            </AccordionTrigger>
            <AccordionContent value="why" className="text-xs text-white/60 pb-2">
              {item.reason}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
          >
            <ShoppingCart className="h-4 w-4" />
            Add to cart
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Build quote
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ResultsViewProps {
  recommendations: GloveRecommendation[];
  summary?: string;
  className?: string;
}

const MAX_COMPARE = 3;

export function ResultsView({ recommendations, summary, className }: ResultsViewProps) {
  const [compareIds, setCompareIds] = React.useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = React.useState(false);

  const top3 = recommendations.slice(0, 3);
  const compareItems = Array.from(compareIds)
    .sort((a, b) => a - b)
    .map((i) => top3[i])
    .filter(Boolean);

  const toggleCompare = (index: number) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else if (next.size < MAX_COMPARE) next.add(index);
      return next;
    });
  };

  return (
    <div className={cn("space-y-6", className)}>
      {summary && (
        <p className="text-sm text-white/70">{summary}</p>
      )}

      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top3.map((item, i) => (
            <ResultCard
              key={i}
              item={item}
              label={RESULT_LABELS[i] ?? "Recommended"}
              onCompare={() => toggleCompare(i)}
              isCompareSelected={compareIds.has(i)}
            />
          ))}
        </div>
      </section>

      {compareIds.size > 0 && (
        <div className="flex justify-center">
          <Button
            size="lg"
            variant="outline"
            className="gap-2"
            onClick={() => setCompareOpen(true)}
          >
            <GitCompare className="h-4 w-4" />
            Compare {compareIds.size} item{compareIds.size !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Compare gloves</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-3 pr-4 font-semibold text-white">Feature</th>
                  {compareItems.map((item, i) => (
                    <th key={i} className="pb-3 px-4 font-medium text-white">
                      {item.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-white/80">
                <tr className="border-b border-white/10">
                  <td className="py-2 pr-4 text-white/60">SKU</td>
                  {compareItems.map((item, i) => (
                    <td key={i} className="py-2 px-4 font-mono text-xs">
                      {item.sku || "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-2 pr-4 text-white/60">Brand</td>
                  {compareItems.map((item, i) => (
                    <td key={i} className="py-2 px-4">
                      {item.brand || "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-2 pr-4 text-white/60">Price</td>
                  {compareItems.map((item, i) => (
                    <td key={i} className="py-2 px-4">
                      {item.price != null
                        ? typeof item.price === "number"
                          ? `$${item.price.toFixed(2)}`
                          : item.price
                        : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-white/60">Why this works</td>
                  {compareItems.map((item, i) => (
                    <td key={i} className="py-2 px-4">
                      {item.reason}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
