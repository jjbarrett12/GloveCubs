/**
 * Discovery orchestrator: run an adapter, persist leads, log events, score.
 */

import { getAdapter } from "./adapters";
import type { RawLeadCandidate } from "./types";
import { computeLeadScore } from "./scoring";
import { createLead, leadExistsByDomain } from "./leads";
import { createRun, completeRun, logEvent } from "./runs";
import { getSupabaseCatalogos } from "@/lib/db/client";

function normalizeDomain(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain || typeof urlOrDomain !== "string") return null;
  const s = urlOrDomain.trim().toLowerCase();
  try {
    if (!s.startsWith("http")) return s.replace(/^www\./, "").split("/")[0] || null;
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return s.replace(/^www\./, "").split("/")[0] || null;
  }
}

function candidateToInsert(c: RawLeadCandidate): Parameters<typeof createLead>[0] {
  const domain = normalizeDomain(c.domain ?? c.website);
  const score = computeLeadScore(c);
  return {
    company_name: c.company_name.trim(),
    website: c.website?.trim() || null,
    domain,
    source_url: c.source_url?.trim() || null,
    discovery_method: c.discovery_method,
    product_categories: c.product_categories ?? [],
    catalog_signals: c.catalog_signals ?? [],
    api_signal: c.api_signal ?? false,
    csv_signal: c.csv_signal ?? false,
    pdf_catalog_signal: c.pdf_catalog_signal ?? false,
    lead_score: score,
    status: "new",
  };
}

/**
 * Run discovery with the given adapter. Creates run, streams candidates, dedupes by domain, inserts leads, logs events.
 */
export async function runDiscovery(
  adapterName: string,
  config: Record<string, unknown> = {}
): Promise<{ runId: string; leadsCreated: number; duplicateSkipped: number }> {
  const adapter = getAdapter(adapterName);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterName}`);

  const { id: runId } = await createRun(adapterName, config);
  let leadsCreated = 0;
  let duplicateSkipped = 0;

  try {
    const candidates = await adapter.discover({ runId, config });
    const list = Array.isArray(candidates) ? candidates : [];
    for (const c of list) {
      const domain = normalizeDomain(c.domain ?? c.website);
      if (domain) {
        const exists = await leadExistsByDomain(domain);
        if (exists) {
          duplicateSkipped++;
          await logEvent(runId, "duplicate_skipped", { domain, company_name: c.company_name });
          continue;
        }
      }

      const insert = candidateToInsert(c);
      const result = await createLead(insert);
      if (result) {
        leadsCreated++;
        const supabase = getSupabaseCatalogos(true);
        if (c.contact_name || c.contact_email || c.phone) {
          await supabase.from("supplier_lead_contacts").insert({
            supplier_lead_id: result.id,
            contact_name: c.contact_name ?? null,
            contact_email: c.contact_email ?? null,
            phone: c.phone ?? null,
            is_primary: true,
          });
        }
        await logEvent(runId, "lead_created", { company_name: c.company_name, domain }, result.id);
      } else {
        duplicateSkipped++;
        await logEvent(runId, "duplicate_skipped", { domain: insert.domain, company_name: c.company_name });
      }
    }

    await completeRun(runId, "completed", { leads_created: leadsCreated, leads_duplicate_skipped: duplicateSkipped });
    return { runId, leadsCreated, duplicateSkipped };
  } catch (err) {
    await completeRun(
      runId,
      "failed",
      { leads_created: leadsCreated, leads_duplicate_skipped: duplicateSkipped },
      err instanceof Error ? err.message : String(err)
    );
    await logEvent(runId, "error", { message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
