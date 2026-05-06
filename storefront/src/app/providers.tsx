"use client";

import type { ReactNode } from "react";
import { QuoteCartProvider } from "@/components/quote/QuoteCartProvider";
import { StickyQuoteTray } from "@/components/store/StickyQuoteTray";
import { MobileQuoteFab } from "@/components/store/MobileQuoteFab";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QuoteCartProvider>
      <div className="pb-16 md:pb-20">{children}</div>
      <StickyQuoteTray />
      <MobileQuoteFab />
    </QuoteCartProvider>
  );
}
