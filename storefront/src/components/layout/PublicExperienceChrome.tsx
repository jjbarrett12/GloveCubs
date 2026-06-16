import type { ReactNode } from "react";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";

type Props = {
  children: ReactNode;
  /** Page background — defaults to dark public subpages. */
  className?: string;
};

/** Canonical public procurement shell: auth-aware header + footer, single chrome per route. */
export async function PublicExperienceChrome({
  children,
  className = "min-h-screen bg-[#0a0a0a] font-poppins",
}: Props) {
  return (
    <div className={`flex min-h-screen flex-col ${className}`}>
      <SiteHeaderLoader />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
