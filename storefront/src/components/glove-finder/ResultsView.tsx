"use client";

import * as React from "react";
import Link from "next/link";
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
import { ShoppingCart, FileText, GitCompare } from "lucide-react";
import { PrepLineOperationalCopy } from "@/lib/prep-line/operational-copy";
import type { PrepLineCardFact } from "@/lib/prep-line/card-projection";
import { AdvisoryTextBlock, CatalogFactList } from "@/components/prep-line/render-trust";

export interface GloveRecommendation {
  sku?: string | null;
  name: string;
  brand?: string | null;
  reason: string;
  price?: string | number | null;
  catalogProductId?: string;
  slug?: string;
  catalogVariantId?: string | null;
  sizeCode?: string | null;
  catalogFacts?: PrepLineCardFact[];
}

interface ResultCardProps {
  item: GloveRecommendation;
  candidateIndex: number;
  onCompare?: () => void;
  isCompareSelected?: boolean;
  onAddToQuote?: (item: GloveRecommendation) => void;
}

function unionCatalogFactLabels(items: GloveRecommendation[]): string[] {
  const labels = new Set<string>();
  for (const it of items) {
    for (const f of it.catalogFacts ?? []) {
      if (f.label.trim()) labels.add(f.label.trim());
    }
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b));
}

function catalogValueForLabel(item: GloveRecommendation, label: string): string | null {
  const hit = (item.catalogFacts ?? []).find((f) => f.label.trim() === label);
  return hit?.value?.trim() ? hit.value.trim() : null;
}

function ResultCard({ item, candidateIndex, onCompare, isCompareSelected, onAddToQuote }: ResultCardProps) {
  const facts = item.catalogFacts ?? [];
  const hasPrice = item.price != null && item.price !== "";

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
            {PrepLineOperationalCopy.candidateLabel(candidateIndex)}
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
              Spec compare
            </Button>
          )}
        </div>
        {item.sku && <span className="text-xs font-mono text-white/50">{item.sku}</span>}
        <h3 className="text-base font-semibold text-white sm:text-lg">{item.name}</h3>
        {item.brand && <p className="text-xs text-white/60">{item.brand}</p>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 p-5 pt-0 sm:p-6 sm:pt-0">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
            {PrepLineOperationalCopy.catalogFactsTitle}
          </p>
          <CatalogFactList facts={facts} />
        </div>

        {hasPrice ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm text-white/60">List-style price (when published)</span>
            <span className="text-sm font-semibold text-sales">
              {typeof item.price === "number" ? `$${item.price.toFixed(2)}` : String(item.price)}
            </span>
          </div>
        ) : null}

        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">
            {PrepLineOperationalCopy.advisoryPanelTitle}
          </p>
          <AdvisoryTextBlock>
            <p className="mb-2 text-[10px] text-amber-50/80">{PrepLineOperationalCopy.advisoryPanelLead}</p>
            <Accordion type="single" className="w-full">
              <AccordionItem value="why" className="border-0">
                <AccordionTrigger
                  value="why"
                  className="py-2 px-0 text-xs text-amber-50/90 hover:text-amber-50 hover:bg-transparent"
                >
                  {PrepLineOperationalCopy.operationalRationaleTitle}
                </AccordionTrigger>
                <AccordionContent value="why" className="text-xs text-amber-50/85 pb-2 px-0">
                  {item.reason}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </AdvisoryTextBlock>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {item.slug ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" asChild>
              <Link href={`/store/p/${encodeURIComponent(item.slug)}`}>
                <ShoppingCart className="h-4 w-4" />
                {PrepLineOperationalCopy.viewSpecificationsCta}
              </Link>
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" disabled title="Missing slug — cannot open PDP">
              <ShoppingCart className="h-4 w-4" />
              {PrepLineOperationalCopy.viewSpecificationsCta}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!onAddToQuote || !item.catalogProductId || !item.slug}
            onClick={() => onAddToQuote?.(item)}
          >
            <FileText className="h-4 w-4" />
            {PrepLineOperationalCopy.addToQuoteRequestCta}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ResultsViewProps {
  recommendations: GloveRecommendation[];
  summary?: string;
  advisoryNotice?: string;
  onAddToQuote?: (item: GloveRecommendation) => void;
  className?: string;
}

const MAX_COMPARE = 3;

export function ResultsView({ recommendations, summary, advisoryNotice, onAddToQuote, className }: ResultsViewProps) {
  const [compareIds, setCompareIds] = React.useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = React.useState(false);

  const top3 = recommendations.slice(0, 3);
  const compareItems = Array.from(compareIds)
    .sort((a, b) => a - b)
    .map((i) => top3[i])
    .filter(Boolean);

  const catalogLabels = unionCatalogFactLabels(compareItems);

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
      {summary && <p className="text-sm text-white/70">{summary}</p>}
      {advisoryNotice ? (
        <AdvisoryTextBlock title="Flow advisory (non-authoritative)">
          {advisoryNotice}
        </AdvisoryTextBlock>
      ) : null}

      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top3.map((item, i) => (
            <ResultCard
              key={i}
              item={item}
              candidateIndex={i}
              onCompare={() => toggleCompare(i)}
              isCompareSelected={compareIds.has(i)}
              onAddToQuote={onAddToQuote}
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
            {PrepLineOperationalCopy.compareSheetTrigger} ({compareIds.size})
          </Button>
        </div>
      )}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{PrepLineOperationalCopy.compareDialogTitle}</DialogTitle>
            <p className="text-xs text-white/55 pt-1">{PrepLineOperationalCopy.compareNoRanking}</p>
          </DialogHeader>

          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Catalog facts (matrix)</p>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-3 pr-4 pl-3 font-semibold text-white">Field</th>
                    {compareItems.map((item, i) => (
                      <th key={i} className="pb-3 px-3 font-medium text-white">
                        {item.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-white/80">
                  {catalogLabels.map((label) => (
                    <tr key={label} className="border-b border-white/10">
                      <td className="py-2 pr-4 pl-3 text-white/60">{label}</td>
                      {compareItems.map((item, i) => (
                        <td key={i} className="py-2 px-3 text-xs">
                          {catalogValueForLabel(item, label) ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">
              {PrepLineOperationalCopy.operationalRationaleTitle}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {compareItems.map((item, i) => (
                <AdvisoryTextBlock key={i} title={item.name}>
                  {item.reason}
                </AdvisoryTextBlock>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
