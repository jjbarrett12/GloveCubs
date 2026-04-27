"use client";

import { useState } from "react";
import { useCompare } from "./CompareContext";
import { ComparisonTable } from "./ComparisonTable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function CompareDrawer() {
  const { items, clear } = useCompare();
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="fixed z-30 h-11 min-h-11 shadow-md"
        style={{
          bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          right: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        Compare ({items.length})
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-2xl sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Product comparison</SheetTitle>
          </SheetHeader>
          <div className="p-4">
            <ComparisonTable />
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => { clear(); setOpen(false); }}>
                Clear all
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
