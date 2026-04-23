/**
 * Manual entry adapter: accepts a single lead from form payload.
 */

import type { DiscoveryAdapter } from "./types";
import type { RawLeadCandidate } from "../types";

const ADAPTER_NAME = "manual";

export const manualAdapter: DiscoveryAdapter = {
  name: ADAPTER_NAME,
  async discover(context): Promise<RawLeadCandidate[]> {
    const config = context.config ?? {};
    const company_name = String(config.company_name ?? "").trim();
    if (!company_name) return [];

    const candidate: RawLeadCandidate = {
      company_name,
      website: (config.website as string)?.trim() || null,
      domain: normalizeDomain((config.website as string) ?? (config.domain as string)),
      contact_name: (config.contact_name as string)?.trim() || null,
      contact_email: (config.contact_email as string)?.trim() || null,
      phone: (config.phone as string)?.trim() || null,
      source_url: (config.source_url as string)?.trim() || null,
      discovery_method: ADAPTER_NAME,
      product_categories: Array.isArray(config.product_categories)
        ? (config.product_categories as string[])
        : [],
      catalog_signals: Array.isArray(config.catalog_signals) ? (config.catalog_signals as RawLeadCandidate["catalog_signals"]) : [],
      api_signal: Boolean(config.api_signal),
      csv_signal: Boolean(config.csv_signal),
      pdf_catalog_signal: Boolean(config.pdf_catalog_signal),
    };
    return [candidate];
  },
};

function normalizeDomain(urlOrDomain: string | undefined): string | null {
  if (!urlOrDomain || typeof urlOrDomain !== "string") return null;
  const s = urlOrDomain.trim().toLowerCase();
  try {
    if (!s.startsWith("http")) return s.replace(/^www\./, "").split("/")[0] || null;
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return s.replace(/^www\./, "").split("/")[0] || null;
  }
}
