/**
 * GloveCubs analytics: GA4 + PostHog + UTM capture.
 * Loads third-party scripts only when keys exist in /api/config (non-blocking).
 */
(function (global) {
    'use strict';

    var STORAGE_FIRST = 'gc_utm_first';
    var STORAGE_SESSION = 'gc_utm_session';
    var CFG = null;
    var cfgPromise = null;
    var posthogReady = false;

    function baseUrl() {
        var b = global.api && global.api.baseUrl;
        return b || '';
    }

    function loadScript(src, async) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = async !== false;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function parseQuery() {
        var q = {};
        var s = global.location.search;
        if (!s || s.length < 2) return q;
        s.slice(1).split('&').forEach(function (pair) {
            var i = pair.indexOf('=');
            var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i)).trim();
            var v = decodeURIComponent(i < 0 ? '' : pair.slice(i + 1)).trim();
            if (k) q[k] = v;
        });
        return q;
    }

    function pickUtm(q) {
        var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid', 'ttclid'];
        var o = {};
        keys.forEach(function (k) {
            if (q[k]) o[k] = String(q[k]).slice(0, 240);
        });
        return o;
    }

    function mergeAttribution() {
        var q = parseQuery();
        var fromUrl = pickUtm(q);
        var session = {};
        try {
            session = JSON.parse(sessionStorage.getItem(STORAGE_SESSION) || '{}') || {};
        } catch (e) {
            session = {};
        }
        Object.assign(session, fromUrl);
        try {
            sessionStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
        } catch (e) { /* private mode */ }

        var first = {};
        try {
            first = JSON.parse(localStorage.getItem(STORAGE_FIRST) || '{}') || {};
        } catch (e) {
            first = {};
        }
        var hasNew = false;
        Object.keys(fromUrl).forEach(function (k) {
            if (!first[k]) {
                first[k] = fromUrl[k];
                hasNew = true;
            }
        });
        if (hasNew || !first.first_seen_at) {
            if (!first.first_seen_at) first.first_seen_at = new Date().toISOString();
            if (!first.landing_path) first.landing_path = (global.location.pathname || '') + (global.location.search || '');
            try {
                localStorage.setItem(STORAGE_FIRST, JSON.stringify(first));
            } catch (e) { /* */ }
        }
        var out = {};
        Object.keys(first).forEach(function (k) {
            out[k] = first[k];
        });
        Object.keys(session).forEach(function (k) {
            out[k] = session[k];
        });
        return out;
    }

    function getAttributionPayload() {
        return mergeAttribution();
    }

    function ensureConfig() {
        if (CFG) return Promise.resolve(CFG);
        if (cfgPromise) return cfgPromise;
        cfgPromise = fetch(baseUrl() + '/api/config')
            .then(function (r) {
                return r.ok ? r.json() : {};
            })
            .then(function (j) {
                CFG = j || {};
                return CFG;
            })
            .catch(function () {
                CFG = {};
                return CFG;
            });
        return cfgPromise;
    }

    function initThirdParty() {
        return ensureConfig().then(function (cfg) {
            var gaId = cfg.ga4MeasurementId || cfg.GA4_MEASUREMENT_ID;
            if (gaId && !global.gtag) {
                global.dataLayer = global.dataLayer || [];
                global.gtag = function () {
                    global.dataLayer.push(arguments);
                };
                return loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId))
                    .then(function () {
                        global.gtag('js', new Date());
                        global.gtag('config', gaId, { send_page_view: false });
                    })
                    .catch(function () {});
            }
        }).then(function () {
            return ensureConfig();
        }).then(function (cfg) {
            var phKey = cfg.posthogKey || cfg.POSTHOG_KEY;
            var phHost = (cfg.posthogHost || 'https://us.i.posthog.com').replace(/\/$/, '');
            if (!phKey || global.posthog || posthogReady) return;
            return loadScript(phHost + '/static/array.js')
                .then(function () {
                    if (global.posthog && typeof global.posthog.init === 'function') {
                        global.posthog.init(phKey, {
                            api_host: phHost,
                            capture_pageview: false,
                            persistence: 'localStorage+cookie',
                        });
                        posthogReady = true;
                    }
                })
                .catch(function () {});
        });
    }

    function gtagEvent(name, params) {
        if (global.gtag) {
            try {
                global.gtag('event', name, params || {});
            } catch (e) { /* */ }
        }
    }

    function phCapture(event, props) {
        if (global.posthog && typeof global.posthog.capture === 'function') {
            try {
                global.posthog.capture(event, props || {});
            } catch (e) { /* */ }
        }
    }

    function track(name, props) {
        var p = props || {};
        gtagEvent(name, p);
        phCapture(name, p);
    }

    function pageView(page, extra) {
        var path = (global.location.pathname || '') + (global.location.search || '');
        var title = document.title || '';
        gtagEvent('page_view', Object.assign({ page_path: path, page_title: title, page_location: global.location.href, gc_page: page }, extra || {}));
        phCapture('$pageview', Object.assign({ gc_page: page, $current_url: global.location.href }, extra || {}));
    }

    function productView(product) {
        if (!product) return;
        var id = product.id != null ? String(product.id) : '';
        track('product_view', {
            product_id: id,
            sku: product.sku || '',
            product_name: (product.name || '').slice(0, 120),
        });
    }

    function addToCart(line) {
        track('add_to_cart', {
            product_id: line.product_id != null ? String(line.product_id) : '',
            quantity: line.quantity || 1,
            sku: line.sku || line.variant_sku || '',
        });
    }

    function viewCart(cartSummary) {
        track('view_cart', {
            item_count: cartSummary && cartSummary.item_count != null ? cartSummary.item_count : 0,
            cart_subtotal_estimate: cartSummary && cartSummary.subtotal != null ? cartSummary.subtotal : undefined,
        });
    }

    function beginCheckout() {
        track('begin_checkout', {});
    }

    function checkoutQuote(quote) {
        if (!quote) return;
        track('checkout_quote', {
            value: quote.total,
            currency: 'USD',
            subtotal: quote.subtotal,
            shipping: quote.shipping,
            tax: quote.tax,
        });
    }

    /**
     * @param {object} p
     */
    function purchase(p) {
        var items = (p.items || []).map(function (i) {
            return {
                item_id: String(i.product_id != null ? i.product_id : i.sku || ''),
                item_name: (i.name || '').slice(0, 100),
                quantity: i.quantity || 1,
                price: i.unit_price != null ? Number(i.unit_price) : 0,
            };
        });
        gtagEvent('purchase', {
            transaction_id: String(p.order_id || p.order_number || ''),
            value: Number(p.total) || 0,
            currency: 'USD',
            shipping: Number(p.shipping) || 0,
            tax: Number(p.tax) || 0,
            items: items,
            payment_type: p.payment_method || '',
            customer_type: p.customer_type || '',
        });
        phCapture('purchase', {
            order_id: p.order_id,
            order_number: p.order_number,
            revenue: Number(p.total) || 0,
            shipping: Number(p.shipping) || 0,
            tax: Number(p.tax) || 0,
            subtotal: Number(p.subtotal) || 0,
            payment_method: p.payment_method,
            customer_type: p.customer_type,
            items: p.items,
        });
    }

    function reorder(kind, detail) {
        track('reorder', Object.assign({ kind: kind || 'unknown' }, detail || {}));
    }

    function net30Started() {
        track('net30_application_started', {});
    }

    function net30Submitted() {
        track('net30_application_submitted', {});
    }

    function quoteRequested() {
        track('quote_requested', {});
    }

    function contactSubmitted() {
        track('contact_submitted', {});
    }

    mergeAttribution();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initThirdParty();
        });
    } else {
        initThirdParty();
    }

    global.GloveCubsAnalytics = {
        getAttributionPayload: getAttributionPayload,
        track: track,
        pageView: pageView,
        productView: productView,
        addToCart: addToCart,
        viewCart: viewCart,
        beginCheckout: beginCheckout,
        checkoutQuote: checkoutQuote,
        purchase: purchase,
        reorder: reorder,
        net30Started: net30Started,
        net30Submitted: net30Submitted,
        quoteRequested: quoteRequested,
        contactSubmitted: contactSubmitted,
        initThirdParty: initThirdParty,
    };
})(typeof window !== 'undefined' ? window : this);
