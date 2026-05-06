import { getStoreHrefForIntent } from "@/lib/discovery/intent-routes";

export type PublicIndustryNavItem = {
  href: string;
  label: string;
  /** Small catalog / line imagery for desktop mega-menu (public `images/` path). */
  thumb?: string;
};

/** Primary header “Industries” dropdown + mobile submenu (order preserved). */
export const HEADER_INDUSTRY_NAV_ITEMS: PublicIndustryNavItem[] = [
  { href: "/industries", label: "All industries", thumb: "/images/logos/Global_Glove.png" },
  { href: "/industries/healthcare", label: "Medical & Healthcare", thumb: "/images/logos/Ansell.png" },
  { href: "/industries/janitorial", label: "Janitorial", thumb: "/images/logos/Hospeco.png" },
  { href: "/industries/hospitality", label: "Food Service", thumb: "/images/logos/SHOWA.png" },
  { href: "/industries/industrial", label: "Industrial", thumb: "/images/logos/mcr-safety.svg" },
  { href: getStoreHrefForIntent("store.search.automotive"), label: "Automotive", thumb: "/images/logos/Ammex.png" },
];
