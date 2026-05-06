import type { ReactNode } from "react";

/** Outer width + padding wrapper for the commercial store chrome (legacy .container feel). */
export function StorePageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">{children}</div>;
}
