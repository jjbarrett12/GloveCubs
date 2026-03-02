/**
 * AI normalization of extracted product page data into a strict schema.
 * Env: OPENAI_API_KEY (required), OPENAI_MODEL or AI_MODEL (optional, default gpt-4o-mini).
 * Never hallucinate URLs; only return image_urls that appear in the extracted data.
 */

const DEFAULT_MODEL = 'gpt-4o-mini';

const OUTPUT_SCHEMA = {
    sku: 'string or null',
    name: 'string or null',
    brand: 'string or null',
    description: 'string or null',
    image_urls: 'array of strings (only from extracted.meta og:image, jsonld image, hints.image_urls)',
    color: 'string or null',
    thickness: 'string or null (e.g. "4 mil", "6 mil")',
    thickness_mil: 'string or null (e.g. "4", "6")',
    material: 'string or null',
    sizes: 'string or null (comma-separated if multiple)',
    pack_qty: 'number or null',
    case_qty: 'number or null',
    category: 'string or null (e.g. Disposable Gloves, Reusable Work Gloves)',
    subcategory: 'string or null'
};

/** Build allowlist of image URLs from extracted + hints. AI may only choose from these. */
function buildAllowedImageUrls(extracted, hints) {
    const set = new Set();
    const meta = (extracted && extracted.meta) || {};
    if (meta.image && typeof meta.image === 'string' && meta.image.trim().startsWith('http')) set.add(meta.image.trim());
    const jsonld = Array.isArray(extracted && extracted.jsonld) ? extracted.jsonld : [];
    for (const o of jsonld) {
        if (!o || !o.image) continue;
        const img = typeof o.image === 'string' ? o.image : (o.image && o.image.url) ? o.image.url : (Array.isArray(o.image) && o.image[0]) ? (typeof o.image[0] === 'string' ? o.image[0] : o.image[0].url) : null;
        if (img && typeof img === 'string' && img.trim().startsWith('http')) set.add(img.trim());
    }
    const fromHints = (hints && (hints.image_urls || hints.images)) || [];
    fromHints.forEach((u) => { if (typeof u === 'string' && u.trim().startsWith('http')) set.add(u.trim()); });
    return Array.from(set);
}

function getModel() {
    return process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;
}

function isConfigured() {
    return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

/**
 * @param {object} extracted - { jsonld, meta: { title, image, description }, text }
 * @param {object} [options] - { hints: { image_urls, images } } — allowed image URLs (AI must not invent)
 * @returns {Promise<object>} Normalized product draft; image_urls filtered to allowlist only.
 */
async function aiNormalizeProduct(extracted, options) {
    const apiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set. Add it to .env to use AI normalization.');
    }

    const hints = (options && options.hints) || {};
    const allowedUrls = buildAllowedImageUrls(extracted, hints);

    const model = getModel();
    const jsonldStr = JSON.stringify(extracted.jsonld || [], null, 0);
    const metaStr = JSON.stringify(extracted.meta || {}, null, 0);
    const textSnippet = (extracted.text || '').slice(0, 12000);
    const allowedUrlsStr = allowedUrls.length ? `Allowed image URLs (use ONLY these in image_urls):\n${allowedUrls.join('\n')}` : 'No image URLs provided; use [] for image_urls.';

    const systemPrompt = `You are a product data extractor. Given JSON-LD, meta tags, and page text from a product page, output a single JSON object with exactly these keys (use null for any value you cannot determine from the data):
sku, name, brand, description, image_urls, color, thickness, thickness_mil, material, sizes, pack_qty, case_qty, category, subcategory

RULES:
- image_urls: ONLY include URLs from the allowed list provided. Do NOT invent or guess any URL. If none apply, use [].
- sku: item number, SKU, product ID, or part number from the page (or use skuGuess if provided in meta).
- thickness: e.g. "4 mil", "6 mil"; thickness_mil: just the number as string e.g. "4", "6".
- category: use "Disposable Gloves" or "Reusable Work Gloves" only if the page clearly indicates glove type; otherwise null.
- pack_qty, case_qty: numbers only; null if not found.
- For any field not found, use null. Never make up values.`;

    const userPrompt = `Extract product fields from this data and return only valid JSON (no markdown, no code block).

${allowedUrlsStr}

JSON-LD from page:
${jsonldStr}

Meta (og/meta tags):
${metaStr}

Main page text (excerpt):
${textSnippet}

Return a single JSON object with keys: sku, name, brand, description, image_urls (only URLs from the allowed list above), color, thickness, thickness_mil, material, sizes, pack_qty, case_qty, category, subcategory. Use null for unknown.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.1,
            max_tokens: 1500
        })
    });

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!content.trim()) throw new Error('Empty response from AI');

    let parsed;
    try {
        const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(cleaned);
    } catch (e) {
        throw new Error('AI returned invalid JSON: ' + content.slice(0, 200));
    }

    const allowedSet = new Set(allowedUrls.map((x) => x.trim()));
    const allowedKeys = ['sku', 'name', 'brand', 'description', 'image_urls', 'color', 'thickness', 'thickness_mil', 'material', 'sizes', 'pack_qty', 'case_qty', 'category', 'subcategory'];
    const result = {};
    for (const key of allowedKeys) {
        let v = parsed[key];
        if (key === 'image_urls' && !Array.isArray(v)) v = [];
        if (key === 'image_urls') {
            v = (v || []).filter((u) => typeof u === 'string' && u.trim().startsWith('http'));
            v = v.filter((u) => allowedSet.has(u.trim()));
        }
        if ((key === 'pack_qty' || key === 'case_qty') && v != null) v = Number(v);
        if ((key === 'pack_qty' || key === 'case_qty') && (typeof v !== 'number' || isNaN(v))) v = null;
        result[key] = v === undefined ? null : v;
    }
    if (result.thickness == null && result.thickness_mil) result.thickness = result.thickness_mil + ' mil';
    return result;
}

/**
 * Build a minimal normalized draft from extracted data only (no AI).
 * Used when OPENAI_API_KEY is not set. Never invents URLs; only uses meta + jsonld.
 */
function normalizeFromExtracted(extracted, options) {
    const hints = (options && options.hints) || {};
    const meta = (extracted && extracted.meta) || {};
    const jsonld = Array.isArray(extracted && extracted.jsonld) ? extracted.jsonld : (extracted && extracted.jsonld ? [extracted.jsonld] : []);
    const first = jsonld.find((o) => o && (o['@type'] === 'Product' || o.name || o.sku));
    const result = {
        sku: (extracted && extracted.sku) || (first && (first.sku || first.gtin || first.productID)) || (extracted && extracted.skuGuess) || null,
        name: meta.title || (first && first.name) || null,
        brand: (first && first.brand && (typeof first.brand === 'string' ? first.brand : first.brand.name)) || null,
        description: meta.description || (first && first.description) || null,
        image_urls: [],
        color: null,
        thickness: null,
        thickness_mil: null,
        material: (first && first.material) || null,
        sizes: null,
        pack_qty: null,
        case_qty: null,
        category: null,
        subcategory: null
    };
    result.image_urls = buildAllowedImageUrls(extracted, hints);
    return result;
}

module.exports = { aiNormalizeProduct, normalizeFromExtracted, buildAllowedImageUrls, isConfigured, getModel, OUTPUT_SCHEMA };
