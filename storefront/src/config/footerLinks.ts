/**
 * Mirrors public/js/footerLinks.js — link targets mapped to Next.js storefront routes.
 */

import { SITE_PHONE_TEL_HREF, SITE_SALES_EMAIL, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";

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
  { label: "All Products", href: "/store" },
  { label: "Industries", href: "/industries" },
  { label: "Resources", href: "/resources" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "B2B Program", href: "/request-pricing" },
];

export const FOOTER_TOP_BRANDS: FooterTopBrand[] = [
  { name: "Hospeco", slug: "hospeco", href: "/store?brand=Hospeco" },
  { name: "Global Glove", slug: "global-glove", href: "/store?brand=Global%20Glove" },
  { name: "Safeko", slug: "safeko", href: "/store?brand=Safeko" },
  { name: "PIP", slug: "pip", href: "/store?brand=PIP" },
  { name: "Growl Gloves", slug: "growl-gloves", href: "/store?brand=Growl%20Gloves" },
  { name: "Semper Guard", slug: "semper-guard", href: "/store?brand=Semper%20Guard" },
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
  "Your trusted source for professional-grade disposable and reusable work gloves. Serving businesses nationwide with quality products from top manufacturers.";
