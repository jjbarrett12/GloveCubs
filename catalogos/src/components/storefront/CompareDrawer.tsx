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
        className="fixed bottom-6 right-6 z-30 shadow-md"
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
