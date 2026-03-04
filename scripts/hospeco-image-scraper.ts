/**
 * Hospeco Image URL Enricher — XLSX (Column A) → XLSX + optional CSV.
 * Searches hospecobrands.com for each item in Column A, extracts product gallery images,
 * appends Image_1..Image_5, Image_URLs (pipe), Hospeco_Product_URL.
 * Uses Playwright (Chromium) for JS-rendered pages.
 */
import { chromium, type Browser, type Page } from "playwright";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import minimist from "minimist";

const DEFAULT_IN = "data/PPV_Hospeco -BF.xlsx";
const DEFAULT_OUT = "data/PPV_Hospeco -BF - with images.xlsx";
const FAILURES_FILENAME = "hospeco-scrape-failures.txt";
const BASE_URL = "https://www.hospecobrands.com";

const SEARCH_PRODUCT_LINK_SELECTORS = [
  "a.product-item-link",
  "a.product-item-photo",
  "li.product-item a[href]",
  ".products-grid a[href]",
  ".search.results a[href]",
  ".products-grid a[href*='/']",
  "a[href*='/products/']",
];

const GALLERY_IMG_SELECTORS = [
  ".fotorama__stage__frame img",
  ".fotorama__nav__frame img",
  ".gallery-placeholder img",
  ".product.media img",
  "img.product-image-photo",
  ".gallery img",
  "[data-gallery-role='gallery-placeholder'] img",
];

const IMG_ATTRS = ["src", "data-src", "data-large-image", "data-zoom-image", "data-original"];
const THUMBNAIL_PATTERNS = /swatch|thumbnail|small_image|cache|small|thumb|_thumb/i;
const MIN_SIZE = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUrl(url: string, base: string): string {
  if (!url || !url.trim()) return "";
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  try {
    return new URL(u, base).href;
  } catch {
    return u;
  }
}

function isHeaderLike(value: string): boolean {
  const v = (value ?? "").toString().trim().toLowerCase();
  return /item|sku|part/.test(v);
}

function shouldFilterThumbnail(url: string, width?: number, height?: number): boolean {
  if (THUMBNAIL_PATTERNS.test(url)) return true;
  if (width != null && width < MIN_SIZE) return true;
  if (height != null && height < MIN_SIZE) return true;
  return false;
}

async function searchProductUrl(
  page: Page,
  item: string,
  baseUrl: string
): Promise<{ url: string } | { error: string }> {
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(item)}`;
  try {
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 15000 });
    await sleep(300);
  } catch (e) {
    return { error: `Navigation failed: ${(e as Error).message}` };
  }
  for (const sel of SEARCH_PRODUCT_LINK_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const href = await el.getAttribute("href");
      await el.dispose();
      if (href && href.includes("/products/")) {
        const productUrl = normalizeUrl(href, baseUrl);
        if (productUrl) return { url: productUrl };
      }
    } catch {
      continue;
    }
  }
  const textMatch = await page.evaluate((itemNum) => {
    const text = document.body.innerText || "";
    return text.includes(itemNum);
  }, item);
  if (textMatch) {
    const href = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/products/"]');
      return (a as HTMLAnchorElement)?.href || "";
    });
    if (href) return { url: href };
  }
  return { error: "No product link found on search page" };
}

async function extractImages(
  page: Page,
  productUrl: string
): Promise<{ urls: string[]; error?: string }> {
  const baseUrl = productUrl.replace(/\/[^/]*$/, "");
  const seen = new Set<string>();
  const urls: string[] = [];

  try {
    await page.goto(productUrl, { waitUntil: "networkidle", timeout: 15000 });
    await sleep(400);
  } catch (e) {
    return { urls: [], error: `Product page load failed: ${(e as Error).message}` };
  }

  for (const sel of GALLERY_IMG_SELECTORS) {
    try {
      const elements = await page.$$(sel);
      for (const el of elements) {
        let src: string | null = null;
        for (const attr of IMG_ATTRS) {
          src = await el.getAttribute(attr);
          if (src) break;
        }
        let w: number | undefined;
        let h: number | undefined;
        try {
          const width = await el.getAttribute("width");
          const height = await el.getAttribute("height");
          if (width) w = parseInt(width, 10);
          if (height) h = parseInt(height, 10);
        } catch {
          // ignore
        }
        if (src) {
          const full = normalizeUrl(src, baseUrl);
          if (full && !seen.has(full) && !shouldFilterThumbnail(full, w, h)) {
            seen.add(full);
            urls.push(full);
          }
        }
        await el.dispose();
      }
    } catch {
      // continue
    }
  }

  const jsonLdImages = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const out: string[] = [];
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent || "{}");
        const arr = Array.isArray(data) ? data : [data];
        for (const o of arr) {
          if (o && o.image) {
            const imgs = Array.isArray(o.image) ? o.image : [o.image];
            for (const img of imgs) {
              const url = typeof img === "string" ? img : img?.url;
              if (url) out.push(url);
            }
          }
        }
      } catch {
        // ignore
      }
    return out;
  });
  for (const u of jsonLdImages) {
    const full = normalizeUrl(u, baseUrl);
    if (full && !seen.has(full) && !THUMBNAIL_PATTERNS.test(full)) {
      seen.add(full);
      urls.push(full);
    }
  }

  const ogImage = await page.$('meta[property="og:image"]');
  if (ogImage) {
    const content = await ogImage.getAttribute("content");
    ogImage.dispose();
    if (content) {
      const full = normalizeUrl(content, baseUrl);
      if (full && !seen.has(full)) {
        seen.add(full);
        urls.push(full);
      }
    }
  }

  return { urls };
}

function dedupeAndOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const n = u.trim();
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out.slice(0, 10);
}

async function processOneItem(
  page: Page,
  item: string,
  delayMs: number
): Promise<{
  productUrl: string;
  urls: string[];
  error?: string;
}> {
  const searchResult = await searchProductUrl(page, item, BASE_URL);
  if ("error" in searchResult) {
    return { productUrl: "", urls: [], error: searchResult.error };
  }
  const { urls, error: extractErr } = await extractImages(page, searchResult.url);
  return {
    productUrl: searchResult.url,
    urls: dedupeAndOrder(urls),
    error: extractErr,
  };
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), {
    string: ["in", "out", "sheet"],
    boolean: ["headless"],
    default: {
      in: DEFAULT_IN,
      out: DEFAULT_OUT,
      sheet: "0",
      headless: true,
      delayMs: 800,
    },
  });
  const inputPath = path.resolve((argv.in as string).replace(/\\/g, "/"));
  const outputPath = path.resolve((argv.out as string).replace(/\\/g, "/"));
  const sheetArg = argv.sheet as string;
  const headless = argv.headless !== false;
  const delayMs = Math.max(200, Number(argv.delayMs) || 800);

  console.log("Hospeco Image URL Enricher (XLSX)");
  console.log("  Input:   ", inputPath);
  console.log("  Output:  ", outputPath);
  console.log("  Sheet:   ", sheetArg);
  console.log("  Delay:   ", delayMs, "ms");
  console.log("  Headless:", headless);

  if (!fs.existsSync(inputPath)) {
    console.error("Input file not found:", inputPath);
    process.exit(1);
  }

  const dataDir = path.dirname(outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const wb = XLSX.readFile(inputPath);
  const sheetIndex = /^\d+$/.test(sheetArg) ? parseInt(sheetArg, 10) : -1;
  const sheetName =
    sheetIndex >= 0 && sheetIndex < wb.SheetNames.length
      ? wb.SheetNames[sheetIndex]
      : wb.SheetNames.includes(sheetArg)
        ? sheetArg
        : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.error("Sheet not found:", sheetArg);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  const skipFirstRow = rows.length > 0 && isHeaderLike((rows[0][0] ?? "").toString());
  const dataStart = skipFirstRow ? 1 : 0;
  const totalItems = rows.length - dataStart;

  const newColHeaders = ["Image_1", "Image_2", "Image_3", "Image_4", "Image_5", "Image_URLs", "Hospeco_Product_URL"];
  let maxCol = 0;
  for (const row of rows) {
    if (row.length > maxCol) maxCol = row.length;
  }
  const imageColStart = maxCol;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    while (row.length < imageColStart + newColHeaders.length) row.push("");
  }
  if (skipFirstRow && rows.length > 0) {
    for (let c = 0; c < newColHeaders.length; c++) rows[0][imageColStart + c] = newColHeaders[c];
  }

  const failures: string[] = [];
  const browser: Browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    const item = (row[0] ?? "").toString().trim();
    if (!item) {
      for (let c = 0; c < newColHeaders.length; c++) row[imageColStart + c] = "";
      notFound++;
      console.log(`[${r - dataStart + 1}/${totalItems}] Skip (empty Column A)`);
      await sleep(delayMs);
      continue;
    }

    let result = await processOneItem(page, item, delayMs);
    if (result.error && result.urls.length === 0) {
      const retry = await processOneItem(page, item, delayMs);
      if (retry.urls.length > 0 || !retry.error) result = retry;
    }

    if (result.error && result.urls.length === 0) {
      failures.push(`${item} | ${result.error}`);
      for (let c = 0; c < newColHeaders.length; c++) row[imageColStart + c] = "";
      errors++;
      console.log(`[${r - dataStart + 1}/${totalItems}] ${item} not found`);
    } else {
      const ordered = result.urls;
      row[imageColStart + 0] = ordered[0] ?? "";
      row[imageColStart + 1] = ordered[1] ?? "";
      row[imageColStart + 2] = ordered[2] ?? "";
      row[imageColStart + 3] = ordered[3] ?? "";
      row[imageColStart + 4] = ordered[4] ?? "";
      row[imageColStart + 5] = ordered.join(" | ");
      row[imageColStart + 6] = result.productUrl ?? "";
      if (ordered.length > 0) found++;
      else notFound++;
      console.log(`[${r - dataStart + 1}/${totalItems}] ${item} found ${ordered.length} images`);
    }

    await sleep(delayMs);
  }

  await browser.close();

  const outSheet = XLSX.utils.aoa_to_sheet(rows);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, outSheet, sheetName);
  XLSX.writeFile(outWb, outputPath);

  const csvPath = outputPath.replace(/\.xlsx?$/i, "") + ".csv";
  const csvContent = XLSX.utils.sheet_to_csv(outSheet);
  fs.writeFileSync(csvPath, csvContent, "utf-8");
  console.log("  CSV copy:", csvPath);

  if (failures.length > 0) {
    const failuresPath = path.join(dataDir, FAILURES_FILENAME);
    fs.writeFileSync(failuresPath, failures.join("\n"), "utf-8");
    console.log("Failures log:", failuresPath);
  }

  console.log("\n--- Summary ---");
  console.log("Total:    ", totalItems);
  console.log("Found:    ", found);
  console.log("Not found:", notFound);
  console.log("Errors:   ", errors);
  console.log("Output:   ", outputPath);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
