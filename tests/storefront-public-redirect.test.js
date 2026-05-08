/**
 * Phase 1 storefront redirect rules (no live server).
 * Run: node --test tests/storefront-public-redirect.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    parseStorefrontPublicOrigin,
    validateStorefrontPublicOriginOnBoot,
    shouldRedirectBrowserRequestToStorefront,
    getPublicHtmlRedirectStatusCode,
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

    describe('shouldRedirectBrowserRequestToStorefront', () => {
        it('redirects / and invoice-savings when origin valid', () => {
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/'), originSet),
                true
            );
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
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/gloves'), originSet),
                true
            );
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/gloves/nitrile/widget/'), originSet),
                true
            );
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/b2b'), originSet),
                true
            );
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
        it('never redirects /admin HTML (Phase A exception)', () => {
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/admin'), originSet),
                false
            );
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/admin/products'), originSet),
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
            assert.strictEqual(
                shouldRedirectBrowserRequestToStorefront(mockReq('GET', '/'), {}),
                false
            );
        });
    });

    describe('validateStorefrontPublicOriginOnBoot', () => {
        it('requires origin in production', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'production',
                STOREFRONT_PUBLIC_ORIGIN: '',
            });
            assert.strictEqual(r.exitCode, 1);
            assert.ok(r.log.some((l) => l.includes('FATAL')));
        });
        it('warns in development when unset', () => {
            const r = validateStorefrontPublicOriginOnBoot({
                NODE_ENV: 'development',
                STOREFRONT_PUBLIC_ORIGIN: '',
            });
            assert.strictEqual(r.exitCode, undefined);
            assert.ok(r.log.some((l) => l.includes('WARN')));
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
});
