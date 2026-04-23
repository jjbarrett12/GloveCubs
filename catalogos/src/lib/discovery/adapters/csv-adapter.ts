/**
 * CSV import adapter: parses CSV rows into raw candidates.
 * Config: { csv_text: string } or { columns: { company_name, website, ... } } for column mapping.
 * Stub: returns empty until column mapping and parsing are implemented.
 */

import type { DiscoveryAdapter } from "./types";
import type { RawLeadCandidate } from "../types";

const ADAPTER_NAME = "csv_import";

export const csvAdapter: DiscoveryAdapter = {
  name: ADAPTER_NAME,
  async discover(context): Promise<RawLeadCandidate[]> {
    const config = context.config ?? {};
    const csvText = typeof config.csv_text === "string" ? config.csv_text.trim() : "";
    if (!csvText) return [];

    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    const candidates: RawLeadCandidate[] = [];
    const col = (key: string) => {
      const i = headers.findIndex((h) => h.toLowerCase().replace(/\s+/g, "_") === key);
      return i >= 0 ? i : -1;
    };
    const companyIdx = col("company_name") >= 0 ? col("company_name") : col("company") >= 0 ? col("company") : 0;
    const websiteIdx = col("website") >= 0 ? col("website") : col("url") >= 0 ? col("url") : -1;
    const emailIdx = col("contact_email") >= 0 ? col("contact_email") : col("email") >= 0 ? col("email") : -1;
    const nameIdx = col("contact_name") >= 0 ? col("contact_name") : col("name") >= 0 ? col("name") : -1;
    const phoneIdx = col("phone") >= 0 ? col("phone") : -1;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const company_name = (values[companyIdx] ?? "").trim();
      if (!company_name) continue;
      candidates.push({
        company_name,
        website: websiteIdx >= 0 ? (values[websiteIdx] ?? "").trim() || null : null,
        domain: websiteIdx >= 0 ? normalizeDomain((values[websiteIdx] ?? "").trim()) : null,
        contact_name: nameIdx >= 0 ? (values[nameIdx] ?? "").trim() || null : null,
        contact_email: emailIdx >= 0 ? (values[emailIdx] ?? "").trim() || null : null,
        phone: phoneIdx >= 0 ? (values[phoneIdx] ?? "").trim() || null : null,
        source_url: null,
        discovery_method: ADAPTER_NAME,
        product_categories: [],
        api_signal: false,
        csv_signal: true,
        pdf_catalog_signal: false,
      });
    }
    return candidates;
  },
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || c === "\t") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeDomain(urlOrDomain: string): string | null {
  if (!urlOrDomain) return null;
  const s = urlOrDomain.trim().toLowerCase();
  try {
    if (!s.startsWith("http")) return s.replace(/^www\./, "").split("/")[0] || null;
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return s.replace(/^www\./, "").split("/")[0] || null;
  }
}
