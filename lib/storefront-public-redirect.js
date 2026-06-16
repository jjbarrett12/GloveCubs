'use strict';

/**
 * Phase A/B — public HTML consolidation: Express sends customer- and admin-facing
 * document requests to the Next storefront origin when STOREFRONT_PUBLIC_ORIGIN is set.
 *
 * Status policy: HTTP 308 Permanent Redirect (RFC 7538). Same semantics as 301 for
 * GET/HEAD; method/body preserved for other methods if ever used.
 *
 * Exceptions (no redirect):
 * - /api/* — JSON APIs stay on Express (including /api/admin/*)
 * - GET paths that look like static files (last path segment contains a dot)
 *
 * Admin HTML `/admin` and `/admin/*` redirect to Next (Phase 1B). Legacy admin SPA
 * (index.html + admin-app.js) must not be served in production.
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
const DEFAULT_DEV_STOREFRONT_ORIGIN = 'http://localhost:3005';

function isTruthyEnvFlag(v) {
    const s = (v == null ? '' : String(v)).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
}

function isDevApiOnlyMode(env) {
    return !((env.NODE_ENV || '') === 'production') && isTruthyEnvFlag(env.GLOVECUBS_DEV_API_ONLY);
}

/**
 * Production must never serve legacy public/index.html for customer routes.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ log: string[], exitCode?: number }}
 */
function validateLegacySpaHtmlOnBoot(env) {
    const isProduction = (env.NODE_ENV || '') === 'production';
    if (isProduction && isTruthyEnvFlag(env.ALLOW_LEGACY_SPA_HTML)) {
        return {
            log: [
                '[boot] FATAL: ALLOW_LEGACY_SPA_HTML=1 is forbidden when NODE_ENV=production.',
                '[boot] Legacy customer SPA (public/index.html) must not be served in production.',
                '[boot] Customer HTML is owned by the Next.js storefront (STOREFRONT_PUBLIC_ORIGIN).',
            ],
            exitCode: 1,
        };
    }
    return { log: [] };
}

function validateStorefrontPublicOriginOnBoot(env) {
    const legacy = validateLegacySpaHtmlOnBoot(env);
    if (legacy.exitCode) return legacy;

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
            if (isTruthyEnvFlag(env.ALLOW_LEGACY_SPA_HTML)) {
                return {
                    log: [
                        '[boot] ALLOW_LEGACY_SPA_HTML=1 and STOREFRONT_PUBLIC_ORIGIN unset — legacy customer SPA may be served from Express (no dev default origin / no redirect to Next).',
                    ],
                };
            }
            if (isDevApiOnlyMode(env)) {
                return {
                    log: [
                        '[boot] GLOVECUBS_DEV_API_ONLY=1 and STOREFRONT_PUBLIC_ORIGIN is unset.',
                        '[boot] Customer HTML routes will not use the legacy SPA (503 + instructions) unless ALLOW_LEGACY_SPA_HTML=1.',
                        '[boot] APIs remain on this host under /api/*. To redirect browsers to Next: set STOREFRONT_PUBLIC_ORIGIN=http://localhost:3005 and run npm run dev:storefront.',
                    ],
                };
            }
            return {
                log: [
                    `[boot] Local customer HTML redirects to Next storefront at ${DEFAULT_DEV_STOREFRONT_ORIGIN} (STOREFRONT_PUBLIC_ORIGIN was unset; dev default applied).`,
                    '[boot] Override with STOREFRONT_PUBLIC_ORIGIN=… API-only Express (no default origin): npm run dev:api',
                ],
                normalizedOrigin: DEFAULT_DEV_STOREFRONT_ORIGIN,
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
            `[boot] Customer + admin HTML GET/HEAD → ${parsed.normalized} (HTTP ${PUBLIC_HTML_REDIRECT_STATUS} Permanent Redirect).`,
            '[boot] APIs remain on this host under /api/* . Next storefront: set NEXT_PUBLIC_GLOVECUBS_API to this origin.',
        ],
        normalizedOrigin: parsed.normalized,
    };
}

/**
 * @param {import('http').IncomingMessage} req
 */
function isAdminHtmlNavigation(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const p = req.path || '/';
    if (p.startsWith('/api')) return false;
    if (p !== '/admin' && !p.startsWith('/admin/')) return false;

    const lastSeg = (p.split('/').pop() || '').split('?')[0];
    if (lastSeg.includes('.') && !lastSeg.endsWith('/')) return false;

    return true;
}

/**
 * @param {import('http').IncomingMessage} req
 */
function isStorefrontHtmlRedirectNavigation(req) {
    return isPublicCustomerHtmlNavigation(req) || isAdminHtmlNavigation(req);
}

/**
 * @param {string} storefrontOrigin
 * @param {string} [originalUrl='']
 */
function buildStorefrontHtmlRedirectLocation(storefrontOrigin, originalUrl) {
    const parsed = parseStorefrontPublicOrigin(storefrontOrigin);
    const base = parsed.ok ? parsed.normalized : normalizeStorefrontPublicOrigin(storefrontOrigin);
    const suffix = originalUrl == null || originalUrl === '' ? '' : String(originalUrl);
    return base + suffix;
}

/**
 * Customer-facing browser navigations that must never hit the legacy Express SPA
 * unless ALLOW_LEGACY_SPA_HTML=1 (Phase A). Same path rules as storefront redirect.
 *
 * @param {import('http').IncomingMessage} req
 */
function isPublicCustomerHtmlNavigation(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const p = req.path || '/';
    if (p.startsWith('/api')) return false;

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
        p.startsWith('/login') ||
        p.startsWith('/account') ||
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

/**
 * @param {import('http').IncomingMessage} req
 * @param {NodeJS.ProcessEnv} [env=process.env]
 */
function shouldRedirectBrowserRequestToStorefront(req, env = process.env) {
    const parsed = parseStorefrontPublicOrigin(env.STOREFRONT_PUBLIC_ORIGIN);
    if (!parsed.ok) return false;
    return isStorefrontHtmlRedirectNavigation(req);
}

/**
 * When true, the catch-all must not serve public/index.html for this request
 * (use 503 dev gate instead). Requires ALLOW_LEGACY_SPA_HTML=1 to serve legacy customer HTML.
 *
 * @param {import('http').IncomingMessage} req
 * @param {NodeJS.ProcessEnv} [env=process.env]
 */
function shouldSuppressLegacyCustomerSpaHtml(req, env = process.env) {
    if (!isPublicCustomerHtmlNavigation(req)) return false;
    if (shouldRedirectBrowserRequestToStorefront(req, env)) return false;
    if (isTruthyEnvFlag(env.ALLOW_LEGACY_SPA_HTML)) return false;
    return true;
}

/**
 * When true, the catch-all must not serve public/index.html (legacy admin SPA) for /admin*.
 * Production always suppresses; non-production requires ALLOW_LEGACY_SPA_HTML=1 to serve legacy admin HTML.
 *
 * @param {import('http').IncomingMessage} req
 * @param {NodeJS.ProcessEnv} [env=process.env]
 */
function shouldSuppressLegacyAdminSpaHtml(req, env = process.env) {
    if (!isAdminHtmlNavigation(req)) return false;
    if (shouldRedirectBrowserRequestToStorefront(req, env)) return false;
    if ((env.NODE_ENV || '') === 'production') return true;
    if (isTruthyEnvFlag(env.ALLOW_LEGACY_SPA_HTML)) return false;
    return true;
}

function getPublicHtmlRedirectStatusCode() {
    return PUBLIC_HTML_REDIRECT_STATUS;
}

module.exports = {
    normalizeStorefrontPublicOrigin,
    parseStorefrontPublicOrigin,
    validateLegacySpaHtmlOnBoot,
    validateStorefrontPublicOriginOnBoot,
    isPublicCustomerHtmlNavigation,
    isAdminHtmlNavigation,
    isStorefrontHtmlRedirectNavigation,
    buildStorefrontHtmlRedirectLocation,
    shouldRedirectBrowserRequestToStorefront,
    shouldSuppressLegacyCustomerSpaHtml,
    shouldSuppressLegacyAdminSpaHtml,
    isDevApiOnlyMode,
    getPublicHtmlRedirectStatusCode,
    PUBLIC_HTML_REDIRECT_STATUS,
    DEFAULT_DEV_STOREFRONT_ORIGIN,
};
