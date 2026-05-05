"use client";

import type { ReactNode } from "react";
import { QuoteCartProvider } from "@/components/quote/QuoteCartProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <QuoteCartProvider>{children}</QuoteCartProvider>;
}
