/**
 * Distributor sync crawl service: create source/job, fetch start page, discover links,
 * store pages, run product extraction on product-type pages, insert staging rows.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { safeFetchHtml } from "@/lib/openclaw/fetch";
import { fetchAndParsePage } from "@/lib/openclaw/fetch-parse";
import { extractFromParsedPage } from "@/lib/openclaw/extract";
import { normalizeToOntology } from "@/lib/openclaw/normalize";
import { groupVariants } from "@/lib/openclaw/group";
import {
  validateUrl,
  allowedDomainsFromStartUrl,
  type AllowedDomainConfig,
} from "./url-validation";
import { discoverLinks, findPaginationUrls, type DiscoveredLink } from "./discover-links";
import { buildStagingRow } from "./staging-mapper";
import { DISTRIBUTOR_SYNC_CONFIG } from "./constants";
import type { CreateCrawlInput, CreateCrawlResult } from "./types";

export async function getOrCreateDistributorSource(
  name: string,
  rootUrl: string,
  allowedPathPatterns: string[] = [],
  allowedDomainsOverride?: string[]
): Promise<{ id: string; allowedDomains: string[] }> {
  const fromUrl = allowedDomainsFromStartUrl(rootUrl);
  const allowedDomains = (allowedDomainsOverride?.length ? allowedDomainsOverride : fromUrl).map((d) =>
    d.toLowerCase().trim().replace(/^www\./, "")
  );
  if (allowedDomains.length === 0) {
    allowedDomains.push(...fromUrl);
  }
  const err = validateUrl(rootUrl, allowedDomains);
  if (err) throw new Error(err);

  const supabase = getSupabaseCatalogos(true);
  const normalizedRoot = rootUrl.trim().replace(/\/+$/, "") || "/";

  const { data: existing } = await supabase
    .from("distributor_sources")
    .select("id, allowed_domains")
    .eq("root_url", normalizedRoot)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return {
      id: existing.id as string,
      allowedDomains: (existing.allowed_domains as string[]) ?? allowedDomains,
    };
  }

  const { data: inserted, error } = await supabase
    .from("distributor_sources")
    .insert({
      name,
      root_url: normalizedRoot,
      source_type: "website",
      allowed_domains: allowedDomains,
      allowed_path_patterns: allowedPathPatterns,
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create distributor source: ${error.message}`);
  return {
    id: (inserted as { id: string }).id,
    allowedDomains,
  };
}

export async function createCrawlJob(
  distributorSourceId: string,
  startUrl: string
): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("distributor_crawl_jobs")
    .insert({
      distributor_source_id: distributorSourceId,
      start_url: startUrl.trim(),
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create crawl job: ${error.message}`);
  return (data as { id: string }).id;
}

export async function runCrawl(input: CreateCrawlInput): Promise<CreateCrawlResult> {
  const allowedPathPatterns = input.allowed_path_patterns ?? [];
  const allowedDomainsOverride = input.allowed_domain
    ? [input.allowed_domain.trim().toLowerCase().replace(/^www\./, "")]
    : undefined;
  const { id: sourceId, allowedDomains } = await getOrCreateDistributorSource(
    input.distributor_name,
    input.start_url,
    allowedPathPatterns,
    allowedDomainsOverride
  );

  const err = validateUrl(input.start_url, allowedDomains);
  if (err) throw new Error(err);

  const jobId = await createCrawlJob(sourceId, input.start_url);
  const supabase = getSupabaseCatalogos(true);

  await supabase
    .from("distributor_crawl_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const config: AllowedDomainConfig = {
    allowedDomains,
    allowedPathPatterns,
  };

  const errors: string[] = [];
  let pagesDiscovered = 0;
  let productPagesDiscovered = 0;
  let productsExtracted = 0;

  try {
    const startResult = await safeFetchHtml(input.start_url);
    if (!startResult.ok || !startResult.html) {
      errors.push(startResult.error ?? "Failed to fetch start page");
      await supabase
        .from("distributor_crawl_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          errors_count: errors.length,
        })
        .eq("id", jobId);
      return {
        jobId,
        sourceId,
        startUrl: input.start_url,
        pagesDiscovered: 0,
        productPagesDiscovered: 0,
        productsExtracted: 0,
        errors,
      };
    }

    const allDiscovered = discoverLinks(startResult.html, input.start_url, config);
    const paginationUrls = findPaginationUrls(startResult.html, input.start_url, config);
    const seen = new Set<string>();
    const toVisit: DiscoveredLink[] = [];
    const startNorm = new URL(input.start_url).href;
    seen.add(startNorm);
    for (const link of allDiscovered) {
      const norm = new URL(link.url).href;
      if (!seen.has(norm)) {
        seen.add(norm);
        toVisit.push(link);
      }
    }
    for (const u of paginationUrls.slice(0, 5)) {
      const norm = new URL(u).href;
      if (!seen.has(norm)) {
        seen.add(norm);
        toVisit.push({ url: norm, categoryPath: "", pageType: "unknown" });
      }
    }

    const pageRows: Array<{
      crawl_job_id: string;
      url: string;
      page_type: "category" | "product" | "unknown";
      status: "pending" | "crawled" | "failed" | "skipped";
      extracted_snapshot: Record<string, unknown> | null;
      discovered_at: string;
      crawled_at: string | null;
    }> = [
      {
        crawl_job_id: jobId,
        url: startNorm,
        page_type: isLikelyProduct(startNorm) ? "product" : "category",
        status: "crawled",
        extracted_snapshot: null,
        discovered_at: new Date().toISOString(),
        crawled_at: new Date().toISOString(),
      },
    ];

    const productUrls: Array<{ url: string; categoryPath: string; pageType: "product" | "category" | "unknown" }> = [];
    for (const link of toVisit.slice(0, DISTRIBUTOR_SYNC_CONFIG.max_urls_first_wave)) {
      pageRows.push({
        crawl_job_id: jobId,
        url: new URL(link.url).href,
        page_type: link.pageType,
        status: "pending",
        extracted_snapshot: null,
        discovered_at: new Date().toISOString(),
        crawled_at: null,
      });
      if (link.pageType === "product") productUrls.push(link);
    }

    const { error: pagesErr } = await supabase.from("distributor_crawl_pages").insert(pageRows);
    if (pagesErr) {
      errors.push(`Failed to insert pages: ${pagesErr.message}`);
    } else {
      pagesDiscovered = pageRows.length;
    }

    const productToCrawl = productUrls
      .map((p) => p.url)
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, DISTRIBUTOR_SYNC_CONFIG.max_pages_to_fetch);

    productPagesDiscovered = productToCrawl.length;
    const sourceSupplier = new URL(input.start_url).hostname.replace(/^www\./, "");

    for (let i = 0; i < productToCrawl.length; i++) {
      const url = productToCrawl[i];
      const meta = productUrls.find((p) => p.url === url);
      const categoryPath = meta?.categoryPath ?? "";

      await new Promise((r) => setTimeout(r, DISTRIBUTOR_SYNC_CONFIG.delay_between_fetches_ms));
      const { fetched, parsed } = await fetchAndParsePage(url);

      await supabase
        .from("distributor_crawl_pages")
        .update({
          status: parsed ? "crawled" : "failed",
          crawled_at: new Date().toISOString(),
          extracted_snapshot: parsed ? { title: parsed.product_title, sku: parsed.sku } : null,
        })
        .eq("crawl_job_id", jobId)
        .eq("url", url);

      if (!parsed) {
        errors.push(`Parse failed: ${url}`);
        continue;
      }

      const extracted = extractFromParsedPage(parsed, sourceSupplier, categoryPath);
      const normalized = normalizeToOntology(extracted);
      const variantInput = {
        parsed,
        normalized,
        sourceSupplier,
        sourceCategoryPath: categoryPath,
      };
      const variantRows = groupVariants(variantInput);

      for (const vr of variantRows) {
        const normVariant = normalizeToOntology(vr.extracted);
        const imageUrls = (parsed.images ?? []) as string[];
        const row = buildStagingRow(jobId, sourceId, normVariant, vr.extracted, imageUrls);
        const { error: insErr } = await supabase.from("distributor_product_staging").insert(row);
        if (insErr) errors.push(`Staging insert: ${insErr.message}`);
        else productsExtracted += 1;
      }
    }

    await supabase
      .from("distributor_crawl_jobs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        pages_discovered: pagesDiscovered,
        product_pages_discovered: productPagesDiscovered,
        products_extracted: productsExtracted,
        errors_count: errors.length,
      })
      .eq("id", jobId);

    await supabase
      .from("distributor_sources")
      .update({ last_crawled_at: new Date().toISOString() })
      .eq("id", sourceId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    await supabase
      .from("distributor_crawl_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        errors_count: errors.length,
      })
      .eq("id", jobId);
  }

  return {
    jobId,
    sourceId,
    startUrl: input.start_url,
    pagesDiscovered,
    productPagesDiscovered,
    productsExtracted,
    errors,
  };
}

function isLikelyProduct(pathOrUrl: string): boolean {
  try {
    const path = new URL(pathOrUrl).pathname;
    return /\/product\//i.test(path) || /\/p\//i.test(path) || /\/item\//i.test(path) || /\/glove/i.test(path) || /\/pd\//i.test(path);
  } catch {
    return false;
  }
}
