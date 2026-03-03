"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GloveUseCase } from "@/lib/gloves/types";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: LucideIcons.Sparkles,
  "utensils-crossed": LucideIcons.UtensilsCrossed,
  stethoscope: LucideIcons.Stethoscope,
  "hard-hat": LucideIcons.HardHat,
  wrench: LucideIcons.Wrench,
  zap: LucideIcons.Zap,
  car: LucideIcons.Car,
  package: LucideIcons.Package,
  "flask-conical": LucideIcons.FlaskConical,
  snowflake: LucideIcons.Snowflake,
  "tree-deciduous": LucideIcons.TreeDeciduous,
  paintbrush: LucideIcons.Paintbrush,
  "trash-2": LucideIcons.Trash2,
  layers: LucideIcons.Layers,
};

const DefaultIcon = LucideIcons.Circle;

interface UseCaseGridProps {
  useCases: GloveUseCase[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
}

export function UseCaseGrid({ useCases, selectedKey, onSelect, className }: UseCaseGridProps) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 min-w-0", className)}>
      {useCases.map((uc) => {
        const Icon: React.ComponentType<{ className?: string }> =
          (uc.icon && iconMap[uc.icon]) || DefaultIcon;
        const isSelected = selectedKey === uc.key;
        return (
          <Card
            key={uc.id}
            role="button"
            tabIndex={0}
            className={cn(
              "cursor-pointer transition-all hover:border-white/30 hover:bg-white/10",
              isSelected && "ring-2 ring-[hsl(var(--primary))] border-[hsl(var(--primary))]/50"
            )}
            onClick={() => onSelect(uc.key)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(uc.key)}
          >
            <CardHeader className="p-4 pb-1">
              <div className="flex items-center gap-2">
                {React.createElement((uc.icon && iconMap[uc.icon]) ?? DefaultIcon, { className: "h-5 w-5 text-white/70 shrink-0" })}
                <CardTitle className="text-sm font-medium text-white line-clamp-2">
                  {uc.label}
                </CardTitle>
              </div>
            </CardHeader>
            {uc.description && (
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-white/60 line-clamp-2">{uc.description}</p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

