/**
 * Demonstrates that an asset URL (direct image) is classified as kind "asset"
 * and returns the expected payload (url, asset.contentType, hints.images).
 * Run: node scripts/test-parse-url-asset.mjs        (unit test only, no network)
 * Run: node scripts/test-parse-url-asset.mjs --live (unit test + live fetch)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
    parseProductUrl,
    classifyProbeResult,
    isAssetContentType,
    isHtmlContentType
} = require('../lib/parse-product-url.js');

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

// --- Unit test: classifyProbeResult with mock asset probe (no network) ---
function testAssetClassificationUnit() {
    console.log('1) Unit test: classifyProbeResult with mock asset probe...');
    const mockProbe = {
        statusCode: 200,
        finalUrl: 'https://example.com/delivery/media/abc123.png',
        contentType: 'image/png',
        body: null
    };
    const result = classifyProbeResult(mockProbe, 'https://example.com/delivery/media/abc123.png');

    assert(result.kind === 'asset', `Expected kind "asset", got "${result.kind}"`);
    assert(result.asset && result.asset.contentType === 'image/png', 'Expected result.asset.contentType');
    assert(Array.isArray(result.hints.images) && result.hints.images.length === 1, 'Expected result.hints.images');
    assert(isAssetContentType('image/png') === true, 'isAssetContentType(image/png) should be true');
    assert(isAssetContentType('application/pdf') === true, 'isAssetContentType(application/pdf) should be true');
    assert(isHtmlContentType('text/html') === true, 'isHtmlContentType(text/html) should be true');
    assert(isAssetContentType('text/html') === false, 'isAssetContentType(text/html) should be false');

    console.log('   Result kind:', result.kind);
    console.log('   Asset contentType:', result.asset.contentType);
    console.log('   hints.images:', result.hints.images);
    console.log('   ✅ Asset URL classified correctly (unit).\n');
}

// --- Live test: real fetch to a public image URL ---
const ASSET_URL = 'https://via.placeholder.com/150';

async function testAssetClassificationLive() {
    console.log('2) Live test: parseProductUrl with real asset URL...');
    console.log('   URL:', ASSET_URL);

    const result = await parseProductUrl(ASSET_URL);

    assert(result.kind === 'asset', `Expected kind "asset", got "${result.kind}"`);
    assert(result.asset && result.asset.contentType, 'Expected result.asset.contentType');
    assert(Array.isArray(result.hints.images) && result.hints.images.length > 0, 'Expected result.hints.images');
    assert(isAssetContentType(result.asset.contentType), 'asset.contentType should be considered asset');

    console.log('   Result kind:', result.kind);
    console.log('   Asset contentType:', result.asset.contentType);
    console.log('   hints.images:', result.hints.images);
    console.log('   ✅ Asset URL classified correctly (live).\n');
}

async function main() {
    const runLive = process.argv.includes('--live');

    testAssetClassificationUnit();

    if (runLive) {
        await testAssetClassificationLive();
    } else {
        console.log('2) Skipping live fetch (use --live to run).');
    }

    console.log('Done.');
}

main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
});
