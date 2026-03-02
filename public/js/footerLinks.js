/**
 * GloveCubs footer — single source of truth for all footer links and brand chips.
 * All internal links use real paths (no "#"). Brand chips link to /gloves?brand=Name.
 */
(function (global) {
    'use strict';

    var quickLinks = [
        { label: 'All Products', href: '/gloves', navigatePage: 'products' },
        { label: 'Disposable Gloves', href: '/gloves/disposable-gloves/', navigatePage: 'products', navigateParams: { categorySegment: 'disposable-gloves' } },
        { label: 'Reusable Work Gloves', href: '/gloves/work-gloves/', navigatePage: 'products', navigateParams: { categorySegment: 'work-gloves' } },
        { label: 'B2B Program', href: '/b2b', navigatePage: 'b2b' }
    ];

    var topBrands = [
        { name: 'Hospeco', slug: 'hospeco', href: '/gloves?brand=Hospeco' },
        { name: 'Global Glove', slug: 'global-glove', href: '/gloves?brand=Global%20Glove' },
        { name: 'Safeko', slug: 'safeko', href: '/gloves?brand=Safeko' },
        { name: 'PIP', slug: 'pip', href: '/gloves?brand=PIP' },
        { name: 'Growl Gloves', slug: 'growl-gloves', href: '/gloves?brand=Growl%20Gloves' },
        { name: 'Semper Guard', slug: 'semper-guard', href: '/gloves?brand=Semper%20Guard' }
    ];

    var contactLinks = [
        { type: 'phone', label: '1-800-GLOVECUBS', href: 'tel:+18004568328' },
        { type: 'email', label: 'sales@glovecubs.com', href: 'mailto:sales@glovecubs.com' },
        { type: 'address', label: 'Salt Lake City, UT', href: 'https://www.google.com/maps/search/?api=1&query=Salt+Lake+City+UT', external: true },
        { type: 'hours', label: 'Mon-Fri: 8AM - 6PM MST', href: null }
    ];

    var socialLinks = [
        { label: 'Facebook', href: 'https://facebook.com/glovecubs', external: true, icon: 'fab fa-facebook-f' },
        { label: 'Twitter', href: 'https://twitter.com/glovecubs', external: true, icon: 'fab fa-twitter' },
        { label: 'LinkedIn', href: 'https://linkedin.com/company/glovecubs', external: true, icon: 'fab fa-linkedin-in' },
        { label: 'Instagram', href: 'https://instagram.com/glovecubs', external: true, icon: 'fab fa-instagram' }
    ];

    var homeHref = '/';
    var footerLogoHref = '/';

    global.FOOTER_LINKS = {
        quickLinks: quickLinks,
        topBrands: topBrands,
        contactLinks: contactLinks,
        socialLinks: socialLinks,
        homeHref: homeHref,
        footerLogoHref: footerLogoHref
    };
})(typeof window !== 'undefined' ? window : this);
