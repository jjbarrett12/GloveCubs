/**
 * URL import: controlled crawl, extract, store pages + products, run family inference.
 */

import { createHash } from "node:crypto";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { safeFetchHtml } from "@/lib/openclaw/fetch";
import { fetchAndParsePage } from "@/lib/openclaw/fetch-parse";
import { extractFromParsedPage } from "@/lib/openclaw/extract";
import { normalizeToOntology } from "@/lib/openclaw/normalize";
import { groupVariants } from "@/lib/openclaw/group";
import type { NormalizedFamily } from "@/lib/openclaw/normalize";
import type { ParsedProductPage } from "@/lib/openclaw/types";
import {
  validateUrl,
  allowedDomainsFromStartUrl,
  type AllowedDomainConfig,
} from "@/lib/distributor-sync/url-validation";
import { discoverLinks, findPaginationUrls, type DiscoveredLink } from "@/lib/distributor-sync/discover-links";
import { normalizedFamilyToParsedRow } from "./to-parsed-row";
import { computeFamilyInference, FAMILY_GROUPING_CONFIDENCE_THRESHOLD } from "@/lib/variant-family/family-inference";
import { URL_IMPORT_CONFIG } from "./constants";
import { emitUrlImportEvent } from "./telemetry";
import { shouldIngestUrlAsImage } from "./image-ingest-detect";
import { safeFetchImage } from "./safe-fetch-image";
import { extractProductFamilyFromVisionImage } from "./vision-product-extract";
import { enrichHtmlProductFromPage, buildHtmlAiTrimmedContent } from "./html-product-ai-enrich";
import {
  mergeExtractedWithAiPatch,
  shouldCallHtmlAi,
  shouldSkipHtmlAiAllStrong,
} from "./merge-extracted-with-ai";

function simpleHash(str: string): string {
  let h = 0;
  const s = str.slice(0, 50000);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function isLikelyProductPath(pathname: string): boolean {
  return (
    /\/product\//i.test(pathname) ||
    /\/p\//i.test(pathname) ||
    /\/item\//i.test(pathname) ||
    /\/glove/i.test(pathname) ||
    /\/gloves/i.test(pathname) ||
    /\/pd\//i.test(pathname) ||
    /\/prod\//i.test(pathname)
  );
}

export interface CreateUrlImportJobInput {
  supplierId: string;
  supplierName: string;
  startUrl: string;
  allowedDomain: string;
  crawlMode: "single_product" | "category";
  maxPages: number;
  createdBy?: string;
}

export interface CreateUrlImportJobResult {
  jobId: string;
}

export async function createUrlImportJob(
  input: CreateUrlImportJobInput
): Promise<CreateUrlImportJobResult> {
  const allowedDomains = [input.allowedDomain.trim().toLowerCase().replace(/^www\./, "")];
  if (allowedDomains[0] === "") {
    const fromUrl = allowedDomainsFromStartUrl(input.startUrl);
    allowedDomains.push(...fromUrl);
  }
  const err = validateUrl(input.startUrl, allowedDomains);
  if (err) throw new Error(err);

  const supabase = getSupabaseCatalogos(true);
  const maxPages = Math.min(
    Math.max(1, input.maxPages),
    URL_IMPORT_CONFIG.max_pages_cap
  );

  const { data, error } = await supabase
    .from("url_import_jobs")
    .insert({
      supplier_id: input.supplierId,
      supplier_name: input.supplierName,
      start_url: input.startUrl.trim(),
      allowed_domain: input.allowedDomain.trim() || new URL(input.startUrl).hostname,
      crawl_mode: input.crawlMode,
      max_pages: maxPages,
      status: "pending",
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create URL import job: ${error.message}`);
  return { jobId: (data as { id: string }).id };
}

export interface RunUrlImportCrawlResult {
  jobId: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesSkippedUnchanged: number;
  productPagesDetected: number;
  productsExtracted: number;
  familyGroupsInferred: number;
  failedPagesCount: number;
  warnings: string[];
  errors: string[];
}

export async function runUrlImportCrawl(jobId: string): Promise<RunUrlImportCrawlResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: job, error: jobErr } = await supabase
    .from("url_import_jobs")
    .select("id, start_url, allowed_domain, crawl_mode, max_pages")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) throw new Error("URL import job not found");
  const j = job as { id: string; start_url: string; allowed_domain: string; crawl_mode: string; max_pages: number };
  const allowedDomains = [j.allowed_domain.toLowerCase().replace(/^www\./, "")];
  if (allowedDomains[0] === "") allowedDomains[0] = new URL(j.start_url).hostname.replace(/^www\./, "");
  const config: AllowedDomainConfig = { allowedDomains, allowedPathPatterns: [] };
  const err = validateUrl(j.start_url, allowedDomains);
  if (err) throw new Error(err);

  await supabase
    .from("url_import_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);
  emitUrlImportEvent({ type: "crawl_started", jobId, startUrl: j.start_url });

  const warnings: string[] = [];
  const errors: string[] = [];
  let pagesDiscovered = 0;
  let pagesCrawled = 0;
  let pagesSkippedUnchanged = 0;
  let productPagesDetected = 0;
  let productsExtracted = 0;
  let failedPagesCount = 0;
  let aiExtractionsUsed = 0;

  const urlsToCrawl: string[] = [];
  if (j.crawl_mode === "single_product") {
    urlsToCrawl.push(new URL(j.start_url).href);
  } else {
    const startResult = await safeFetchHtml(j.start_url);
    if (!startResult.ok || !startResult.html) {
      errors.push(startResult.error ?? "Failed to fetch start page");
      await supabase
        .from("url_import_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          failed_pages_count: 1,
          warnings: errors,
        })
        .eq("id", jobId);
      emitUrlImportEvent({ type: "crawl_failed", jobId, error: errors[0] ?? "Fetch start page failed" });
      return {
        jobId,
        pagesDiscovered: 0,
        pagesCrawled: 0,
        pagesSkippedUnchanged: 0,
        productPagesDetected: 0,
        productsExtracted: 0,
        familyGroupsInferred: 0,
        failedPagesCount: 1,
        warnings: [],
        errors,
      };
    }
    const allDiscovered = discoverLinks(startResult.html, j.start_url, config);
    const paginationUrls = findPaginationUrls(startResult.html, j.start_url, config);
    const seen = new Set<string>();
    const startNorm = new URL(j.start_url).href;
    seen.add(startNorm);
    const toVisit: DiscoveredLink[] = [];
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
    urlsToCrawl.push(startNorm);
    const productLike = toVisit.filter(
      (l) => l.pageType === "product" || isLikelyProductPath(new URL(l.url).pathname)
    );
    for (const l of productLike.slice(0, j.max_pages - 1)) {
      if (urlsToCrawl.length >= j.max_pages) break;
      const norm = new URL(l.url).href;
      if (!urlsToCrawl.includes(norm)) urlsToCrawl.push(norm);
    }
    pagesDiscovered = urlsToCrawl.length;
  }

  if (j.crawl_mode === "single_product") pagesDiscovered = 1;

  const sourceHost = new URL(j.start_url).hostname.replace(/^www\./, "");

  for (let i = 0; i < urlsToCrawl.length; i++) {
    const url = urlsToCrawl[i];
    await new Promise((r) => setTimeout(r, URL_IMPORT_CONFIG.delay_between_fetches_ms));

    if (await shouldIngestUrlAsImage(url)) {
      const imgFetch = await safeFetchImage(url);
      const contentHash =
        imgFetch.ok && imgFetch.buffer
          ? createHash("sha256").update(imgFetch.buffer).digest("hex").slice(0, 48)
          : null;
      const htmlLen = imgFetch.ok && imgFetch.buffer ? imgFetch.buffer.length : 0;

      const existingPage = await supabase
        .from("url_import_pages")
        .select("id, content_hash, status")
        .eq("job_id", jobId)
        .eq("url", url)
        .maybeSingle();

      let pageId: string;
      if (existingPage.data?.id) {
        pageId = (existingPage.data as { id: string }).id;
        const existingHash = (existingPage.data as { content_hash?: string }).content_hash;
        if (existingHash && contentHash === existingHash) {
          pagesSkippedUnchanged++;
          await supabase
            .from("url_import_pages")
            .update({ status: "skipped", crawled_at: new Date().toISOString() })
            .eq("id", pageId);
          continue;
        }
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("url_import_pages")
          .insert({
            job_id: jobId,
            url,
            page_type: "product",
            status: "pending",
            content_hash: contentHash,
            raw_html_length: htmlLen,
            discovered_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insErr) {
          errors.push(`Page insert ${url}: ${insErr.message}`);
          failedPagesCount++;
          continue;
        }
        pageId = (inserted as { id: string }).id;
      }

      if (!imgFetch.ok || !imgFetch.buffer || !imgFetch.content_type) {
        await supabase
          .from("url_import_pages")
          .update({
            status: "failed",
            error_message: imgFetch.error ?? "Image fetch failed",
            crawled_at: new Date().toISOString(),
          })
          .eq("id", pageId);
        failedPagesCount++;
        continue;
      }

      const b64 = imgFetch.buffer.toString("base64");
      const vision = await extractProductFamilyFromVisionImage({
        sourceUrl: url,
        imageBase64: b64,
        mimeType: imgFetch.content_type,
        sourceHost,
        imageBuffer: imgFetch.buffer,
      });

      if (!vision) {
        warnings.push(
          "Vision extraction unavailable (configure OPENAI_API_KEY) or model failed for image URL."
        );
        await supabase
          .from("url_import_pages")
          .update({
            status: "failed",
            error_message: "Vision extraction failed or OPENAI_API_KEY not set",
            crawled_at: new Date().toISOString(),
          })
          .eq("id", pageId);
        failedPagesCount++;
        continue;
      }

      const normalized = normalizeToOntology(vision.extracted);
      const title =
        [normalized.family_name, normalized.variant_name].find((t) => t && String(t).trim())?.trim() ||
        "Unknown product";
      const parsedPageLight: Record<string, unknown> = {
        url,
        product_title: title,
        images: [url],
        ...(vision.certifications.length
          ? { spec_table: { Certifications: vision.certifications.join("; ") } }
          : {}),
      };
      const parsedRow = normalizedFamilyToParsedRow(normalized, {
        image_urls: [url],
        parsedPage: parsedPageLight,
      });
      const rawPayload: Record<string, unknown> = {
        source_url: url,
        vision_extraction: true,
        certifications: vision.certifications,
      };

      const extractionMethod = "vision_ai" as const;
      const confidence = Math.min(1, Math.max(0, vision.avgConfidence));
      const { error: prodErr } = await supabase.from("url_import_products").insert({
        job_id: jobId,
        page_id: pageId,
        source_url: url,
        raw_payload: rawPayload,
        normalized_payload: parsedRow,
        extraction_method: extractionMethod,
        confidence,
        ai_used: true,
      });
      if (prodErr) {
        const msg = `Product insert: ${prodErr.message}`;
        errors.push(msg);
        await supabase
          .from("url_import_pages")
          .update({
            status: "failed",
            error_message: msg,
            crawled_at: new Date().toISOString(),
          })
          .eq("id", pageId);
        failedPagesCount++;
        continue;
      }

      productsExtracted++;
      aiExtractionsUsed++;

      await supabase
        .from("url_import_pages")
        .update({
          status: "crawled",
          content_hash: contentHash,
          raw_html_length: htmlLen,
          extracted_snapshot: { title, image: true, vision_ai: true },
          crawled_at: new Date().toISOString(),
        })
        .eq("id", pageId);

      pagesCrawled++;
      productPagesDetected++;
      continue;
    }

    const { fetched, parsed } = await fetchAndParsePage(url);
    const html = fetched.html ?? "";
    const contentHash =
      html.length >= URL_IMPORT_CONFIG.min_html_for_hash ? simpleHash(html) : null;

    const existingPage = await supabase
      .from("url_import_pages")
      .select("id, content_hash, status")
      .eq("job_id", jobId)
      .eq("url", url)
      .maybeSingle();

    let pageId: string;
    if (existingPage.data?.id) {
      pageId = (existingPage.data as { id: string }).id;
      const existingHash = (existingPage.data as { content_hash?: string }).content_hash;
      if (existingHash && contentHash === existingHash) {
        pagesSkippedUnchanged++;
        await supabase
          .from("url_import_pages")
          .update({ status: "skipped", crawled_at: new Date().toISOString() })
          .eq("id", pageId);
        continue;
      }
    } else {
      const pageType = parsed && isLikelyProductPath(new URL(url).pathname) ? "product" : "category";
      const { data: inserted, error: insErr } = await supabase
        .from("url_import_pages")
        .insert({
          job_id: jobId,
          url,
          page_type: pageType,
          status: "pending",
          content_hash: contentHash,
          raw_html_length: html.length,
          discovered_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) {
        errors.push(`Page insert ${url}: ${insErr.message}`);
        failedPagesCount++;
        continue;
      }
      pageId = (inserted as { id: string }).id;
    }

    if (!parsed) {
      await supabase
        .from("url_import_pages")
        .update({
          status: "failed",
          error_message: fetched.error ?? "Parse failed",
          crawled_at: new Date().toISOString(),
        })
        .eq("id", pageId);
      failedPagesCount++;
      continue;
    }

    const categoryPath = "";
    const extractedBase = extractFromParsedPage(parsed as ParsedProductPage, sourceHost, categoryPath);
    let mergedExtracted = extractedBase;
    let htmlAiProvenance: Record<string, unknown> | undefined;
    let htmlAiApplied = false;
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    if (
      hasOpenAiKey &&
      shouldCallHtmlAi(extractedBase) &&
      !shouldSkipHtmlAiAllStrong(extractedBase)
    ) {
      const pp = parsed as ParsedProductPage;
      const aiResult = await enrichHtmlProductFromPage({
        sourceUrl: url,
        title: pp.product_title ?? pp.page_title ?? "",
        description: pp.description ?? "",
        specTable: pp.spec_table ?? {},
        trimmedContent: buildHtmlAiTrimmedContent(pp),
      });
      if (aiResult) {
        const { merged, appliedFields, provenance } = mergeExtractedWithAiPatch(
          extractedBase,
          aiResult.patch,
          { model: aiResult.model }
        );
        if (appliedFields.length > 0) {
          mergedExtracted = merged;
          htmlAiApplied = true;
          htmlAiProvenance = provenance as unknown as Record<string, unknown>;
        }
      }
    }

    const normalized = normalizeToOntology(mergedExtracted);
    const variantInput = {
      parsed: parsed as ParsedProductPage,
      normalized,
      sourceSupplier: sourceHost,
      sourceCategoryPath: categoryPath,
      baseExtracted: mergedExtracted,
    };
    const variantRows = groupVariants(variantInput);
    const confidence = htmlAiApplied ? 0.78 : 0.8;
    const extractionMethod = htmlAiApplied ? ("html_ai_enriched" as const) : ("deterministic" as const);
    const aiUsed = htmlAiApplied;

    const rawPayloadExtras: Record<string, unknown> = {
      ...(Array.isArray(parsed.spec_sheet_urls) && parsed.spec_sheet_urls.length > 0
        ? { spec_sheet_urls: parsed.spec_sheet_urls }
        : {}),
      ...(htmlAiApplied && htmlAiProvenance
        ? { extraction_provenance: { html_ai: htmlAiProvenance } }
        : {}),
    };

    for (const vr of variantRows) {
      const normVariant = normalizeToOntology(vr.extracted);
      const imageUrls = (parsed.images ?? []) as string[];
      const parsedRow = normalizedFamilyToParsedRow(normVariant, {
        image_urls: imageUrls,
        parsedPage: parsed as Record<string, unknown>,
      });
      const rawPayload: Record<string, unknown> = {
        ...mergedExtracted,
        source_url: url,
        ...rawPayloadExtras,
      };
      const { error: prodErr } = await supabase.from("url_import_products").insert({
        job_id: jobId,
        page_id: pageId,
        source_url: url,
        raw_payload: rawPayload,
        normalized_payload: parsedRow,
        extraction_method: extractionMethod,
        confidence,
        ai_used: aiUsed,
      });
      if (prodErr) errors.push(`Product insert: ${prodErr.message}`);
      else productsExtracted++;
    }

    if (variantRows.length === 0) {
      const parsedRow = normalizedFamilyToParsedRow(normalized, {
        image_urls: (parsed.images ?? []) as string[],
        parsedPage: parsed as Record<string, unknown>,
      });
      const { error: prodErr } = await supabase.from("url_import_products").insert({
        job_id: jobId,
        page_id: pageId,
        source_url: url,
        raw_payload: {
          ...mergedExtracted,
          source_url: url,
          ...rawPayloadExtras,
        },
        normalized_payload: parsedRow,
        extraction_method: extractionMethod,
        confidence,
        ai_used: aiUsed,
      });
      if (prodErr) errors.push(`Product insert: ${prodErr.message}`);
      else productsExtracted++;
    }

    if (htmlAiApplied) aiExtractionsUsed++;

    await supabase
      .from("url_import_pages")
      .update({
        status: "crawled",
        content_hash: contentHash,
        raw_html_length: html.length,
        extracted_snapshot: { title: parsed.product_title, sku: parsed.sku },
        crawled_at: new Date().toISOString(),
      })
      .eq("id", pageId);

    pagesCrawled++;
    if (parsed && isLikelyProductPath(new URL(url).pathname)) productPagesDetected++;
  }

  const { data: products } = await supabase
    .from("url_import_products")
    .select("id, normalized_payload, normalized_payload->sku")
    .eq("job_id", jobId);
  const productList = (products ?? []) as { id: string; normalized_payload: Record<string, unknown>; sku?: string }[];
  const stagingRows = productList.map((p) => ({
    id: p.id,
    sku: (p.normalized_payload?.sku ?? p.normalized_payload?.supplier_sku ?? p.sku ?? p.id) as string,
    normalized_data: p.normalized_payload,
    attributes: p.normalized_payload,
  }));
  const inferred = await computeFamilyInference(stagingRows, {
    confidenceThreshold: FAMILY_GROUPING_CONFIDENCE_THRESHOLD,
  });
  const familyKeys = new Set<string>();
  for (const row of inferred) {
    if (row.family_group_key) familyKeys.add(row.family_group_key);
    await supabase
      .from("url_import_products")
      .update({
        inferred_base_sku: row.inferred_base_sku || null,
        inferred_size: row.inferred_size || null,
        family_group_key: row.family_group_key,
        grouping_confidence: row.grouping_confidence,
      })
      .eq("id", row.id);
  }
  const variantsInferred = inferred.filter((r) => r.inferred_size).length;

  await supabase
    .from("url_import_jobs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      pages_discovered: pagesDiscovered,
      pages_crawled: pagesCrawled,
      pages_skipped_unchanged: pagesSkippedUnchanged,
      product_pages_detected: productPagesDetected,
      products_extracted: productsExtracted,
      ai_extractions_used: aiExtractionsUsed,
      family_groups_inferred: familyKeys.size,
      variants_inferred: variantsInferred,
      failed_pages_count: failedPagesCount,
      warnings,
    })
    .eq("id", jobId);

  return {
    jobId,
    pagesDiscovered,
    pagesCrawled,
    pagesSkippedUnchanged,
    productPagesDetected,
    productsExtracted,
    familyGroupsInferred: familyKeys.size,
    failedPagesCount,
    warnings,
    errors,
  };
}
