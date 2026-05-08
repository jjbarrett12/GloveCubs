'use strict';

/**
 * Phase A — public HTML consolidation: Express sends customer-facing document
 * requests to the Next storefront origin when STOREFRONT_PUBLIC_ORIGIN is set.
 *
 * Status policy: HTTP 308 Permanent Redirect (RFC 7538). Same semantics as 301 for
 * GET/HEAD; method/body preserved for other methods if ever used.
 *
 * Exceptions (no redirect):
 * - /api/* — JSON APIs stay on Express
 * - GET paths that look like static files (last path segment contains a dot)
 * - /admin* — browser admin remains legacy SPA on Express until Next parity is verified.
 *   /api/admin/* is unaffected (handled under /api).
 *
 * Customer paths include `/workspace` and `/workspace/*` so the API host never serves
 * workspace HTML when STOREFRONT_PUBLIC_ORIGIN is set (Next owns `/workspace/procurement/*`).
 *
 * @see ROUTE_OWNERSHIP.md
 */
const PUBLIC_HTML_REDIRECT_STATUS = 308;

function normalizeStorefrontPublicOrigin(raw) {
    const s = (raw == null ? '' : String(raw)).trim().replace(/\/$/, '');
    return s;
}

function parseStorefrontPublicOrigin(raw) {
    const normalized = normalizeStorefrontPublicOrigin(raw);
    if (!normalized) return { ok: false, normalized: '', error: 'empty' };
    try {
        const u = new URL(normalized);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return { ok: false, normalized: '', error: 'protocol must be http: or https:' };
        }
        const host = u.hostname;
        if (!host) return { ok: false, normalized: '', error: 'missing host' };
        return { ok: true, normalized: `${u.protocol}//${u.host}` };
    } catch {
        return { ok: false, normalized: '', error: 'invalid URL' };
    }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ log: string[], exitCode?: number, normalizedOrigin?: string }}
 */
function validateStorefrontPublicOriginOnBoot(env) {
    const isProduction = (env.NODE_ENV || '') === 'production';
    const raw = env.STOREFRONT_PUBLIC_ORIGIN;
    const parsed = parseStorefrontPublicOrigin(raw);

    if (!parsed.ok) {
        if (parsed.error === 'empty') {
            if (isProduction) {
                return {
                    log: [
                        '[boot] FATAL: STOREFRONT_PUBLIC_ORIGIN is required when NODE_ENV=production (staging/production).',
                        '[boot] Without it, Express would serve the legacy public SPA for customer routes (split-brain).',
                        '[boot] Example: STOREFRONT_PUBLIC_ORIGIN=https://glovecubs.vercel.app',
                    ],
                    exitCode: 1,
                };
            }
            return {
                log: [
                    '[boot] WARN: STOREFRONT_PUBLIC_ORIGIN unset. Customer HTML may be served from this host (legacy SPA).',
                    '[boot] For canonical HTML locally, set STOREFRONT_PUBLIC_ORIGIN=http://localhost:3005 and run: npm run dev:storefront',
                    '[boot] Ports: Express/API default 3004 — Next storefront dev default 3005.',
                ],
            };
        }
        if (isProduction) {
            return {
                log: [`[boot] FATAL: STOREFRONT_PUBLIC_ORIGIN is invalid (${parsed.error}).`],
                exitCode: 1,
            };
        }
        return {
            log: [
                `[boot] WARN: STOREFRONT_PUBLIC_ORIGIN invalid (${parsed.error}); HTML redirects to storefront disabled.`,
            ],
        };
    }

    return {
        log: [
            `[boot] Customer HTML GET/HEAD → ${parsed.normalized} (HTTP ${PUBLIC_HTML_REDIRECT_STATUS} Permanent Redirect).`,
            '[boot] APIs remain on this host under /api/* . Next storefront: set NEXT_PUBLIC_GLOVECUBS_API to this origin.',
        ],
        normalizedOrigin: parsed.normalized,
    };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {NodeJS.ProcessEnv} [env=process.env]
 */
function shouldRedirectBrowserRequestToStorefront(req, env = process.env) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const parsed = parseStorefrontPublicOrigin(env.STOREFRONT_PUBLIC_ORIGIN);
    if (!parsed.ok) return false;

    const p = req.path || '/';
    if (p.startsWith('/api')) return false;

    // Phase A admin exception: do not redirect /admin HTML to Next until parity verified.
    // Admin JSON under /api/admin/* is unchanged.
    if (p.startsWith('/admin')) return false;

    const lastSeg = (p.split('/').pop() || '').split('?')[0];
    if (lastSeg.includes('.') && !lastSeg.endsWith('/')) return false;

    return (
        p === '/' ||
        p.startsWith('/invoice-savings') ||
        p.startsWith('/request-pricing') ||
        p.startsWith('/glove-finder') ||
        p.startsWith('/store') ||
        p.startsWith('/contact') ||
        p.startsWith('/faq') ||
        p.startsWith('/resources') ||
        p.startsWith('/brands') ||
        p.startsWith('/industries') ||
        p.startsWith('/quote-cart') ||
        p.startsWith('/find-my-glove') ||
        p.startsWith('/workspace') ||
        p === '/gloves' ||
        p.startsWith('/gloves/') ||
        p === '/b2b' ||
        p.startsWith('/b2b/') ||
        p === '/portal-order' ||
        p.startsWith('/portal-order/')
    );
}

function getPublicHtmlRedirectStatusCode() {
    return PUBLIC_HTML_REDIRECT_STATUS;
}

module.exports = {
    normalizeStorefrontPublicOrigin,
    parseStorefrontPublicOrigin,
    validateStorefrontPublicOriginOnBoot,
    shouldRedirectBrowserRequestToStorefront,
    getPublicHtmlRedirectStatusCode,
    PUBLIC_HTML_REDIRECT_STATUS,
};
