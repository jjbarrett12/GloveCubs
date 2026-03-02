/**
 * Domain-specific extractor for hospecobrands.com (hostname ends with hospecobrands.com).
 * - SKU: JSON-LD product.sku → visible "Item #" / "Number" in page → data-sku/data-item-code in HTML → URL slug.
 * - Images: /Admin/Public/GetImage.ashx?format=webp&image=/Files/Images/Products/<CODE>.jpg&width=800
 *   plus _2.jpg, .png, _2.png variants; validate URLs and return image_urls.
 * AI is used only for secondary attributes (name, description, etc.) when this extractor runs.
 */

const { validateImageUrls } = require('./validate-image-urls');

const HOSPECO_HOST_SUFFIX = 'hospecobrands.com';

function isHospecoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const u = new URL(url.trim());
        return u.hostname.toLowerCase().endsWith(HOSPECO_HOST_SUFFIX);
    } catch (_) {
        return false;
    }
}

/**
 * Extract SKU/code from JSON-LD (product.sku or @type Product).
 */
function extractSkuFromJsonLd(jsonld) {
    if (!Array.isArray(jsonld)) jsonld = jsonld ? [jsonld] : [];
    for (const obj of jsonld) {
        if (!obj || typeof obj !== 'object') continue;
        const type = [].concat(obj['@type'] || []).join(' ').toLowerCase();
        if (type.includes('product') && obj.sku) {
            const sku = typeof obj.sku === 'string' ? obj.sku.trim() : String(obj.sku || '').trim();
            if (sku) return sku;
        }
        if (obj.sku) {
            const sku = typeof obj.sku === 'string' ? obj.sku.trim() : String(obj.sku || '').trim();
            if (sku) return sku;
        }
    }
    return null;
}

/**
 * Extract item code from page text: "Item #", "Item #:", "Item Number", "Number:" etc.
 */
function extractSkuFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const patterns = [
        /Item\s*#\s*:?\s*([A-Za-z0-9_.-]+)/i,
        /Item\s+Number\s*:?\s*([A-Za-z0-9_.-]+)/i,
        /(?:Product\s+)?(?:Code|Number|#)\s*:?\s*([A-Za-z0-9_.-]+)/i,
        /SKU\s*:?\s*([A-Za-z0-9_.-]+)/i,
        /Number\s*:?\s*([A-Za-z0-9_.-]+)/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1] && m[1].length >= 2 && m[1].length <= 32) return m[1].trim();
    }
    return null;
}

/**
 * Extract item code from raw HTML: data-sku, data-item-code, or tag-stripped text.
 */
function extractSkuFromHtml(html) {
    if (!html || typeof html !== 'string') return null;
    const slice = html.slice(0, 40000);
    const dataPatterns = [
        /data-sku=["']([^"']+)["']/i,
        /data-item[-_]?code=["']([^"']+)["']/i,
    ];
    for (const re of dataPatterns) {
        const m = slice.match(re);
        if (m && m[1]) {
            const code = m[1].trim();
            if (code.length >= 2 && code.length <= 32 && /^[A-Za-z0-9_.-]+$/.test(code)) return code;
        }
    }
    const stripped = slice.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
    return extractSkuFromText(stripped);
}

/**
 * Extract code from URL slug (last path segment, strip extension).
 */
function extractSkuFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const u = new URL(url.trim());
        const path = u.pathname.replace(/\/+$/, '');
        const segments = path.split('/').filter(Boolean);
        const last = segments[segments.length - 1];
        if (!last) return null;
        const slug = last.replace(/\.(html?|php|aspx?)$/i, '').trim();
        if (slug.length >= 2 && slug.length <= 80) return slug;
    } catch (_) {}
    return null;
}

/**
 * Build image candidate URLs for Hospeco GetImage.ashx pattern.
 * /Admin/Public/GetImage.ashx?format=webp&image=/Files/Images/Products/<CODE>.jpg&width=800
 * Variants: <CODE>_2.jpg, <CODE>.png, <CODE>_2.png
 */
function buildHospecoImageCandidates(code, origin) {
    if (!code || typeof code !== 'string') return [];
    code = code.trim();
    if (!code) return [];
    const base = (origin || '').replace(/\/+$/, '');
    const imagePath = '/Files/Images/Products';
    const candidates = [
        `${imagePath}/${code}.jpg`,
        `${imagePath}/${code}_2.jpg`,
        `${imagePath}/${code}.png`,
        `${imagePath}/${code}_2.png`,
    ];
    return candidates.map((imagePathEnc) => {
        const q = `format=webp&image=${encodeURIComponent(imagePathEnc)}&width=800`;
        return `${base}/Admin/Public/GetImage.ashx?${q}`;
    });
}

/**
 * Enrich extracted data for Hospeco: SKU + validated image_urls.
 * @param {string} html - Page HTML
 * @param {string} finalUrl - Final URL after redirects
 * @param {object} extracted - Already extracted { jsonld, meta, text }
 * @returns {Promise<{ sku: string|null, image_urls: string[] }>}
 */
async function enrichHospeco(html, finalUrl, extracted) {
    const out = { sku: null, image_urls: [] };
    const jsonld = (extracted && extracted.jsonld) || [];
    const text = (extracted && extracted.text) || '';

    out.sku = extractSkuFromJsonLd(jsonld)
        || extractSkuFromText(text)
        || extractSkuFromHtml(html)
        || extractSkuFromUrl(finalUrl);

    let origin;
    try {
        origin = new URL(finalUrl).origin;
    } catch (_) {
        return out;
    }

    const candidates = buildHospecoImageCandidates(out.sku, origin);
    if (candidates.length === 0) return out;

    const { valid_urls } = await validateImageUrls(candidates);
    out.image_urls = Array.isArray(valid_urls) ? valid_urls : [];

    return out;
}

module.exports = {
    isHospecoUrl,
    extractSkuFromJsonLd,
    extractSkuFromText,
    extractSkuFromHtml,
    extractSkuFromUrl,
    buildHospecoImageCandidates,
    enrichHospeco,
};
