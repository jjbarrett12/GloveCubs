import type { ReactNode } from "react";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";

type Props = {
  children: ReactNode;
  /** Page background — defaults to dark public subpages. */
  className?: string;
};

/**
 * Canonical public procurement shell: anonymous header + footer (no server auth lookups).
 * Authenticated account / workspace pages keep their own auth-aware header loaders.
 */
export async function PublicExperienceChrome({
  children,
  className = "min-h-screen bg-[#0a0a0a] font-poppins",
}: Props) {
  return (
    <div className={`flex min-h-screen flex-col ${className}`}>
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
