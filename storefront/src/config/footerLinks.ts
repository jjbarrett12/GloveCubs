/**
 * Mirrors public/js/footerLinks.js — link targets mapped to Next.js storefront routes.
 */

import { SITE_PHONE_TEL_HREF, SITE_SALES_EMAIL, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";

export type FooterQuickLink = {
  label: string;
  href: string;
};

export type FooterTopBrand = {
  name: string;
  slug: string;
  href: string;
};

export type FooterContactLink = {
  type: "phone" | "email" | "address" | "hours";
  label: string;
  href: string | null;
  external?: boolean;
};

export type FooterSocialLink = {
  label: string;
  href: string;
};

export const FOOTER_QUICK_LINKS: FooterQuickLink[] = [
  { label: "Request pricing", href: "/request-pricing" },
  { label: "Quote request cart", href: "/quote-cart" },
  { label: "Invoice review", href: "/invoice-savings" },
  { label: "Catalog", href: "/store" },
  { label: "Industries", href: "/industries" },
  { label: "Glove Science", href: "/glove-science" },
  { label: "Resources", href: "/resources" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

export const FOOTER_TOP_BRANDS: FooterTopBrand[] = [
  { name: "Hospeco", slug: "hospeco", href: getStoreHrefForBrandDisplayNameSearch("Hospeco") },
  { name: "Global Glove", slug: "global-glove", href: getStoreHrefForBrandDisplayNameSearch("Global Glove") },
  { name: "Safeko", slug: "safeko", href: getStoreHrefForBrandDisplayNameSearch("Safeko") },
  { name: "PIP", slug: "pip", href: getStoreHrefForBrandDisplayNameSearch("PIP") },
  { name: "Growl Gloves", slug: "growl-gloves", href: getStoreHrefForBrandDisplayNameSearch("Growl Gloves") },
  { name: "Semper Guard", slug: "semper-guard", href: getStoreHrefForBrandDisplayNameSearch("Semper Guard") },
];

export const FOOTER_CONTACT_LINKS: FooterContactLink[] = [
  { type: "phone", label: "1-800-GLOVECUBS", href: SITE_PHONE_TEL_HREF },
  { type: "email", label: SITE_SALES_EMAIL, href: SITE_SALES_MAILTO_HREF },
  {
    type: "address",
    label: "Salt Lake City, UT",
    href: "https://www.google.com/maps/search/?api=1&query=Salt+Lake+City+UT",
    external: true,
  },
  { type: "hours", label: "Mon-Fri: 8AM - 6PM MST", href: null },
];

export const FOOTER_SOCIAL_LINKS: FooterSocialLink[] = [
  { label: "Facebook", href: "https://facebook.com/glovecubs" },
  { label: "Twitter", href: "https://twitter.com/glovecubs" },
  { label: "LinkedIn", href: "https://linkedin.com/company/glovecubs" },
  { label: "Instagram", href: "https://instagram.com/glovecubs" },
];

export const FOOTER_TAGLINE =
  "Quote-first B2B glove procurement—governed catalog, invoice review, and formal pricing before fulfillment.";

/** Footer trust strip — procurement paths (not card checkout). */
export const FOOTER_PROCUREMENT_TRUST_SIGNALS: { label: string; href: string }[] = [
  { label: "Case & pallet quotes", href: "/request-pricing" },
  { label: "Net terms (approved accounts)", href: "/request-pricing" },
  { label: "Invoice review", href: "/invoice-savings" },
  { label: "Quote request cart", href: "/quote-cart" },
  { label: "Business pricing support", href: "/request-pricing" },
];
