/**
 * Add Product by URL: supports both product pages and asset URLs (image/PDF/CDN).
 * A) Classify: pathname .png/.jpg/.jpeg/.webp/.pdf or path contains /media/catalog/product/ or /delivery/media/ => kind="asset".
 * B) Asset: no HTML parse; return kind="asset", hints.image_urls, extracted empty.
 * C) Page: fetch HTML, extract JSON-LD + og meta + main text; domain adapters (Hospeco, Global Glove).
 */

const PARSE_URL_TIMEOUT_MS = 10000;
const MAX_RETRIES = 1;

const ASSET_EXTENSIONS = /\.(png|jpe?g|webp|pdf)$/i;
const ASSET_PATH_PATTERNS = [/\/media\/catalog\/product\//i, /\/delivery\/media\//i];

/**
 * Classify by URL pattern only (no fetch). Asset = pathname ends with image/PDF extension or path contains catalog/media.
 */
function classifyUrlByPattern(url) {
    if (!url || typeof url !== 'string') return 'page';
    const u = url.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) return 'page';
    try {
        const parsed = new URL(u);
        const pathname = parsed.pathname || '';
        if (ASSET_EXTENSIONS.test(pathname)) return 'asset';
        const path = pathname + (parsed.search || '');
        if (ASSET_PATH_PATTERNS.some((re) => re.test(path))) return 'asset';
    } catch (_) {}
    return 'page';
}

let hospecoExtractor;
function getHospecoExtractor() {
    if (!hospecoExtractor) {
        try {
            hospecoExtractor = require('./hospeco-extractor');
        } catch (_) {
            hospecoExtractor = null;
        }
    }
    return hospecoExtractor;
}

function isAssetContentType(ct) {
    if (!ct || typeof ct !== 'string') return false;
    const lower = ct.split(';')[0].trim().toLowerCase();
    return lower.startsWith('image/') || lower === 'application/pdf';
}

function isHtmlContentType(ct) {
    if (!ct || typeof ct !== 'string') return false;
    return ct.split(';')[0].trim().toLowerCase().includes('text/html');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = PARSE_URL_TIMEOUT_MS) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: options.method || 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'GlovecubsBot/1.0 (Product URL Parser)',
                ...options.headers
            }
        });
        clearTimeout(to);
        return res;
    } catch (err) {
        clearTimeout(to);
        throw err;
    }
}

/**
 * Probe URL with HEAD; if HEAD fails (blocked/405/timeout), try GET.
 * Returns { statusCode, finalUrl, contentType, contentLength, body? }.
 * For HTML, body is populated (via GET if we only did HEAD).
 */
async function probeUrl(url, retries = 0) {
    const u = (url || '').trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
        throw new Error('URL must start with http:// or https://');
    }

    let response = null;
    let lastError = null;
    let usedGet = false;

    for (const method of ['HEAD', 'GET']) {
        try {
            response = await fetchWithTimeout(u, { method }, PARSE_URL_TIMEOUT_MS);
            usedGet = method === 'GET';
            break;
        } catch (err) {
            lastError = err;
            if (method === 'HEAD' && (err.name === 'AbortError' || err.message?.includes('fetch') || err.message?.includes('timeout'))) {
                continue; // try GET
            }
            throw err;
        }
    }

    if (!response) {
        throw lastError || new Error('Request failed');
    }

    const statusCode = response.status;
    const finalUrl = response.url || u;
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');

    if (statusCode >= 500 && retries < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500));
        return probeUrl(u, retries + 1);
    }
    if (statusCode === 403) {
        throw new Error('Access forbidden (403). The server may block automated requests. Try copying the image URL from your browser.');
    }
    if (statusCode === 404) {
        throw new Error('URL not found (404). Check the link and try again.');
    }
    if (statusCode >= 400) {
        throw new Error(`Request failed with status ${statusCode}.`);
    }

    const result = { statusCode, finalUrl, contentType, contentLength: contentLength ? parseInt(contentLength, 10) : null };

    if (isHtmlContentType(contentType)) {
        if (usedGet) {
            try {
                result.body = await response.text();
            } catch (e) {
                result.body = '';
            }
        } else {
            // HEAD succeeded; fetch body with GET for HTML parsing
            try {
                const getRes = await fetchWithTimeout(finalUrl, { method: 'GET' }, PARSE_URL_TIMEOUT_MS);
                result.body = await getRes.text();
            } catch (e) {
                result.body = '';
            }
        }
    }

    return result;
}

/**
 * Extract main content text from HTML (strip script, style, then get text).
 */
function extractMainText(html) {
    if (!html || typeof html !== 'string') return '';
    let h = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
    h = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return h.slice(0, 50000);
}

/**
 * Extract JSON-LD blocks and meta for admin AI flow. Returns { jsonld, meta, text }.
 */
function extractForAdmin(html, finalUrl) {
    const jsonld = [];
    const meta = { title: '', image: '', description: '' };
    if (!html || typeof html !== 'string') return { jsonld, meta, text: '' };

    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogImage && ogImage[1]) meta.image = ogImage[1].trim();

    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
    if (ogTitle && ogTitle[1]) meta.title = ogTitle[1].trim();

    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
    if (ogDesc && ogDesc[1]) meta.description = ogDesc[1].trim();

    const descMeta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    if (descMeta && descMeta[1] && !meta.description) meta.description = descMeta[1].trim();

    const jsonLdBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdBlocks) {
        for (const block of jsonLdBlocks) {
            const m = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            if (m && m[1]) {
                try {
                    const data = JSON.parse(m[1].trim());
                    const arr = Array.isArray(data) ? data : [data];
                    jsonld.push(...arr);
                } catch (_) {}
            }
        }
    }

    return { jsonld, meta, text: extractMainText(html) };
}

/**
 * Extract product info from HTML (og tags, json-ld). Minimal implementation.
 */
function extractFromHtml(html, finalUrl) {
    const hints = { images: [], title: '', description: '' };
    if (!html || typeof html !== 'string') return hints;

    const { jsonld, meta } = extractForAdmin(html, finalUrl);
    if (meta.image) hints.images.push(meta.image);
    if (meta.title) hints.title = meta.title;
    if (meta.description) hints.description = meta.description;

    for (const obj of jsonld) {
        if (obj && obj.image) {
            const img = typeof obj.image === 'string' ? obj.image : (obj.image && obj.image.url) ? obj.image.url : (Array.isArray(obj.image) && obj.image[0]) ? (typeof obj.image[0] === 'string' ? obj.image[0] : obj.image[0].url) : null;
            if (img && !hints.images.includes(img)) hints.images.push(img);
        }
        if (obj && obj.name && !hints.title) hints.title = obj.name;
    }

    if (hints.images.length === 0 && finalUrl) hints.images.push(finalUrl);
    return hints;
}

/**
 * Classify a probe result into asset vs page payload (no fetch). Used for tests and by parseProductUrl.
 */
function classifyProbeResult(probe, url) {
    const u = (url || '').trim();
    const { statusCode, finalUrl, contentType, body } = probe;

    if (isAssetContentType(contentType)) {
        return {
            kind: 'asset',
            url: u,
            asset: {
                contentType: (contentType || '').split(';')[0].trim(),
                finalUrl: finalUrl || u
            },
            hints: { images: [finalUrl || u] }
        };
    }

    if (isHtmlContentType(contentType) && body) {
        const hints = extractFromHtml(body, finalUrl || u);
        hints.image_urls = hints.images || [];
        const { jsonld, meta, text } = extractForAdmin(body, finalUrl || u);
        return {
            kind: 'page',
            url: u,
            finalUrl: finalUrl || u,
            statusCode,
            hints,
            extracted: {
                title: hints.title || '',
                description: hints.description || '',
                images: hints.images || [],
                jsonld,
                meta: { title: meta.title, image: meta.image, description: meta.description },
                text
            }
        };
    }

    throw new Error(`Unsupported content type: ${contentType || 'unknown'}. Use a product page URL (HTML) or a direct image/PDF URL.`);
}

/**
 * Parse a product or media URL. Returns payload for Add Product by URL.
 * - Asset (by URL pattern): no fetch; return kind="asset", hints.image_urls, empty extracted.
 * - Asset (by content-type): after fetch, return kind="asset" with finalUrl in hints.
 * - HTML page: fetch, extract jsonld/meta/text, run domain adapters (Hospeco, Global Glove).
 */
async function parseProductUrl(url) {
    const u = (url || '').trim();
    if (!u) throw new Error('URL is required');

    if (classifyUrlByPattern(u) === 'asset') {
        return {
            kind: 'asset',
            url: u,
            hints: { image_urls: [u], images: [u] },
            extracted: { meta: {}, jsonld: [], text: '' }
        };
    }

    const probe = await probeUrl(u);
    const payload = classifyProbeResult(probe, u);

    if (payload.kind === 'asset') {
        const final = payload.asset && payload.asset.finalUrl ? payload.asset.finalUrl : u;
        return {
            kind: 'asset',
            url: u,
            asset: payload.asset,
            hints: { image_urls: [final], images: payload.hints && payload.hints.images ? payload.hints.images : [final] },
            extracted: { meta: {}, jsonld: [], text: '' }
        };
    }

    if (payload.kind === 'page' && payload.extracted) {
        const hints = payload.hints || {};
        if (hints.images && !hints.image_urls) hints.image_urls = hints.images;

        let globalGloveAdapter;
        try {
            globalGloveAdapter = require('./globalglove-adapter');
        } catch (_) {}
        if (globalGloveAdapter && globalGloveAdapter.isGlobalGloveUrl(payload.finalUrl || u)) {
            payload.extracted = globalGloveAdapter.enrichGlobalGlove(payload.extracted, payload.finalUrl || u);
        }

        const hospeco = getHospecoExtractor();
        if (hospeco && hospeco.isHospecoUrl(payload.finalUrl || u)) {
            try {
                const enriched = await hospeco.enrichHospeco(probe.body || '', payload.finalUrl || u, payload.extracted);
                if (enriched.sku) payload.extracted.sku = enriched.sku;
                if (enriched.image_urls && enriched.image_urls.length > 0) {
                    payload.extracted.image_urls = enriched.image_urls;
                    payload.hints.images = [...enriched.image_urls];
                    payload.hints.image_urls = [...enriched.image_urls];
                }
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) console.error('[parse-product-url] Hospeco enrich failed:', err.message);
            }
        }

        if (payload.hints && !payload.hints.image_urls) payload.hints.image_urls = payload.hints.images || [];
    }

    return payload;
}

module.exports = { parseProductUrl, classifyProbeResult, extractForAdmin, isAssetContentType, isHtmlContentType, probeUrl, PARSE_URL_TIMEOUT_MS };
