/**
 * Shared cart shipping-config parsing + policy (browser + Node tests via UMD).
 * Loaded before app.js. Do not invent defaults — invalid API payload => null parse.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GloveCubsCommerceShippingConfig = factory();
    }
}(typeof self !== 'undefined' ? self : this, function factory() {
    'use strict';

    function parseCommerceShippingConfigResponse(raw) {
        if (!raw || typeof raw !== 'object') return null;
        function reqNonNegNum(v) {
            if (v === null || v === undefined || v === '') return null;
            var x = Number(v);
            if (!isFinite(x) || x < 0) return null;
            return x;
        }
        var freeShippingThreshold = reqNonNegNum(raw.free_shipping_threshold);
        var flatShippingRate = reqNonNegNum(raw.flat_shipping_rate);
        var minOrderAmount = reqNonNegNum(raw.min_order_amount);
        if (freeShippingThreshold === null || flatShippingRate === null || minOrderAmount === null) return null;
        return { freeShippingThreshold: freeShippingThreshold, flatShippingRate: flatShippingRate, minOrderAmount: minOrderAmount };
    }

    function cartShouldEnforceMinOrderBlock(configLoaded, cfg, subtotal) {
        if (!configLoaded || !cfg) return false;
        return cfg.minOrderAmount > 0 && subtotal < cfg.minOrderAmount;
    }

    function cartShouldShowFreeShippingCountdown(configLoaded, cfg, subtotal) {
        if (!configLoaded || !cfg) return false;
        return cfg.freeShippingThreshold > 0 && subtotal < cfg.freeShippingThreshold;
    }

    return {
        parseCommerceShippingConfigResponse: parseCommerceShippingConfigResponse,
        cartShouldEnforceMinOrderBlock: cartShouldEnforceMinOrderBlock,
        cartShouldShowFreeShippingCountdown: cartShouldShowFreeShippingCountdown,
    };
}));
