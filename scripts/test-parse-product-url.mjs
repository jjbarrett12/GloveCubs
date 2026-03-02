/**
 * Demonstrates that an asset URL (direct image/media) is classified as kind === "asset".
 * Run: node scripts/test-parse-product-url.mjs
 * Uses a public image URL; no auth required.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parseProductUrl } = require('../lib/parse-product-url.js');

const ASSET_URL = 'https://via.placeholder.com/150';

async function main() {
  console.log('Testing parse-product-url with asset URL:', ASSET_URL);
  try {
    const result = await parseProductUrl(ASSET_URL);
    console.log('Result:', JSON.stringify({ kind: result.kind, asset: result.asset, hintsImages: result.hints?.images?.length }, null, 2));
    if (result.kind !== 'asset') {
      console.error('FAIL: expected kind === "asset", got', result.kind);
      process.exit(1);
    }
    if (!result.asset || !result.asset.contentType) {
      console.error('FAIL: expected result.asset.contentType');
      process.exit(1);
    }
    if (!result.hints?.images?.length) {
      console.error('FAIL: expected result.hints.images to have at least one URL');
      process.exit(1);
    }
    console.log('PASS: Asset URL classified correctly (kind=asset, hints.images present).');
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }
}

main();
