/**
 * Test harness: run URL import pipeline and log attributes + warnings.
 * Usage: node scripts/test-import-attributes.cjs [url1] [url2] ...
 * If no URLs given, uses 5 sample URLs (replace SAMPLE_URLS with real URLs to test).
 */

const { parseProductUrl } = require('../lib/parse-product-url');
const { normalizeProduct, inferAttributesHeuristic } = require('../lib/productImport/normalizeProduct');
const { inferAttributesAI, mergeAttributes, mergeWarnings, isConfigured: inferAiConfigured } = require('../lib/productImport/inferAttributesAI');

const SAMPLE_URLS = [
  'https://www.hospecobrands.com/products/koda-nitrile-pf-exm-glv-chem-fen-derm-black-10-90-2x-gl-ncf235bkfxx',
  'https://example.com/gloves/nitrile-powder-free',
  'https://example.com/industrial-gloves',
  'https://example.com/food-service-gloves',
  'https://example.com/medical-exam-gloves',
];

async function runPipeline(url) {
  console.log('\n--- URL:', url);
  try {
    const payload = await parseProductUrl(url);
    if (payload.kind !== 'page' || !payload.extracted) {
      console.log('  Result: not a page or no extracted data');
      return { url, ok: false, error: 'not a page' };
    }
    const extracted = payload.extracted;
    const specText = extracted.specText || '';
    const bullets = extracted.bullets || [];
    console.log('  specText length:', specText.length, '| bullets:', bullets.length);

    const hints = payload.hints || {};
    const draft = normalizeProduct(extracted, hints, specText, bullets);
    console.log('  Heuristic attributes:', JSON.stringify(draft.attributes, null, 2));
    console.log('  Warnings:', draft.warnings || []);

    let attributes = draft.attributes || {};
    let warnings = draft.warnings || [];
    if (inferAiConfigured()) {
      const aiResult = await inferAttributesAI({
        name: (extracted.meta && extracted.meta.title) || '',
        description: (extracted.meta && extracted.meta.description) || '',
        specText,
        bullets,
      });
      if (aiResult) {
        attributes = mergeAttributes(attributes, aiResult);
        warnings = mergeWarnings(warnings, aiResult.warnings);
        console.log('  After AI merge - attributes:', JSON.stringify(attributes, null, 2));
        console.log('  After AI merge - warnings:', warnings);
      }
    } else {
      console.log('  (OPENAI_API_KEY not set; heuristic only)');
    }
    return { url, ok: true, attributes, warnings };
  } catch (err) {
    console.log('  Error:', err.message);
    return { url, ok: false, error: err.message };
  }
}

const urls = process.argv.slice(2).filter(Boolean).length ? process.argv.slice(2) : SAMPLE_URLS.slice(0, 5);
console.log('Testing', urls.length, 'URL(s). Attributes use controlled vocabulary only.\n');

(async () => {
  const results = [];
  for (const url of urls) {
    const r = await runPipeline(url);
    results.push(r);
  }
  console.log('\n=== Summary ===');
  const ok = results.filter((r) => r.ok);
  console.log('OK:', ok.length, '/', results.length);
  ok.forEach((r) => {
    const indCount = (r.attributes && r.attributes.industries && r.attributes.industries.length) || 0;
    console.log('  ', r.url.slice(0, 60) + (r.url.length > 60 ? '...' : ''), '| industries:', indCount, '| attribute keys:', r.attributes ? Object.keys(r.attributes).length : 0);
  });
})();
