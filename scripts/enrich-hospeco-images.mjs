#!/usr/bin/env node
/**
 * Enriches a CSV with Hospeco product image URLs from hospecobrands.com.
 * Validates URLs via HEAD; deduplicates by code; concurrency limit 8, 50ms delay.
 *
 * Usage:
 *   node scripts/enrich-hospeco-images.mjs [input.csv] [output.csv]
 * Default: input = glovecubs-approved-combined-2026-03-02.csv
 *          output = glovecubs-approved-with-images.csv
 */

import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { stringify } from 'csv-stringify/sync';

const GET_IMAGE_BASE = 'https://www.hospecobrands.com/Admin/Public/GetImage.ashx';
const VARIANTS = ['.jpg', '_2.jpg', '.png', '_2.png'];
const CONCURRENCY = 8;
const DELAY_MS = 50;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Build Hospeco GetImage.ashx URL for a code and file variant.
 * Pattern: ...GetImage.ashx?format=webp&image=/Files/Images/Products/<CODE><variant>&width=800
 * @param {string} code - Product code (no path, no extension)
 * @param {string} variant - e.g. ".jpg", "_2.jpg"
 */
function buildImageUrl(code, variant) {
  if (!code || !variant) return '';
  const imagePath = `/Files/Images/Products/${String(code).trim()}${variant}`;
  return `${GET_IMAGE_BASE}?format=webp&image=${encodeURIComponent(imagePath)}&width=800`;
}

/**
 * HEAD request; returns true only if status 200. Fails gracefully.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res && res.ok === true;
  } catch {
    return false;
  }
}

/**
 * Extract and normalize Hospeco code from row.
 * Prefer "Unnamed: 6", else derive from sku (strip leading GLV-).
 * Trim, strip ® and similar, collapse whitespace.
 */
function normalizeCode(row) {
  if (!row || typeof row !== 'object') return '';
  let code = (row['Unnamed: 6'] ?? row['sku'] ?? '').toString().trim();
  if (!code && row.sku) code = String(row.sku).trim();
  code = code.replace(/\s+/g, ' ').trim();
  code = code.replace(/\u00AE|\u2122/g, '').trim(); // ® ™
  if (code.toUpperCase().startsWith('GLV-')) code = code.slice(4).trim();
  return code;
}

/**
 * Delay helper.
 */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Validate one code: try each variant in order; first 200 OK wins.
 * @returns {Promise<string|null>} URL or null
 */
async function validateOneCode(code) {
  for (const variant of VARIANTS) {
    const url = buildImageUrl(code, variant);
    if (await validateUrl(url)) return url;
    await delay(DELAY_MS);
  }
  return null;
}

/**
 * Run validation for unique codes with concurrency limit (8) and delay between batches.
 * Returns Map<code, url> for codes that got a valid URL.
 */
async function validateCodesWithLimit(uniqueCodes) {
  const results = new Map();
  const codes = [...uniqueCodes].filter(Boolean);
  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const chunk = codes.slice(i, i + CONCURRENCY);
    const pairs = await Promise.all(
      chunk.map(async (code) => {
        const url = await validateOneCode(code).catch(() => null);
        return [code, url];
      })
    );
    pairs.forEach(([code, url]) => {
      if (url) results.set(code, url);
    });
    if (i + CONCURRENCY < codes.length) await delay(DELAY_MS);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function readCsv(filePath) {
  const rows = [];
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf8' })
      .on('error', reject)
      .pipe(csv({ skipLines: 0 }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function getHeaders(rows) {
  if (!rows.length) return [];
  const first = rows[0];
  const headers = Object.keys(first);
  if (!headers.includes('image_url')) headers.push('image_url');
  return headers;
}

async function main() {
  const defaultInput = path.join(process.cwd(), 'glovecubs-approved-combined-2026-03-02.csv');
  const defaultOutput = path.join(process.cwd(), 'glovecubs-approved-with-images.csv');

  const inputPath = path.resolve(process.argv[2] || defaultInput);
  const outputPath = path.resolve(process.argv[3] || defaultOutput);

  if (!fs.existsSync(inputPath)) {
    console.error('Input file not found:', inputPath);
    process.exit(1);
  }

  let rows;
  try {
    rows = await readCsv(inputPath);
  } catch (err) {
    console.error('Failed to read CSV:', err.message);
    process.exit(1);
  }

  const totalRows = rows.length;
  const headers = getHeaders(rows);

  // Ensure every row has image_url key
  rows.forEach((row) => {
    if (!Object.prototype.hasOwnProperty.call(row, 'image_url')) row.image_url = '';
    else if (row.image_url != null) row.image_url = String(row.image_url).trim();
  });

  const alreadyHadImage = rows.filter((r) => (r.image_url || '').trim()).length;
  const toEnrich = rows.filter((r) => !(r.image_url || '').trim());

  const codeToRowIndices = new Map();
  toEnrich.forEach((row, index) => {
    const code = normalizeCode(row);
    if (!code) return;
    if (!codeToRowIndices.has(code)) codeToRowIndices.set(code, []);
    codeToRowIndices.get(code).push(index);
  });

  const uniqueCodes = [...codeToRowIndices.keys()];
  const uniqueCodesTested = uniqueCodes.length;

  let codeToUrl;
  try {
    codeToUrl = await validateCodesWithLimit(uniqueCodes);
  } catch (err) {
    console.error('Validation error:', err.message);
    process.exit(1);
  }

  let imageFilledCount = 0;
  const missing = [];

  toEnrich.forEach((row) => {
    const code = normalizeCode(row);
    if (!code) return;
    const url = codeToUrl.get(code);
    if (url) {
      row.image_url = url;
      imageFilledCount++;
    } else {
      const lineNumber = rows.indexOf(row) + 2; // 1-based line (header = 1)
      missing.push({ code, rowIndex: lineNumber, sku: (row.sku || '').toString().trim() });
    }
  });

  // Build output rows in same order, with headers
  const outputRows = rows.map((row) => {
    const out = {};
    headers.forEach((h) => {
      out[h] = row[h] != null ? String(row[h]) : '';
    });
    return out;
  });

  try {
    const csvContent = stringify(outputRows, { header: true, columns: headers });
    fs.writeFileSync(outputPath, csvContent, 'utf8');
  } catch (err) {
    console.error('Failed to write CSV:', err.message);
    process.exit(1);
  }

  const missingPath = outputPath.replace(/(\.csv)?$/i, '.missing.json');
  try {
    fs.writeFileSync(missingPath, JSON.stringify(missing, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write missing report:', err.message);
  }

  const missingCount = missing.length;

  console.log('\n--- Enrich summary ---');
  console.log('Total rows:           ', totalRows);
  console.log('Image filled:         ', imageFilledCount);
  console.log('Already had image:    ', alreadyHadImage);
  console.log('Missing:              ', missingCount);
  console.log('Unique codes tested:  ', uniqueCodesTested);
  console.log('Output CSV:           ', outputPath);
  console.log('Missing report:       ', missingPath);
  console.log('');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
