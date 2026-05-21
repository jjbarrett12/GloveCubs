import type { LucideIcon } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";
import {
  LayoutGrid,
  Stethoscope,
  UtensilsCrossed,
  Brush,
  Factory,
  Car,
  Smile,
  PawPrint,
  FlaskConical,
  Pill,
  Sparkles,
  PenTool,
  ChefHat,
  GraduationCap,
  ShoppingBag,
  Cpu,
  HardHat,
  Truck,
  Scissors,
  Beaker,
  Shield,
  Hand,
  Snowflake,
  Sprout,
  Fuel,
  TreeDeciduous,
  Flame,
  ShieldAlert,
  Package,
} from "lucide-react";

const STORE_HEALTHCARE = buildStoreCatalogHref({ industries: ["healthcare"] });
const STORE_FOOD_SERVICE = buildStoreCatalogHref({ industries: ["food_service"] });
const STORE_JANITORIAL = buildStoreCatalogHref({ industries: ["janitorial"] });
const STORE_INDUSTRIAL = buildStoreCatalogHref({ industries: ["industrial"] });

/** Lucide icon per industry nav/catalog href (exact string match). */
const INDUSTRY_NAV_ICON_BY_HREF: Record<string, LucideIcon> = {
  "/industries": LayoutGrid,
  "/industries/healthcare": Stethoscope,
  [STORE_HEALTHCARE]: Stethoscope,
  "/industries/hospitality": UtensilsCrossed,
  [STORE_FOOD_SERVICE]: UtensilsCrossed,
  "/industries/janitorial": Brush,
  [STORE_JANITORIAL]: Brush,
  "/industries/industrial": Factory,
  [STORE_INDUSTRIAL]: Factory,
  "/store?industries=automotive": Car,
  "/store?industries=dental": Smile,
  "/store?industries=veterinary": PawPrint,
  "/store?industries=laboratories": FlaskConical,
  "/store?industries=pharmaceuticals": Pill,
  "/store?industries=beauty_personal_care": Sparkles,
  "/store?industries=tattoo_body_art": PenTool,
  "/store?industries=food_processing": ChefHat,
  "/store?industries=education": GraduationCap,
  "/store?industries=retail_grocery": ShoppingBag,
  "/store?industries=electronics_assembly": Cpu,
  "/store?industries=construction": HardHat,
  "/store?industries=warehousing_logistics": Truck,
  "/store?industries=metal_fabrication": Scissors,
  "/store?industries=chemical_processing": Beaker,
  "/store?category=chemical-resistant&industries=chemical_processing": Shield,
  "/store?category=work-gloves&industries=industrial": Hand,
  "/store?industries=cold_chain_outdoor": Snowflake,
  "/store?industries=agriculture": Sprout,
  "/store?industries=oil_gas_energy": Fuel,
  "/store?industries=landscaping_grounds": TreeDeciduous,
  "/store?industries=emergency_services": Flame,
  "/store?industries=security_public_safety": ShieldAlert,
  "/store?industries=janitorial%2Csanitation": Package,
};

export function industryNavIconForHref(href: string): LucideIcon {
  return INDUSTRY_NAV_ICON_BY_HREF[href] ?? LayoutGrid;
}
