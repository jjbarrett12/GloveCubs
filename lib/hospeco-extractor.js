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
 * Main + Alt_2, Alt_3, Alt_4: <CODE>.jpg, <CODE>_2.jpg, <CODE>_3.jpg, <CODE>_4.jpg, and .png variants.
 */
function buildHospecoImageCandidates(code, origin) {
    if (!code || typeof code !== 'string') return [];
    code = code.trim();
    if (!code) return [];
    const base = (origin || '').replace(/\/+$/, '');
    const imagePath = '/Files/Images/Products';
    const suffixes = ['', '_2', '_3', '_4'];
    const candidates = [];
    for (const suf of suffixes) {
        const baseName = suf ? `${code}${suf}` : code;
        candidates.push(`${imagePath}/${baseName}.jpg`);
        candidates.push(`${imagePath}/${baseName}.png`);
    }
    return candidates.map((imagePathEnc) => {
        const q = `format=webp&image=${encodeURIComponent(imagePathEnc)}&width=800`;
        return `${base}/Admin/Public/GetImage.ashx?${q}`;
    });
}

/**
 * Parse Product Details table (two-column label/value rows) from Hospeco HTML.
 * Returns object with normalized keys: brand, color, material, grade, size, thickness, powder_free, pack_qty, case_qty, subcategory, etc.
 */
function parseProductDetailsTable(html) {
    const details = {};
    if (!html || typeof html !== 'string') return details;
    const slice = html.slice(0, 80000);
    // Match <tr> with two cells: <th>Label</th><td>Value</td> or <td>Label</td><td>Value</td>
    const rowRe = /<tr[^>]*>[\s\S]*?<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>[\s\S]*?<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>[\s\S]*?<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(slice)) !== null) {
        const label = (m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const value = (m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!label || !value) continue;
        const key = label.toLowerCase().replace(/\s+/g, '_');
        details[label] = value;
        details[key] = value;
    }
    // Also try <dt>Label</dt><dd>Value</dd>
    const dlRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
    while ((m = dlRe.exec(slice)) !== null) {
        const label = (m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const value = (m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!label || !value) continue;
        details[label] = value;
        details[label.toLowerCase().replace(/\s+/g, '_')] = value;
    }
    return details;
}

/**
 * Map parsed table details to our product schema (brand, color, material, grade, sizes, pack_qty, case_qty, subcategory).
 */
function mapDetailsToSchema(details) {
    const get = (...args) => {
        for (const k of args) {
            const v = details[k] || details[(k || '').toLowerCase().replace(/\s+/g, '_')];
            if (v && String(v).trim()) return String(v).trim();
        }
        return null;
    };
    let pack_qty = null;
    let case_qty = null;
    const packaging = get('Packaging Put/Up', 'Packaging Put-Up', 'Inner Quantity', 'packaging_put/up');
    if (packaging) {
        const match = packaging.match(/(\d+)\s*\/\s*bx/i) || packaging.match(/(\d+)\s*per\s*box/i);
        if (match) pack_qty = parseInt(match[1], 10);
        const caseMatch = packaging.match(/(\d+)\s*bxs?\s*\/\s*cs/i) || packaging.match(/(\d+)\s*boxes?\s*\/\s*case/i);
        if (caseMatch && pack_qty) case_qty = parseInt(caseMatch[1], 10) * pack_qty;
        if (!case_qty && packaging.match(/(\d+)\s*\/\s*cs/i)) {
            const cs = packaging.match(/(\d+)\s*\/\s*cs/i);
            if (cs) case_qty = parseInt(cs[1], 10);
        }
    }
    const innerQty = get('Inner Quantity', 'inner_quantity');
    if (innerQty && /^\d+$/.test(innerQty) && !pack_qty) pack_qty = parseInt(innerQty, 10);
    const grade = get('Grade', 'grade');
    const powderFree = get('Powder Free', 'Powder Free', 'powder_free');
    const typeVal = get('Type', 'type') || get('Subcategory', 'subcategory');
    let category = null;
    if (typeVal && /\bdisposable\b/i.test(typeVal)) category = 'Disposable Gloves';
    else if (typeVal && /\bwork\s*glove|reusable\b/i.test(typeVal)) category = 'Reusable Work Gloves';
    else if (grade || typeVal) category = 'Disposable Gloves';
    return {
        brand: get('Brand', 'brand') || get('Sub-Brand', 'Sub-Brand', 'sub_brand'),
        color: get('Color', 'color'),
        material: get('Material', 'material'),
        grade: grade || null,
        powder_free: powderFree ? (/\b(yes|true|1|powder[- ]?free)\b/i.test(powderFree) ? 'Powder-Free' : null) : null,
        sizes: get('Size', 'size', 'Sizes', 'sizes'),
        thickness: get('Thickness', 'thickness'),
        pack_qty: pack_qty,
        case_qty: case_qty,
        category: category,
        subcategory: typeVal || null,
        number: get('Number', 'number')
    };
}

/**
 * Enrich extracted data for Hospeco: SKU + validated image_urls + productDetails from table.
 * @param {string} html - Page HTML
 * @param {string} finalUrl - Final URL after redirects
 * @param {object} extracted - Already extracted { jsonld, meta, text }
 * @returns {Promise<{ sku: string|null, image_urls: string[], productDetails: object }>}
 */
async function enrichHospeco(html, finalUrl, extracted) {
    const out = { sku: null, image_urls: [], productDetails: null };
    const jsonld = (extracted && extracted.jsonld) || [];
    const text = (extracted && extracted.text) || '';

    out.sku = extractSkuFromJsonLd(jsonld)
        || extractSkuFromText(text)
        || extractSkuFromHtml(html)
        || extractSkuFromUrl(finalUrl);

    const tableDetails = parseProductDetailsTable(html);
    const mapped = mapDetailsToSchema(tableDetails);
    if (Object.keys(mapped).some((k) => mapped[k] != null)) {
        if (out.sku == null && mapped.number) out.sku = mapped.number;
        out.productDetails = mapped;
    }

    let origin;
    try {
        origin = new URL(finalUrl).origin;
    } catch (_) {
        return out;
    }

    const candidates = buildHospecoImageCandidates(out.sku, origin);
    if (candidates.length > 0) {
        const { valid_urls } = await validateImageUrls(candidates);
        out.image_urls = Array.isArray(valid_urls) ? valid_urls : [];
    }

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
