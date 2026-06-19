import type { Metadata } from "next";
import { PublicExperienceChrome } from "@/components/layout/PublicExperienceChrome";

export const metadata: Metadata = {
  title: "Compare Wizard | GloveCubs",
  description:
    "Sortable glove sales sheet — compare SKUs, specs, case and pallet pricing across the full published catalog.",
};

export default function CompareWizardLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicExperienceChrome className="min-h-screen bg-neutral-100 font-poppins">{children}</PublicExperienceChrome>
  );
}
