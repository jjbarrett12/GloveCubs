/**
 * Phase A storefront redirect + local legacy SPA lockdown (no live server).
 * Run: node --test tests/storefront-public-redirect.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    parseStorefrontPublicOrigin,
    validateStorefrontPublicOriginOnBoot,
    shouldRedirectBrowserRequestToStorefront,
    shouldSuppressLegacyCustomerSpaHtml,
    shouldSuppressLegacyAdminSpaHtml,
    isPublicCustomerHtmlNavigation,
    isAdminHtmlNavigation,
    buildStorefrontHtmlRedirectLocation,
    isDevApiOnlyMode,
    getPublicHtmlRedirectStatusCode,
    DEFAULT_DEV_STOREFRONT_ORIGIN,
} = require('../lib/storefront-public-redirect');

const originSet = { STOREFRONT_PUBLIC_ORIGIN: 'http://localhost:3005' };

function mockReq(method, path) {
    return { method, path };
}

describe('storefront-public-redirect', () => {
    it('uses HTTP 308 for public HTML redirects', () => {
        assert.strictEqual(getPublicHtmlRedirectStatusCode(), 308);
    });

    describe('parseStorefrontPublicOrigin', () => {
        it('normalizes trailing slash', () => {
            const r = parseStorefrontPublicOrigin('http://localhost:3005/');
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.normalized, 'http://localhost:3005');
        });
        it('rejects empty', () => {
            const r = parseStorefrontPublicOrigin('  ');
            assert.strictEqual(r.ok, false);
        });
    });

    describe('isPublicCustomerHtmlNavigation', () => {
        it('matches / and listed customer prefixes', () => {
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/')), true);
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/store')), true);
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/industries/foo')), true);
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/login')), true);
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/account')), true);
        });
        it('excludes /api paths and /admin (admin uses isAdminHtmlNavigation)', () => {
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/api/cart')), false);
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/admin')), false);
            assert.strictEqual(isPublicCustomerHtmlNavigation(mockReq('GET', '/admin/products')), false);
        });
    });

    describe('isAdminHtmlNavigation', () => {
        it('matches /admin and /admin/*', () => {
            assert.strictEqual(isAdminHtmlNavigation(mockReq('GET', '/admin')), true);
            assert.strictEqual(isAdminHtmlNavigation(mockReq('GET', '/admin/products')), true);
            assert.strictEqual(isAdminHtmlNavigation(mockReq('GET', '/admin/products/new-from-url')), true);
        });
        it('excludes /api/admin and asset-like /admin paths', () => {
            assert.strictEqual(isAdminHtmlNavigation(mockReq('GET', '/api/admin/orders')), false);
            assert.strictEqual(isAdminHtmlNavigation(mockReq('GET', '/admin/app.js')), false);
            assert.strictEqual(isAdminHtmlNavigation(mockReq('GET', '/administration')), false);
        });
    });

    describe('buildStorefrontHtmlRedirectLocation', () => {
        it('preserves path and query on redirect target', () => {
            assert.strictEqual(
                buildStorefrontHtmlRedirectLocation('http://localhost:3005/', '/admin/products?tab=imports'),
                'http://localhost:3005/admin/products?tab=imports'
            );
        });
    });

    describe('shouldRedirectBrowserRequestToStorefront', () => {
        it('redirects / and invoice-savings when origin valid', () => {
            assert.strictEqual(shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/'), originSet), true);
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/invoice-savings'), originSet),
                true
            );
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/invoice-savings?x=1'), originSet),
                true
            );
        });
        it('redirects /workspace and /workspace/* to storefront when origin valid', () => {
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/workspace'), originSet),
                true
            );
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/workspace/procurement'), originSet),
                true
            );
        });
        it('redirects /workspace/ (trailing slash) when origin valid', () => {
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/workspace/'), originSet),
                true
            );
        });
        it('redirects /gloves prefix and /b2b /portal-order', () => {
            assert.strictEqual(shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/gloves'), originSet), true);
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/gloves/nitrile/widget/'), originSet),
                true
            );
            assert.strictEqual(shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/b2b'), originSet), true);
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/portal-order/abc'), originSet),
                true
            );
        });
        it('never redirects /api/*', () => {
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/api/cart'), originSet),
                false
            );
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/api/admin/orders'), originSet),
                false
            );
        });
        it('redirects /admin and /admin/* to storefront when origin valid (Phase 1B)', () => {
            assert.strictEqual(shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/admin'), originSet), true);
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/admin/products'), originSet),
                true
            );
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/admin/products/import'), originSet),
                true
            );
        });
        it('does not redirect asset-like /admin paths', () => {
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/admin/legacy-app.js'), originSet),
                false
            );
        });
        it('skips paths that look like file assets', () => {
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/favicon.ico'), originSet),
                false
            );
        });
        it('no redirect when origin unset', () => {
            assert.strictEqual(shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/'), {}), false);
        });
    });

    describe('shouldSuppressLegacyAdminSpaHtml', () => {
        it('never suppresses /admin when redirect is active', () => {
            assert.strictEqual(
                shouldSuppressLegacyAdminSpaHtml(mockReq('GET', '/admin'), {
                    STOREFRONT_PUBLIC_ORIGIN: 'http://localhost:3005',
                }),
                false
            );
        });
        it('suppresses /admin in production even without storefront origin', () => {
            assert.strictEqual(
                shouldSuppressLegacyAdminSpaHtml(mockReq('GET', '/admin'), {
                    NODE_ENV: 'production',
                    STOREFRONT_PUBLIC_ORIGIN: '',
                }),
                true
            );
        });
        it('suppresses /admin in dev when origin unset and legacy escape off', () => {
            assert.strictEqual(
                shouldSuppressLegacyAdminSpaHtml(mockReq('GET', '/admin'), { STOREFRONT_PUBLIC_ORIGIN: '' }),
                true
            );
        });
        it('allows legacy admin SPA in dev only when ALLOW_LEGACY_SPA_HTML=1', () => {
            assert.strictEqual(
                shouldSuppressLegacyAdminSpaHtml(mockReq('GET', '/admin'), {
                    STOREFRONT_PUBLIC_ORIGIN: '',
                    ALLOW_LEGACY_SPA_HTML: '1',
                }),
                false
            );
        });
        it('never suppresses /api/admin/*', () => {
            assert.strictEqual(
                shouldSuppressLegacyAdminSpaHtml(mockReq('GET', '/api/admin/orders'), {
                    NODE_ENV: 'production',
                    STOREFRONT_PUBLIC_ORIGIN: '',
                }),
                false
            );
        });
    });

    describe('shouldSuppressLegacyCustomerSpaHtml', () => {
        it('suppresses / when origin unset and ALLOW_LEGACY unset', () => {
            assert.strictEqual(
                shouldSuppressLegacyCustomerSpaHtml(mockReq('GET', '/'), { STOREFRONT_PUBLIC_ORIGIN: '' }),
                true
            );
        });
        it('does not suppress / when origin valid (redirect path)', () => {
            assert.strictEqual(
                shouldSuppressLegacyCustomerSpaHtml(mockReq('GET', '/'), { STOREFRONT_PUBLIC_ORIGIN: 'http://localhost:3005' }),
                false
            );
        });
        it('does not suppress when ALLOW_LEGACY_SPA_HTML=1', () => {
            assert.strictEqual(
                shouldSuppressLegacyCustomerSpaHtml(mockReq('GET', '/'), {
                    STOREFRONT_PUBLIC_ORIGIN: '',
                    ALLOW_LEGACY_SPA_HTML: '1',
                }),
                false
            );
        });
        it('never suppresses /api/*', () => {
            assert.strictEqual(
                shouldSuppressLegacyCustomerSpaHtml(mockReq('GET', '/api/config'), { STOREFRONT_PUBLIC_ORIGIN: '' }),
                false
            );
        });
    });

    describe('validateStorefrontPublicOriginOnBoot', () => {
        it('fails boot in production when ALLOW_LEGACY_SPA_HTML=1', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'production',
                STOREFRONT_PUBLIC_ORIGIN: 'https://example.com/',
                ALLOW_LEGACY_SPA_HTML: '1',
            });
            assert.strictEqual(r.exitCode, 1);
            assert.ok(r.log.some((l) => l.includes('ALLOW_LEGACY_SPA_HTML')));
            assert.ok(r.log.some((l) => l.includes('FATAL')));
        });
        it('allows ALLOW_LEGACY_SPA_HTML=1 in development only', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'development',
                STOREFRONT_PUBLIC_ORIGIN: '',
                ALLOW_LEGACY_SPA_HTML: '1',
            });
            assert.strictEqual(r.exitCode, undefined);
            assert.ok(r.log.some((l) => l.includes('ALLOW_LEGACY_SPA_HTML')));
        });
        it('requires origin in production', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'production',
                STOREFRONT_PUBLIC_ORIGIN: '',
            });
            assert.strictEqual(r.exitCode, 1);
            assert.ok(r.log.some((l) => l.includes('FATAL')));
        });
        it('applies dev default when NODE_ENV is not production and origin unset (not API-only)', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'development',
                STOREFRONT_PUBLIC_ORIGIN: '',
            });
            assert.strictEqual(r.exitCode, undefined);
            assert.strictEqual(r.normalizedOrigin, DEFAULT_DEV_STOREFRONT_ORIGIN);
            assert.ok(r.log.some((l) => l.includes('dev default')));
        });
        it('does not apply dev default when GLOVECUBS_DEV_API_ONLY=1', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'development',
                STOREFRONT_PUBLIC_ORIGIN: '',
                GLOVECUBS_DEV_API_ONLY: '1',
            });
            assert.strictEqual(r.exitCode, undefined);
            assert.strictEqual(r.normalizedOrigin, undefined);
            assert.ok(r.log.some((l) => l.includes('GLOVECUBS_DEV_API_ONLY')));
        });
        it('does not apply dev default when ALLOW_LEGACY_SPA_HTML=1', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'development',
                STOREFRONT_PUBLIC_ORIGIN: '',
                ALLOW_LEGACY_SPA_HTML: '1',
            });
            assert.strictEqual(r.exitCode, undefined);
            assert.strictEqual(r.normalizedOrigin, undefined);
            assert.ok(r.log.some((l) => l.includes('ALLOW_LEGACY_SPA_HTML')));
        });
        it('accepts valid origin in production', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'production',
                STOREFRONT_PUBLIC_ORIGIN: 'https://example.com/',
            });
            assert.strictEqual(r.exitCode, undefined);
            assert.strictEqual(r.normalizedOrigin, 'https://example.com');
        });
    });

    describe('isDevApiOnlyMode', () => {
        it('is false in production even if flag set', () => {
            assert.strictEqual(
                isDevApiOnlyMode({ NODE_ENV: 'production', GLOVECUBS_DEV_API_ONLY: '1' }),
                false
            );
        });
        it('is true in development with flag', () => {
            assert.strictEqual(
                isDevApiOnlyMode({ NODE_ENV: 'development', GLOVECUBS_DEV_API_ONLY: '1' }),
                true
            );
        });
    });
});
