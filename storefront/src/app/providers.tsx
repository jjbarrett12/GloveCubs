"use client";

import type { ReactNode } from "react";
import { QuoteCartProvider } from "@/components/quote/QuoteCartProvider";
import { StickyQuoteTray } from "@/components/store/StickyQuoteTray";
import { MobileQuoteFab } from "@/components/store/MobileQuoteFab";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QuoteCartProvider>
      <div className="pb-28 md:pb-32">{children}</div>
      <StickyQuoteTray />
      <MobileQuoteFab />
    </QuoteCartProvider>
  );
}
