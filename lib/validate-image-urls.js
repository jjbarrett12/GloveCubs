/**
 * Validate image URLs: HEAD then GET on failure. Do not drop URLs; mark verified true/false.
 */

const { ssrfSafeFetch } = require('./ssrf-safe-fetch/ssrf-safe-fetch.cjs');

const TIMEOUT_MS = 8000;

async function urlOk(url, method) {
    const result = await ssrfSafeFetch(url, {
        method,
        timeoutMs: TIMEOUT_MS,
        headers: { 'User-Agent': 'GlovecubsBot/1.0 (Image Validator)' }
    });
    return result.ok && result.status >= 200 && result.status < 400;
}

async function headOk(url) {
    try {
        return await urlOk(url, 'HEAD');
    } catch (_) {
        return false;
    }
}

async function getOk(url) {
    try {
        return await urlOk(url, 'GET');
    } catch (_) {
        return false;
    }
}

/**
 * @param {string[]} urls - Array of image URLs
 * @returns {Promise<{ valid_urls: string[], invalid: string[] }>}
 */
async function validateImageUrls(urls) {
    if (!Array.isArray(urls)) return { valid_urls: [], invalid: [] };
    const valid_urls = [];
    const invalid = [];
    for (const u of urls) {
        const url = typeof u === 'string' ? u.trim() : '';
        if (!url || !url.startsWith('http')) {
            if (url) invalid.push(url);
            continue;
        }
        let ok = await headOk(url);
        if (!ok) ok = await getOk(url);
        if (ok) valid_urls.push(url);
        else invalid.push(url);
    }
    return { valid_urls, invalid };
}

/**
 * Validate but do not drop: return each URL with verified flag. 403/timeout => verified false.
 * @param {string[]} urls - Array of image URLs
 * @returns {Promise<{ results: Array<{ url: string, verified: boolean }> }>}
 */
async function validateImageUrlsWithVerification(urls) {
    if (!Array.isArray(urls)) return { results: [] };
    const results = [];
    for (const u of urls) {
        const url = typeof u === 'string' ? u.trim() : '';
        if (!url || !url.startsWith('http')) {
            if (url) results.push({ url, verified: false });
            continue;
        }
        let ok = await headOk(url);
        if (!ok) ok = await getOk(url);
        results.push({ url, verified: !!ok });
    }
    return { results };
}

module.exports = { validateImageUrls, validateImageUrlsWithVerification, headOk, getOk };
