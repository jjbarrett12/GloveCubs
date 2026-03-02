/**
 * Domain adapter for globalglove.com.
 * If path is /<number> (e.g. /801), treat as skuGuess. Prefer jsonld.sku if present.
 */

function isGlobalGloveUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const u = new URL(url.trim());
        return u.hostname.toLowerCase().includes('globalglove.com');
    } catch (_) {
        return false;
    }
}

/**
 * Extract SKU guess from path: /801 or /801/ => "801".
 * @param {string} url - Final URL
 * @returns {string|null} - skuGuess or null
 */
function extractSkuGuessFromPath(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const u = new URL(url.trim());
        const path = (u.pathname || '').replace(/\/+$/, '').trim();
        const segments = path.split('/').filter(Boolean);
        const last = segments[segments.length - 1];
        if (!last) return null;
        if (/^\d+$/.test(last)) return last;
        return null;
    } catch (_) {
        return null;
    }
}

/**
 * Enrich extracted data for Global Glove. Sets skuGuess from path; prefer extracted.sku from JSON-LD.
 * @param {object} extracted - { jsonld, meta, text, sku? }
 * @param {string} finalUrl - Final URL after redirects
 * @returns {object} - extracted with skuGuess and sku (if from jsonld) set
 */
function enrichGlobalGlove(extracted, finalUrl) {
    if (!extracted || !isGlobalGloveUrl(finalUrl)) return extracted;
    const skuGuess = extractSkuGuessFromPath(finalUrl);
    if (skuGuess) extracted.skuGuess = skuGuess;
    const fromJsonLd = (extracted.jsonld || []).find((o) => o && (o.sku || (o['@type'] && String(o['@type']).toLowerCase().includes('product') && o.sku)));
    const jsonldSku = fromJsonLd && fromJsonLd.sku ? String(fromJsonLd.sku).trim() : null;
    if (jsonldSku) extracted.sku = jsonldSku;
    else if (extracted.skuGuess) extracted.sku = extracted.skuGuess;
    return extracted;
}

module.exports = { isGlobalGloveUrl, extractSkuGuessFromPath, enrichGlobalGlove };
