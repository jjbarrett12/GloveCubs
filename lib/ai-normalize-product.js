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
    description: 'string or null (full details: features, benefits, specs, compliance)',
    image_urls: 'array of strings (only from extracted.meta og:image, jsonld image, hints.image_urls)',
    color: 'string or null (e.g. Black, Blue, from title/packaging/specs)',
    thickness: 'string or null (e.g. "4 mil", "5.5 mil")',
    thickness_mil: 'string or null (e.g. "4", "5.5")',
    material: 'string or null',
    sizes: 'string or null (comma-separated if multiple)',
    pack_qty: 'number or null',
    case_qty: 'number or null',
    category: 'string or null (e.g. Disposable Gloves, Reusable Work Gloves)',
    subcategory: 'string or null',
    powder: 'string or null: "Powder-Free" or "Powdered" only',
    grade: 'string or null: "Medical / Exam Grade", "Industrial Grade", or "Food Service Grade" if stated'
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
    const textSnippet = (extracted.text || '').slice(0, 22000);
    const allowedUrlsStr = allowedUrls.length ? `Allowed image URLs (use ONLY these in image_urls):\n${allowedUrls.join('\n')}` : 'No image URLs provided; use [] for image_urls.';

    const systemPrompt = `You are a product data extractor for work gloves and PPE. Given JSON-LD, meta tags, and page text from a product page, output a single JSON object with exactly these keys (use null for any value you cannot determine):
sku, name, brand, description, image_urls, color, thickness, thickness_mil, material, sizes, pack_qty, case_qty, category, subcategory, powder, grade

RULES:
- image_urls: ONLY include URLs from the allowed list. Do NOT invent URLs. If none apply, use [].
- sku: item number, SKU, product ID, or part number from the page (or skuGuess from meta).
- color: extract from product name, packaging, specs, or variant (e.g. Black, Blue, XXL 100).
- thickness / thickness_mil: from "5.5 mil", "6 mil", "4 mil" etc.; thickness_mil is the number as string (e.g. "5.5", "6").
- powder: use "Powder-Free" if the page says powder-free, powder free, or no powder; use "Powdered" if it says powdered; otherwise null.
- grade: use "Medical / Exam Grade" if examination grade, exam grade, medical grade, or FDA exam; use "Industrial Grade" or "Food Service Grade" if clearly stated; otherwise null.
- description: combine ALL relevant text: full product description, Features and Benefits bullets, compliance (FDA, ASTM), resistance (fentanyl, chemical), and key specs. Do not truncate; include as much detail as the page provides.
- category: "Disposable Gloves" or "Reusable Work Gloves" (or "Work Gloves") only if clear; otherwise null.
- pack_qty, case_qty: numbers (e.g. 100 per box, 1000 per case); null if not found.
- For any field not found, use null. Never make up values.`;

    const userPrompt = `Extract product fields from this data and return only valid JSON (no markdown, no code block).

${allowedUrlsStr}

JSON-LD from page:
${jsonldStr}

Meta (og/meta tags):
${metaStr}

Main page text (excerpt — use this for color, thickness, powder, grade, and full description):
${textSnippet}

Return a single JSON object with keys: sku, name, brand, description, image_urls (only from allowed list), color, thickness, thickness_mil, material, sizes, pack_qty, case_qty, category, subcategory, powder, grade. Use null for unknown.`;

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
            max_tokens: 3000
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
    const allowedKeys = ['sku', 'name', 'brand', 'description', 'image_urls', 'color', 'thickness', 'thickness_mil', 'material', 'sizes', 'pack_qty', 'case_qty', 'category', 'subcategory', 'powder', 'grade'];
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
        if (key === 'powder' && v != null && v !== 'Powder-Free' && v !== 'Powdered') v = null;
        if (key === 'grade' && v != null && !['Medical / Exam Grade', 'Industrial Grade', 'Food Service Grade'].includes(v)) v = null;
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
    const text = (extracted && extracted.text) || '';
    const textLower = text.toLowerCase();
    let powder = null;
    if (/\bpowder[- ]?free\b|powderfree/.test(textLower)) powder = 'Powder-Free';
    else if (/\bpowdered\b/.test(textLower)) powder = 'Powdered';
    let grade = null;
    if (/\b(exam(ination)?|medical)\s*grade\b|examination grade|exam grade/.test(textLower)) grade = 'Medical / Exam Grade';
    else if (/\bindustrial\s*grade\b/.test(textLower)) grade = 'Industrial Grade';
    else if (/\bfood\s*service\s*grade\b|food service/.test(textLower)) grade = 'Food Service Grade';
    const result = {
        sku: (extracted && extracted.sku) || (first && (first.sku || first.gtin || first.productID)) || (extracted && extracted.skuGuess) || null,
        name: meta.title || (first && first.name) || null,
        brand: (first && first.brand && (typeof first.brand === 'string' ? first.brand : first.brand.name)) || null,
        description: meta.description || (first && first.description) || (text.slice(0, 8000) || null),
        image_urls: [],
        color: null,
        thickness: null,
        thickness_mil: (text.match(/(\d+(?:\.\d+)?)\s*mil/i) || [])[1] || null,
        material: (first && first.material) || null,
        sizes: null,
        pack_qty: null,
        case_qty: null,
        category: null,
        subcategory: null,
        powder,
        grade
    };
    if (result.thickness_mil) result.thickness = result.thickness_mil + ' mil';
    result.image_urls = buildAllowedImageUrls(extracted, hints);
    return result;
}

module.exports = { aiNormalizeProduct, normalizeFromExtracted, buildAllowedImageUrls, isConfigured, getModel, OUTPUT_SCHEMA };
