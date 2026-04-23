import type { Metadata } from "next";
import { CockpitOverview } from "@/components/owner-cockpit/CockpitOverview";

export const metadata: Metadata = {
  title: "Owner Cockpit — Design Preview | GloveCubs",
  description: "High-fidelity Owner Cockpit UI reference for GloveCubs B2B operations.",
  robots: { index: false, follow: false },
};

export default function OwnerCockpitPreviewPage() {
  return <CockpitOverview />;
}
