import { getStoreHrefForIntent } from "@/lib/discovery/intent-routes";

export type PublicIndustryNavItem = { href: string; label: string };

/** Primary header “Industries” dropdown + mobile submenu (order preserved). */
export const HEADER_INDUSTRY_NAV_ITEMS: PublicIndustryNavItem[] = [
  { href: "/industries", label: "All industries" },
  { href: "/industries/healthcare", label: "Medical & Healthcare" },
  { href: "/industries/janitorial", label: "Janitorial" },
  { href: "/industries/hospitality", label: "Food Service" },
  { href: "/industries/industrial", label: "Industrial" },
  { href: getStoreHrefForIntent("store.search.automotive"), label: "Automotive" },
];
