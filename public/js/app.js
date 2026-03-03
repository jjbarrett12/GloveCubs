// ============================================
// GLOVECUBS - Main Application JavaScript
// ============================================

// Category display name: internal value "Work Gloves" is shown as "Reusable Work Gloves" site-wide.
function getCategoryDisplayName(category) {
    if (category === 'Work Gloves') return 'Reusable Work Gloves';
    return category || '';
}

// Brand name -> logo filename (without .png). Used for brands strip and footer.
const BRAND_TO_LOGO_SLUG = {
    'Hospeco': 'hospeco',
    'Global Glove': 'global-glove',
    'Safeko': 'safeko',
    'PIP': 'pip',
    'Ansell': 'ansell',
    'SHOWA': 'showa',
    'Growl Gloves': 'growl-gloves',
    'Semper Guard': 'semper-guard',
    'Ammex': 'ammex',
    'Tradex': 'tradex'
};
// Logo filename overrides: brand -> exact filename in public/images/logos/ (when different from slug.svg)
var BRAND_LOGO_FILENAME = {
    'Hospeco': 'Hospeco.jpg',
    'Global Glove': 'Global_Glove.png',
    'Safeko': 'Safeko.png',
    'PIP': 'pip-global-safety-logo.png',
    'Growl Gloves': 'Growl Gloves.webp',
    'Ansell': 'Ansell.png',
    'SHOWA': 'SHOWA.png',
    'Semper Guard': 'Semper.png',
    'Ammex': 'Ammex.png',
    'Tradex': 'Tradex.png'
};
function getBrandLogoPath(brand) {
    if (!brand) return null;
    var exact = BRAND_LOGO_FILENAME[brand];
    if (exact) return '/images/logos/' + exact;
    var slug = BRAND_TO_LOGO_SLUG[brand];
    return slug ? '/images/logos/' + slug + '.svg' : null;
}
var HOME_BRAND_LIST = ['Hospeco','Global Glove','Safeko','PIP','Ansell','SHOWA','Growl Gloves','Semper Guard','Ammex','Tradex'];
function getBrandLogoItemHtml(b) {
    var logo = getBrandLogoPath(b);
    var q = (b || '').replace(/'/g, "\\'");
    var esc = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    if (logo) return '<a href="#" class="brand-logo-link" onclick="filterByBrand(\'' + q + '\'); return false;" title="' + esc(b) + '"><img src="' + logo + '" alt="' + esc(b) + '" class="brand-logo-img" loading="lazy" onerror="this.style.display=\'none\'; this.nextElementSibling && (this.nextElementSibling.style.display=\'inline\');"><span class="brand-logo-fallback" style="display:none;">' + esc(b) + '</span></a>';
    return '<a href="#" onclick="filterByBrand(\'' + q + '\'); return false;" class="brand-logo-fallback-only">' + esc(b) + '</a>';
}

// State management
let state = {
    user: null,
    cart: [],
    products: [],
    currentPage: 'home',
    filters: {
        category: null,
        brand: null,
        material: null,
        powder: null,
        thickness: null,
        size: null,
        color: null,
        grade: null,
        useCase: null,
        compliance: null,
        cutLevel: null,
        punctureLevel: null,
        abrasionLevel: null,
        flameResistant: null,
        arcLevel: null,
        warmRating: null,
        texture: null,
        cuffStyle: null,
        handOrientation: null,
        packaging: null,
        sterility: null,
        priceMin: null,
        priceMax: null,
        search: ''
    }
};

// Generate or get session ID for cart
function getSessionId() {
    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
}

// API helper: clear token and return friendly error when server says session/token is invalid or expired
function handleAuthError(response, data) {
    if (response.status !== 401 && response.status !== 403) return null;
    const msg = (data && data.error) ? String(data.error) : '';
    if (!/invalid token|session expired|access denied/i.test(msg)) return null;
    try { localStorage.removeItem('token'); } catch (e) {}
    return new Error('Your session has expired. Please log in again.');
}

const api = {
    baseUrl: '',
    
    getHeaders() {
        const headers = { 
            'Content-Type': 'application/json',
            'X-Session-Id': getSessionId()
        };
        const token = localStorage.getItem('token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    async get(endpoint) {
        try {
            const response = await fetch(this.baseUrl + endpoint, {
                headers: this.getHeaders()
            });
            
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                // If response is HTML, it's likely an error page
                if (text.trim().startsWith('<')) {
                    if (response.status === 401 || response.status === 403) {
                        throw new Error('Authentication required. Please log in again.');
                    }
                    throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}`);
                }
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(`Invalid JSON response. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
                }
            }
            
            if (!response.ok) {
                const authErr = handleAuthError(response, data);
                if (authErr) throw authErr;
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            return data;
        } catch (error) {
            // If it's already our custom error, re-throw it
            if (error.message && !error.message.includes('fetch')) {
                throw error;
            }
            // Otherwise wrap it
            throw new Error(`Network error: ${error.message}`);
        }
    },

    async post(endpoint, data) {
        try {
            const response = await fetch(this.baseUrl + endpoint, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            
            const contentType = response.headers.get('content-type');
            let result;
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                if (text.trim().startsWith('<')) {
                    if (response.status === 401 || response.status === 403) {
                        throw new Error('Authentication required. Please log in again.');
                    }
                    throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}`);
                }
                try {
                    result = JSON.parse(text);
                } catch (e) {
                    throw new Error(`Invalid JSON response. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
                }
            }
            
            if (!response.ok) {
                const authErr = handleAuthError(response, result);
                if (authErr) throw authErr;
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            return result;
        } catch (error) {
            if (error.message && !error.message.includes('fetch')) {
                throw error;
            }
            throw new Error(`Network error: ${error.message}`);
        }
    },

    async put(endpoint, data) {
        try {
            const response = await fetch(this.baseUrl + endpoint, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            
            const contentType = response.headers.get('content-type');
            let result;
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                if (text.trim().startsWith('<')) {
                    if (response.status === 401 || response.status === 403) {
                        throw new Error('Authentication required. Please log in again.');
                    }
                    throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}`);
                }
                try {
                    result = JSON.parse(text);
                } catch (e) {
                    throw new Error(`Invalid JSON response. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
                }
            }
            
            if (!response.ok) {
                const authErr = handleAuthError(response, result);
                if (authErr) throw authErr;
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            return result;
        } catch (error) {
            if (error.message && !error.message.includes('fetch')) {
                throw error;
            }
            throw new Error(`Network error: ${error.message}`);
        }
    },

    async delete(endpoint) {
        try {
            const response = await fetch(this.baseUrl + endpoint, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            
            const contentType = response.headers.get('content-type');
            let result;
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const text = await response.text();
                if (text.trim().startsWith('<')) {
                    if (response.status === 401 || response.status === 403) {
                        throw new Error('Authentication required. Please log in again.');
                    }
                    throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}`);
                }
                try {
                    result = JSON.parse(text);
                } catch (e) {
                    throw new Error(`Invalid JSON response. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
                }
            }
            
            if (!response.ok) {
                const authErr = handleAuthError(response, result);
                if (authErr) throw authErr;
                throw new Error(result.error || `HTTP error! status: ${response.status}`);
            }
            return result;
        } catch (error) {
            if (error.message && !error.message.includes('fetch')) {
                throw error;
            }
            throw new Error(`Network error: ${error.message}`);
        }
    }
};

// ============================================
// SEO: Clean URLs & slug helpers
// ============================================

function slugify(text) {
    if (!text) return '';
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getProductUrl(product) {
    if (!product) return '#';
    const slug = product.slug || slugify(product.name || '');
    const segment = (product.material || product.subcategory || product.category || 'gloves').toString().toLowerCase().replace(/\s+/g, '-');
    if (!slug) return `#products?id=${product.id}`;
    return `/gloves/${segment}/${slug}/`;
}

function getProductSizeUrl(product, size) {
    if (!product || !size) return getProductUrl(product);
    const slug = product.slug || slugify(product.name || '');
    const segment = (product.material || product.subcategory || product.category || 'gloves').toString().toLowerCase().replace(/\s+/g, '-');
    if (!slug) return `#products?id=${product.id}`;
    return `/gloves/${segment}/${slug}/size/${String(size).toLowerCase().replace(/\s+/g, '-')}/`;
}

function parseSeoPath() {
    const path = (window.location.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/') return null;
    const industriesMatch = path.match(/^\/industries\/([^/]+)\/?$/);
    if (industriesMatch) return { type: 'industry', industry: industriesMatch[1] };
    const sizeMatch = path.match(/^\/gloves\/([^/]+)\/([^/]+)\/size\/([^/]+)\/?$/);
    if (sizeMatch) return { type: 'product-size', category: sizeMatch[1], slug: sizeMatch[2], size: sizeMatch[3] };
    const productMatch = path.match(/^\/gloves\/([^/]+)\/([^/]+)\/?$/);
    if (productMatch) return { type: 'product', category: productMatch[1], slug: productMatch[2] };
    const categoryMatch = path.match(/^\/gloves\/([^/]+)\/?$/);
    if (categoryMatch) return { type: 'category', category: categoryMatch[1] };
    if (path === '/gloves' || path === '/gloves/') return { type: 'products' };
    if (path === '/b2b') return { type: 'b2b' };
    if (path === '/contact') return { type: 'contact' };
    if (path === '/glove-finder') return { type: 'glove-finder' };
    if (path === '/invoice-savings') return { type: 'invoice-savings' };
    if (path === '/admin' || path === '/admin/') return { type: 'admin', subPath: '' };
    if (path === '/admin/products/new-from-url') return { type: 'admin', subPath: 'products/new-from-url' };
    if (path.indexOf('/admin/') === 0) return { type: 'admin', subPath: path.replace(/^\/admin\/?/, '') };
    return null;
}

function parseProductsSearchParams() {
    var search = (window.location.search || '').replace(/^\?/, '');
    if (!search) return;
    var params = new URLSearchParams(search);
    var brand = params.get('brand');
    if (brand) state.filters.brand = decodeURIComponent(brand);
}

function setPageMeta(title, description) {
    if (title) document.title = title + (title.indexOf('Glovecubs') === -1 ? ' | Glovecubs' : '');
    let metaDesc = document.querySelector('meta[name="description"]');
    if (description && metaDesc) metaDesc.setAttribute('content', description);
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (title && ogTitle) ogTitle.setAttribute('content', title);
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (description && ogDesc) ogDesc.setAttribute('content', description);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getDiscountPercent(tier) {
    if (!tier) return 0;
    switch (tier.toLowerCase()) {
        case 'bronze': return 5;
        case 'silver': return 10;
        case 'gold': return 15;
        case 'platinum': return 20;
        default: return 0;
    }
}

// ============================================
// INITIALIZATION
// ============================================

async function runAppInit() {
    if (window.__glovecubsInitDone) return;
    window.__glovecubsInitDone = true;
    clearOverlaysAndModals();
    const main = document.getElementById('mainContent');
    const showNavError = () => {
        if (main) main.innerHTML = '<div class="container" style="padding: 60px 20px; text-align: center;"><h2 style="margin-bottom: 12px;">Something went wrong</h2><p style="color: var(--gray-600); margin-bottom: 16px;">The page could not load. Try <a href="/">going to the home page</a> or <a href="#" onclick="window.location.reload(); return false;">refreshing</a>.</p><p style="font-size: 14px; color: var(--gray-500);">If the problem continues, check the browser console (F12) for errors.</p></div>';
    };
    try {
        const resetToken = getResetTokenFromHash();
        if (resetToken) {
            await navigate('reset-password', { token: resetToken });
            if (window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } else {
            const seo = parseSeoPath();
            if (seo) {
                if (seo.type === 'industry') await navigate('industry', { industry: seo.industry });
                else if (seo.type === 'product-size') await navigate('product', { slug: seo.slug, category: seo.category, size: seo.size });
                else if (seo.type === 'product') await navigate('product', { slug: seo.slug, category: seo.category });
                else if (seo.type === 'category') await navigate('products', { categorySegment: seo.category });
                else if (seo.type === 'products') {
                    parseProductsSearchParams();
                    await navigate('products');
                }
                else if (seo.type === 'b2b') await navigate('b2b');
                else if (seo.type === 'contact') await navigate('contact');
                else if (seo.type === 'glove-finder') await navigate('glove-finder');
                else if (seo.type === 'invoice-savings') await navigate('invoice-savings');
                else if (seo.type === 'admin') await navigate('admin', { subPath: seo.subPath || '' });
                else await navigate('home');
            } else {
                await navigate('home');
            }
        }
    } catch (navError) {
        console.error('Initial navigation failed:', navError);
        showNavError();
    }

    try {
        initTheme();
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (token && userData) {
            try {
                state.user = JSON.parse(userData);
                updateHeaderAccount();
            } catch (e) {
                console.error('Error parsing user data:', e);
            }
        }
        Promise.all([loadCart(), loadBrands()]).catch(err => console.error('Error loading initial data:', err));
        initFooter();

        // SEO: handle browser back/forward on clean URLs
        window.addEventListener('popstate', () => {
            const seo = parseSeoPath();
            if (seo && seo.type === 'industry') navigate('industry', { industry: seo.industry });
            else if (seo && seo.type === 'product-size') navigate('product', { slug: seo.slug, category: seo.category, size: seo.size });
            else if (seo && seo.type === 'product') navigate('product', { slug: seo.slug, category: seo.category });
            else if (seo && seo.type === 'category') navigate('products', { categorySegment: seo.category });
            else if (seo && seo.type === 'products') { parseProductsSearchParams(); navigate('products'); }
            else if (seo && seo.type === 'b2b') navigate('b2b');
            else if (seo && seo.type === 'contact') navigate('contact');
            else if (seo && seo.type === 'glove-finder') navigate('glove-finder');
            else if (seo && seo.type === 'invoice-savings') navigate('invoice-savings');
            else if (seo && seo.type === 'admin') navigate('admin', { subPath: seo.subPath || '' });
            else if (!window.location.pathname || window.location.pathname === '/') navigate('home');
        });

        // Setup search with real-time search and Enter key support
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();
                state.filters.search = query;
                // Debounce search - wait 500ms after user stops typing
                searchTimeout = setTimeout(() => {
                    if (query.length > 0) {
                        if (state.currentPage !== 'products') {
                            navigate('products');
                        } else {
                            loadProducts();
                        }
                    } else if (state.currentPage === 'products') {
                        // Clear search if input is empty
                        state.filters.search = '';
                        loadProducts();
                    }
                }, 500);
            });
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(searchTimeout);
                    searchProducts();
                }
            });
        }
    } catch (error) {
        console.error('Initialization error:', error);
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.innerHTML = `
                <section style="padding: 80px 20px; text-align: center;">
                    <h1 style="color: #111111; margin-bottom: 16px;">Error Loading Page</h1>
                    <p style="color: #4B5563; margin-bottom: 24px;">Please refresh the page. If the problem persists, check the browser console.</p>
                    <button onclick="window.location.reload()" style="background: #FF7A00; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
                        Refresh Page
                    </button>
                </section>
            `;
        }
    }
}

function initFooter() {
    var config = typeof window.FOOTER_LINKS !== 'undefined' ? window.FOOTER_LINKS : null;
    if (!config) return;
    var container = document.getElementById('footerContainer');
    if (!container) return;
    function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
    function quickLinkAttrs(link) {
        var href = link.href || '#';
        if (link.navigatePage) {
            var params = link.navigateParams || {};
            var parts = [];
            for (var k in params) { if (params.hasOwnProperty(k)) parts.push(k + ":\'" + String(params[k]).replace(/'/g, "\\'") + "\'"); }
            var arg2 = parts.length ? '{' + parts.join(',') + '}' : '{}';
            return ' href="' + esc(href) + '" onclick="event.preventDefault(); navigate(\'' + esc(link.navigatePage) + '\', ' + arg2 + '); return false;"';
        }
        return ' href="' + esc(href) + '"';
    }
    var quickHtml = '';
    (config.quickLinks || []).forEach(function (link) {
        var attrs = quickLinkAttrs(link);
        quickHtml += '<li><a' + attrs + '>' + esc(link.label) + '</a></li>';
    });
    var brandHtml = '';
    (config.topBrands || []).forEach(function (b) {
        var attrs = ' href="' + esc(b.href) + '" onclick="event.preventDefault(); navigate(\'products\', { brand: \'' + esc(b.name).replace(/'/g, "\\'") + '\' }); return false;" title="' + esc(b.name) + '"';
        brandHtml += '<a' + attrs + ' class="footer-brand-link footer-brand-name">' + esc(b.name) + '</a>';
    });
    var contactHtml = '';
    (config.contactLinks || []).forEach(function (c) {
        if (c.href && !c.external) {
            contactHtml += '<li><i class="fas fa-' + (c.type === 'phone' ? 'phone' : c.type === 'email' ? 'envelope' : c.type === 'address' ? 'map-marker-alt' : 'clock') + '"></i> <a href="' + esc(c.href) + '">' + esc(c.label) + '</a></li>';
        } else if (c.href && c.external) {
            contactHtml += '<li><i class="fas fa-map-marker-alt"></i> <a href="' + esc(c.href) + '" target="_blank" rel="noopener noreferrer">' + esc(c.label) + '</a></li>';
        } else {
            contactHtml += '<li><i class="fas fa-clock"></i> ' + esc(c.label) + '</li>';
        }
    });
    var socialHtml = '';
    (config.socialLinks || []).forEach(function (s) {
        socialHtml += '<a href="' + esc(s.href) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(s.label) + '"><i class="' + (s.icon || 'fas fa-link') + '"></i></a>';
    });
    var logoHref = config.footerLogoHref || config.homeHref || '/';
    var logoOnclick = ' onclick="event.preventDefault(); navigate(\'home\'); return false;"';
    container.innerHTML =
        '<div class="footer-grid">' +
            '<div class="footer-col">' +
                '<div class="footer-logo">' +
                    '<a href="' + esc(logoHref) + '" class="footer-logo-link"' + logoOnclick + '><img src="/images/logo.png" alt="Glovecubs" class="footer-logo-image"><span class="sr-only">Home</span></a>' +
                '</div>' +
                '<p>Your trusted source for professional-grade disposable and reusable work gloves. Serving businesses nationwide with quality products from top manufacturers.</p>' +
                '<div class="social-links">' + socialHtml + '</div>' +
            '</div>' +
            '<div class="footer-col"><h4>Quick Links</h4><ul>' + quickHtml + '</ul></div>' +
            '<div class="footer-col"><h4>Top Brands</h4><div class="footer-brand-logos">' + brandHtml + '</div></div>' +
            '<div class="footer-col"><h4>Contact Us</h4><ul class="contact-info">' + contactHtml + '</ul></div>' +
        '</div>' +
        '<div class="footer-bottom">' +
            '<p>&copy; 2026 Glovecubs. All rights reserved.</p>' +
            '<div class="payment-icons"><i class="fab fa-cc-visa"></i><i class="fab fa-cc-mastercard"></i><i class="fab fa-cc-amex"></i><i class="fab fa-cc-discover"></i><i class="fab fa-cc-paypal"></i></div>' +
        '</div>';
}
window.initFooter = initFooter;

window.runAppInit = runAppInit;
window.navigate = navigate;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runAppInit);
else runAppInit();

// ============================================
// NAVIGATION
// ============================================

function clearOverlaysAndModals() {
    var sidebar = document.getElementById('cartSidebar');
    var overlay = document.getElementById('cartOverlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }
    var loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.remove('open');
    var rfq = document.getElementById('rfqModalOverlay');
    if (rfq) rfq.remove();
    var budget = document.getElementById('budgetModalOverlay');
    if (budget) { budget.style.display = 'none'; budget.onclick = null; }
    var invoice = document.getElementById('invoiceModalOverlay');
    if (invoice) { invoice.style.display = 'none'; invoice.innerHTML = ''; invoice.onclick = null; }
    var shipTo = document.getElementById('shipToModalOverlay');
    if (shipTo) { shipTo.style.display = 'none'; shipTo.onclick = null; }
    var importResults = document.getElementById('importResultsModalOverlay');
    if (importResults) importResults.remove();
    if (document.body && document.body.style) document.body.style.overflow = '';
}
window.clearOverlaysAndModals = clearOverlaysAndModals;

async function navigate(page, params = {}) {
    try {
        state.currentPage = page;
        clearOverlaysAndModals();
        let mainContent = document.getElementById('mainContent');
        if (!mainContent) {
            console.warn('mainContent not found, retrying...');
            await new Promise(r => setTimeout(r, 50));
            mainContent = document.getElementById('mainContent');
        }
        if (!mainContent) {
            console.error('mainContent element not found');
            setTimeout(() => navigate(page, params), 100);
            return;
        }
        
        // Close mobile menu if open
        const mainNav = document.getElementById('mainNav');
        if (mainNav) {
            mainNav.classList.remove('open');
        }
        const headerNav = document.querySelector('.header-nav-secondary');
        if (headerNav) {
            headerNav.classList.remove('mobile-open');
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        switch (page) {
        case 'home':
            try {
                await renderHomePage();
            } catch (err) {
                console.error('Failed to render homepage:', err);
                if (mainContent) {
                    mainContent.innerHTML = '<section style="padding: 80px 20px; text-align: center;"><h1 style="color: #111111;">Welcome to Glovecubs</h1><p style="color: #4B5563;">Please refresh the page.</p><button onclick="window.location.reload()" style="background: #FF7A00; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 16px;">Refresh</button></section>';
                }
            }
            break;
        case 'products':
            if (params.brand) state.filters.brand = params.brand;
            await renderProductsPage(params.categorySegment ? { categorySegment: params.categorySegment } : undefined);
            break;
        case 'product':
            if (params.slug) {
                await renderProductPage(null, { slug: params.slug, category: params.category, size: params.size });
            } else {
                await renderProductPage(params.id);
            }
            break;
        case 'industry':
            await renderIndustryPage(params.industry);
            break;
        case 'cart':
            await renderCartPage();
            toggleCartSidebar(false);
            break;
        case 'checkout':
            await renderCheckoutPage();
            toggleCartSidebar(false);
            break;
        case 'login':
            renderLoginPage();
            break;
        case 'register':
            renderRegisterPage();
            break;
        case 'dashboard':
            if (state.user) {
                await renderDashboardPage();
            } else {
                navigate('login');
            }
            break;
        case 'b2b':
            renderB2BPage();
            break;
        case 'contact':
            renderContactPage();
            break;
        case 'glove-finder':
            renderGloveFinderPage();
            break;
        case 'invoice-savings':
            renderInvoiceSavingsPage();
            break;
        case 'about':
            renderAboutPage();
            break;
        case 'faq':
            renderFAQPage();
            break;
        case 'admin':
            if (params && params.subPath === 'products/new-from-url') {
                state.adminTab = 'products';
                state.adminProductsView = 'new-from-url';
                state.adminNewFromUrlPayload = null;
                state.adminNewFromUrlParseResult = null;
                state.adminNewFromUrlUrl = '';
            }
            renderAdminPanel(state.adminTab || 'orders');
            break;
        case 'ai-advisor':
            state.aiAdvisorPrefill = params.prefill || null;
            renderAIAdvisor();
            break;
        case 'cost-analysis':
            renderCostAnalysis();
            break;
        case 'forgot-password':
            renderForgotPasswordPage();
            break;
        case 'reset-password':
            renderResetPasswordPage(params.token || getResetTokenFromHash());
            break;
        case '404':
            render404Page();
            break;
        default:
            render404Page();
        }
        updateThemeForPage(page);
        updateHeaderAccount();
    } catch (error) {
        console.error('Navigation error:', error);
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.innerHTML = `
                <section style="padding: 80px 20px; text-align: center;">
                    <h1 style="color: #111111; margin-bottom: 16px;">Error Loading Page</h1>
                    <p style="color: #4B5563; margin-bottom: 24px;">${error.message || 'An error occurred'}</p>
                    <button onclick="navigate('home')" style="background: #FF7A00; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
                        Go to Homepage
                    </button>
                </section>
            `;
        }
    }
}

// ============================================
// HOME PAGE
// ============================================

async function renderHomePage() {
    setPageMeta('Glovecubs - Professional Disposable & Reusable Work Gloves | B2B Glove Distributor', 'Glovecubs is your trusted B2B distributor for disposable and reusable work gloves. 1,000+ SKUs from top manufacturers. Bulk pricing, net terms, fast fulfillment from Salt Lake City, UT.');
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) {
        console.error('mainContent element not found');
        return;
    }

    // Show full page immediately with spinner in products section
    const productsPlaceholder = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.9);"><div class="spinner" style="margin: 0 auto 16px; width: 40px; height: 40px; border: 3px solid rgba(255,122,0,0.3); border-top-color: #FF7A00; border-radius: 50%; animation: spin 0.8s linear infinite;"></div><p>Loading products...</p></div>';
    
    mainContent.innerHTML = `
        <!-- Hero Section (Two-Column, B2B-Focused) - Dark -->
        <section class="hero-new home-hero-dark" style="position: relative; overflow: hidden; background: linear-gradient(180deg, #111111 0%, #1a1a1a 50%, #0d1117 100%); padding: 24px 0 60px;">
            <div style="position: absolute; top: -100px; right: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(255,122,0,0.15) 0%, transparent 70%); border-radius: 50%; animation: pulse 8s ease-in-out infinite; pointer-events: none; z-index: 0;"></div>
            <div style="position: absolute; bottom: -150px; left: -150px; width: 500px; height: 500px; background: radial-gradient(circle, rgba(255,122,0,0.08) 0%, transparent 70%); border-radius: 50%; animation: pulse 10s ease-in-out infinite; animation-delay: 2s; pointer-events: none; z-index: 0;"></div>
            <style>
                @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 0.8; } }
                @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
            </style>
            <div class="container" style="position: relative; z-index: 1;">
                <div class="hero-new-content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; max-width: 1400px; margin: 0 auto;">
                    <div class="hero-left">
                        <div style="display: inline-block; background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); color: #ffffff; padding: 8px 20px; border-radius: 30px; font-size: 13px; font-weight: 600; margin-bottom: 24px; box-shadow: 0 4px 15px rgba(255,122,0,0.4); animation: float 3s ease-in-out infinite;">
                            <i class="fas fa-star" style="margin-right: 6px;"></i>1,000+ SKUs Available
                        </div>
                        <h1 style="font-size: 56px; font-weight: 900; line-height: 1.1; margin-bottom: 20px; color: #ffffff;">
                            Built for Operators Who Buy by the Case
                        </h1>
                        <p style="font-size: 20px; color: rgba(255,255,255,0.9); line-height: 1.6; margin-bottom: 28px; font-weight: 400;">
                            Distributor-level pricing. No contracts. No games.
                        </p>
                        <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-lg" onclick="navigate('b2b')" style="padding: 16px 32px; font-size: 16px; font-weight: 700; background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); border: none; border-radius: 12px; color: #ffffff; box-shadow: 0 8px 25px rgba(255,122,0,0.4); transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 12px 35px rgba(255,122,0,0.6)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 25px rgba(255,122,0,0.4)';">
                                <i class="fas fa-tag" style="margin-right: 8px;"></i>Get Distributor Pricing
                            </button>
                            <button class="btn btn-outline btn-lg" onclick="navigate('ai-advisor')" style="padding: 16px 32px; font-size: 16px; font-weight: 700; border: 3px solid #FF7A00; color: #FF7A00; background: rgba(255,122,0,0.1); border-radius: 12px; transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.background='rgba(255,122,0,0.2)'; this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 25px rgba(255,122,0,0.3)';" onmouseout="this.style.background='rgba(255,122,0,0.1)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                                <i class="fas fa-robot" style="margin-right: 8px;"></i>Try AI Glove Finder
                            </button>
                        </div>
                        <div style="display: flex; gap: 32px; flex-wrap: wrap; font-size: 15px; margin-bottom: 32px;">
                            <a href="#" onclick="showRFQModal(); return false;" style="color: #FF7A00; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 8px; transition: all 0.3s ease;" onmouseover="this.style.color='rgba(255,122,0,0.85)'; this.style.transform='translateX(5px)';" onmouseout="this.style.color='#FF7A00'; this.style.transform='translateX(0)';">
                                <i class="fas fa-bolt" style="font-size: 14px;"></i>Request an RFQ in 60 seconds <i class="fas fa-arrow-right" style="font-size: 12px;"></i>
                            </a>
                            <a href="#" onclick="navigate('contact'); return false;" style="color: rgba(255,255,255,0.8); font-weight: 500; text-decoration: none; display: flex; align-items: center; gap: 8px; transition: all 0.3s ease;" onmouseover="this.style.color='#FF7A00'; this.style.transform='translateX(5px)';" onmouseout="this.style.color='rgba(255,255,255,0.8)'; this.style.transform='translateX(0)';">
                                <i class="fas fa-headset" style="font-size: 14px;"></i>Talk to a glove specialist <i class="fas fa-arrow-right" style="font-size: 12px;"></i>
                            </a>
                        </div>
                        <div class="hero-card hero-trust-badges-card" style="background: #ffffff; border: 2px solid rgba(255,122,0,0.4); border-radius: 16px; padding: 24px; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                            <div class="hero-trust-badges" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; font-size: 13px;">
                                <div class="hero-trust-badge" style="padding: 14px; border-radius: 10px; transition: all 0.3s ease;" onmouseover="this.style.background='rgba(255,122,0,0.12)'; this.style.transform='translateY(-3px)'; this.style.borderColor='rgba(255,122,0,0.3)';" onmouseout="this.style.background=''; this.style.transform='translateY(0)'; this.style.borderColor='';">
                                    <div style="font-size: 24px; color: #FF7A00; margin-bottom: 8px;"><i class="fas fa-file-invoice-dollar"></i></div>
                                    <div class="hero-trust-badge-title">Net Terms</div>
                                    <div class="hero-trust-badge-subtitle">Approved accounts</div>
                                </div>
                                <div class="hero-trust-badge" style="padding: 14px; border-radius: 10px; transition: all 0.3s ease;" onmouseover="this.style.background='rgba(255,122,0,0.12)'; this.style.transform='translateY(-3px)'; this.style.borderColor='rgba(255,122,0,0.3)';" onmouseout="this.style.background=''; this.style.transform='translateY(0)'; this.style.borderColor='';">
                                    <div style="font-size: 24px; color: #FF7A00; margin-bottom: 8px;"><i class="fas fa-boxes"></i></div>
                                    <div class="hero-trust-badge-title">Case & Pallet</div>
                                    <div class="hero-trust-badge-subtitle">Bulk ordering</div>
                                </div>
                                <div class="hero-trust-badge" style="padding: 14px; border-radius: 10px; transition: all 0.3s ease;" onmouseover="this.style.background='rgba(255,122,0,0.12)'; this.style.transform='translateY(-3px)'; this.style.borderColor='rgba(255,122,0,0.3)';" onmouseout="this.style.background=''; this.style.transform='translateY(0)'; this.style.borderColor='';">
                                    <div style="font-size: 24px; color: #FF7A00; margin-bottom: 8px;"><i class="fas fa-user-tie"></i></div>
                                    <div class="hero-trust-badge-title">Dedicated Rep</div>
                                    <div class="hero-trust-badge-subtitle">Repeat ordering</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="hero-right">
                        <div style="display: flex; flex-direction: column; gap: 16px;">
                            <div class="hero-card hero-card-builder" style="background: #ffffff; border: 3px solid #FF7A00; border-radius: 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.3); position: relative; overflow: hidden; transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-6px)'; this.style.boxShadow='0 16px 50px rgba(0,0,0,0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 12px 40px rgba(0,0,0,0.3)';">
                                <div style="position: absolute; top: -30px; right: -30px; width: 150px; height: 150px; background: radial-gradient(circle, rgba(255,122,0,0.25) 0%, rgba(255,122,0,0.1) 50%, transparent 100%); border-radius: 50%; z-index: 0; animation: float 4s ease-in-out infinite;"></div>
                                <div style="position: relative; z-index: 1;">
                                    <h3 style="font-size: 24px; font-weight: 800; margin-bottom: 8px; color: #111111; display: flex; align-items: center; gap: 12px;">Quick Bulk Builder</h3>
                                    <p style="font-size: 14px; color: #6B7280; margin-bottom: 24px; font-weight: 500;">Build a 10+ case order in under 30 seconds</p>
                                    <div class="hero-builder-fields" style="display: grid; gap: 16px;">
                                        <div>
                                            <label style="font-size: 13px; color: #111111; margin-bottom: 6px; display: block; font-weight: 600;"><i class="fas fa-hand-paper" style="color: #FF7A00; margin-right: 6px; font-size: 11px;"></i>Type:</label>
                                            <select id="bulkBuilderType" style="width: 100%; padding: 12px; border: 2px solid #FF7A00; border-radius: 10px; font-size: 14px; background: #ffffff; color: #111111; font-weight: 500; cursor: pointer;">
                                                <option value="">Select Glove Type</option>
                                                <option>Disposable Gloves</option>
                                                <option>Reusable Gloves</option>
                                                <option>Both</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style="font-size: 13px; color: #111111; margin-bottom: 8px; display: block; font-weight: 600;"><i class="fas fa-industry" style="color: #FF7A00; margin-right: 6px; font-size: 11px;"></i>Use (Select Multiple):</label>
                                            <div id="bulkBuilderUse" class="hero-bulk-builder-use" style="border: 2px solid #FF7A00; border-radius: 10px; padding: 12px; background: #ffffff;">
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Food Service" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Food Service</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Industrial" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Industrial</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Medical" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Medical</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Janitorial" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Janitorial</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Healthcare" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Healthcare</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Food Processing" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Food Processing</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Sanitation" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Sanitation</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Laboratories" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Laboratories</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Pharmaceuticals" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Pharmaceuticals</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Beauty & Personal Care" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Beauty & Personal Care</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Tattoo & Body Art" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Tattoo & Body Art</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Automotive" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Automotive</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Construction" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Construction</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Manufacturing" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Manufacturing</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 2px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Warehousing" style="width: 16px; height: 16px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 12px; color: #1a1a1a;">Warehousing</span>
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; margin-bottom: 4px;" onmouseover="this.style.background='#fff5f0';" onmouseout="this.style.background='transparent';">
                                                    <input type="checkbox" name="bulkBuilderUse" value="Logistics" style="width: 18px; height: 18px; accent-color: #FF7A00; cursor: pointer;">
                                                    <span style="font-size: 13px; color: #111111;">Logistics</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label style="font-size: 13px; color: #111111; margin-bottom: 6px; display: block; font-weight: 600;"><i class="fas fa-cube" style="color: #FF7A00; margin-right: 6px; font-size: 11px;"></i>Qty:</label>
                                            <select id="bulkBuilderQty" style="width: 100%; padding: 12px; border: 2px solid #FF7A00; border-radius: 10px; font-size: 14px; background: #ffffff; color: #111111; font-weight: 500; cursor: pointer;" onchange="handleBulkBuilderQtyChange(this)">
                                                <option>10 cases</option>
                                                <option>25 cases</option>
                                                <option>50 cases</option>
                                                <option>100+ cases</option>
                                            </select>
                                        </div>
                                        <button class="btn btn-primary" onclick="buildBulkOrder()" style="width: 100%; margin-top: 12px; padding: 14px; font-size: 15px; font-weight: 700; background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); border: none; border-radius: 10px; color: #ffffff; box-shadow: 0 4px 15px rgba(255,122,0,0.4); transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(255,122,0,0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(255,122,0,0.4)';">
                                            <i class="fas fa-rocket" style="margin-right: 8px;"></i>Build My Bulk Order
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="hero-card hero-card-ai-spend" style="background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); border-radius: 16px; color: #ffffff; box-shadow: 0 12px 40px rgba(255,122,0,0.5), inset 0 0 60px rgba(255,255,255,0.1); position: relative; overflow: hidden; transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 16px 50px rgba(255,122,0,0.6), inset 0 0 80px rgba(255,255,255,0.15)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 12px 40px rgba(255,122,0,0.5), inset 0 0 60px rgba(255,255,255,0.1)';">
                                <div class="hero-card-shine" style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%); animation: shine 3s infinite; pointer-events: none;"></div>
                                <style>@keyframes shine { 0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); } 100% { transform: translateX(100%) translateY(100%) rotate(45deg); } }</style>
                                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #ffffff;"><i class="fas fa-chart-line" style="margin-right: 8px;"></i>AI Spend Snapshot</h3>
                                <div class="hero-ai-bullets-scroll" style="background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); padding: 12px; border-radius: 8px; margin-bottom: 14px; font-size: 14px; line-height: 1.6;">
                                    <div style="margin-bottom: 10px;"><i class="fas fa-exclamation-circle" style="margin-right: 8px;"></i>"You may be overbuying thickness for this task."</div>
                                    <div style="margin-bottom: 10px;"><i class="fas fa-dollar-sign" style="margin-right: 8px;"></i>"Switching from Brand A → Brand B could save ~12%."</div>
                                    <div><i class="fas fa-check-circle" style="margin-right: 8px;"></i>"Standardize to 2 SKUs to reduce variance."</div>
                                </div>
                                <button class="btn btn-secondary" onclick="navigate('cost-analysis')" style="width: 100%; background: #ffffff; color: #FF7A00; font-weight: 600; border: none; padding: 12px; border-radius: 10px;">
                                    Upload Invoice for Savings Suggestions
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Trust block: who we serve -->
        <div class="trust-block-below-fold" style="background: #1a1a1a; padding: 20px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08);">
            <p style="margin: 0; font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.9); letter-spacing: 0.02em;">Serving Hospitality • Janitorial Contractors • Healthcare Facilities • Industrial Operators</p>
        </div>

        <!-- Who This Is For -->
        <section class="who-this-is-for" style="background: linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%); padding: 64px 0 72px;">
            <div class="container">
                <div class="section-header" style="text-align: center; margin-bottom: 40px;">
                    <h2 style="color: #111111; font-size: 32px; font-weight: 800; margin-bottom: 12px;">Built for the People Doing the Buying</h2>
                    <p style="color: #4B5563; font-size: 17px; max-width: 560px; margin: 0 auto;">Operators, procurement, and facilities teams—not random shoppers.</p>
                </div>
                <div class="who-blocks-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px;">
                    <a href="/industries/janitorial/" class="who-block who-block-link" style="background: #ffffff; border-radius: 16px; padding: 28px; border: 2px solid #E5E7EB; box-shadow: 0 4px 16px rgba(0,0,0,0.06); transition: all 0.3s ease; text-decoration: none; display: block; color: inherit;" onclick="event.preventDefault(); navigate('industry', { industry: 'janitorial' }); return false;" onmouseover="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.15)'; this.style.transform='translateY(-4px)';" onmouseout="this.style.borderColor='#E5E7EB'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.06)'; this.style.transform='translateY(0)';">
                        <div style="font-size: 36px; margin-bottom: 16px;">🧼</div>
                        <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin-bottom: 10px;">Janitorial Contractors</h3>
                        <p style="font-size: 14px; color: #4B5563; line-height: 1.5; margin: 0;">Reduce cost per building. Standardize SKUs.</p>
                        <span class="who-block-cta" style="display: inline-block; margin-top: 14px; font-size: 14px; font-weight: 600; color: #FF7A00;">View industry page →</span>
                    </a>
                    <a href="/industries/hospitality/" class="who-block who-block-link" style="background: #ffffff; border-radius: 16px; padding: 28px; border: 2px solid #E5E7EB; box-shadow: 0 4px 16px rgba(0,0,0,0.06); transition: all 0.3s ease; text-decoration: none; display: block; color: inherit;" onclick="event.preventDefault(); navigate('industry', { industry: 'hospitality' }); return false;" onmouseover="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.15)'; this.style.transform='translateY(-4px)';" onmouseout="this.style.borderColor='#E5E7EB'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.06)'; this.style.transform='translateY(0)';">
                        <div style="font-size: 36px; margin-bottom: 16px;">🍽</div>
                        <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin-bottom: 10px;">Hospitality</h3>
                        <p style="font-size: 14px; color: #4B5563; line-height: 1.5; margin: 0;">Food-safe vinyl & nitrile at competitive case pricing.</p>
                        <span class="who-block-cta" style="display: inline-block; margin-top: 14px; font-size: 14px; font-weight: 600; color: #FF7A00;">View industry page →</span>
                    </a>
                    <a href="/industries/healthcare/" class="who-block who-block-link" style="background: #ffffff; border-radius: 16px; padding: 28px; border: 2px solid #E5E7EB; box-shadow: 0 4px 16px rgba(0,0,0,0.06); transition: all 0.3s ease; text-decoration: none; display: block; color: inherit;" onclick="event.preventDefault(); navigate('industry', { industry: 'healthcare' }); return false;" onmouseover="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.15)'; this.style.transform='translateY(-4px)';" onmouseout="this.style.borderColor='#E5E7EB'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.06)'; this.style.transform='translateY(0)';">
                        <div style="font-size: 36px; margin-bottom: 16px;">🏥</div>
                        <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin-bottom: 10px;">Healthcare</h3>
                        <p style="font-size: 14px; color: #4B5563; line-height: 1.5; margin: 0;">Medical-grade compliance with reliable stock.</p>
                        <span class="who-block-cta" style="display: inline-block; margin-top: 14px; font-size: 14px; font-weight: 600; color: #FF7A00;">View industry page →</span>
                    </a>
                    <a href="/industries/industrial/" class="who-block who-block-link" style="background: #ffffff; border-radius: 16px; padding: 28px; border: 2px solid #E5E7EB; box-shadow: 0 4px 16px rgba(0,0,0,0.06); transition: all 0.3s ease; text-decoration: none; display: block; color: inherit;" onclick="event.preventDefault(); navigate('industry', { industry: 'industrial' }); return false;" onmouseover="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.15)'; this.style.transform='translateY(-4px)';" onmouseout="this.style.borderColor='#E5E7EB'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.06)'; this.style.transform='translateY(0)';">
                        <div style="font-size: 36px; margin-bottom: 16px;">🏭</div>
                        <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin-bottom: 10px;">Industrial & Manufacturing</h3>
                        <p style="font-size: 14px; color: #4B5563; line-height: 1.5; margin: 0;">Cut-resistant, chemical, and task-specific gloves at scale.</p>
                        <span class="who-block-cta" style="display: inline-block; margin-top: 14px; font-size: 14px; font-weight: 600; color: #FF7A00;">View industry page →</span>
                    </a>
                </div>
                <!-- Authorized / trusted brands – revolving logo carousel -->
                <div class="brands-strip" style="margin-top: 48px; padding-top: 40px; border-top: 1px solid #E5E7EB;">
                    <p style="text-align: center; font-size: 12px; font-weight: 600; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 20px;">Authorized distributor for</p>
                    <div class="brands-carousel-wrap">
                        <div class="brands-carousel-outer">
                            <div class="brands-carousel-track">
                                ${HOME_BRAND_LIST.map(getBrandLogoItemHtml).join('')}
                                ${HOME_BRAND_LIST.map(getBrandLogoItemHtml).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Product Finder Section -->
        <section class="product-finder-section" style="background: linear-gradient(180deg, #ffffff 0%, #f8f8f8 100%); padding: 80px 0;">
            <div class="container">
                <div class="section-header">
                    <h2 style="color: #111111; font-size: 36px; font-weight: 700; margin-bottom: 12px;">Find the Exact Gloves You Need</h2>
                    <p style="color: #374151; font-size: 16px;">Clear categories with detailed specs. No guessing. Every product shows thickness, texture, certifications, and use cases.</p>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 32px;">
                    <div style="background: linear-gradient(135deg, #ffffff 0%, #fff5f0 100%); padding: 32px; border-radius: 12px; border: 2px solid #FF7A00; cursor: pointer; box-shadow: 0 4px 20px rgba(255,122,0,0.1); transition: all 0.3s ease;" onclick="filterByCategory('Disposable Gloves')" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 30px rgba(255,122,0,0.2)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 20px rgba(255,122,0,0.1)';">
                        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                            <div class="category-icon" style="width: 70px; height: 70px; background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 28px; box-shadow: 0 4px 15px rgba(255,122,0,0.3);">
                                <i class="fas fa-hand-paper"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 24px; font-weight: 700; margin-bottom: 4px; color: #111111;">Disposable Gloves</h3>
                                <p style="color: #374151; font-size: 14px;">Medical • Food Service • Industrial</p>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eeeeee;">
                            <div>
                                <strong style="font-size: 12px; color: #111111; text-transform: uppercase;">Materials:</strong>
                                <div style="font-size: 13px; color: #374151; margin-top: 4px;">
                                    • Nitrile (4-8 mil)<br>
                                    • Latex (Powder-free)<br>
                                    • Vinyl (Economy)
                                </div>
                            </div>
                            <div>
                                <strong style="font-size: 12px; color: #111111; text-transform: uppercase;">Certifications:</strong>
                                <div style="font-size: 13px; color: #374151; margin-top: 4px;">
                                    • FDA 510(k)<br>
                                    • ASTM D6319<br>
                                    • Powder-free options
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="background: #ffffff; padding: 32px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.4); cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.2); transition: all 0.3s ease;" onclick="filterByCategory('Work Gloves')" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 30px rgba(255,122,0,0.3)'; this.style.borderColor='#FF7A00';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.2)'; this.style.borderColor='rgba(255,255,255,0.4)';">
                        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
                            <div class="category-icon" style="width: 70px; height: 70px; background: linear-gradient(135deg, #111111 0%, #1F2933 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #FF7A00; font-size: 28px; box-shadow: 0 4px 15px rgba(17,17,17,0.3);">
                                <i class="fas fa-hard-hat"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 24px; font-weight: 700; margin-bottom: 4px; color: #111111;">Reusable Work Gloves</h3>
                                <p style="color: #374151; font-size: 14px;">Cut-Resistant • Impact • Chemical</p>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eeeeee;">
                            <div>
                                <strong style="font-size: 12px; color: #111111; text-transform: uppercase;">ANSI Levels:</strong>
                                <div style="font-size: 13px; color: #374151; margin-top: 4px;">
                                    • A2-A5 Cut Resistant<br>
                                    • Impact Protection<br>
                                    • Chemical Resistant
                                </div>
                            </div>
                            <div>
                                <strong style="font-size: 12px; color: #111111; text-transform: uppercase;">Materials:</strong>
                                <div style="font-size: 13px; color: #374151; margin-top: 4px;">
                                    • HPPE/Nitrile<br>
                                    • Leather<br>
                                    • Coated Work
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
                    <div style="background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); padding: 24px; border-radius: 12px; text-align: center; cursor: pointer; box-shadow: 0 4px 15px rgba(255,122,0,0.3); transition: all 0.3s ease;" onclick="filterByMaterial('Nitrile')" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 25px rgba(255,122,0,0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(255,122,0,0.3)';">
                        <div style="font-size: 36px; color: #ffffff; margin-bottom: 10px;"><i class="fas fa-shield-alt"></i></div>
                        <strong style="font-size: 15px; color: #ffffff;">Nitrile</strong>
                        <div style="font-size: 12px; color: rgba(255,255,255,0.9); margin-top: 6px;">4-8 mil thickness</div>
                    </div>
                    <div style="background: #ffffff; padding: 24px; border-radius: 12px; text-align: center; cursor: pointer; border: 2px solid rgba(255,255,255,0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s ease;" onclick="filterByMaterial('Latex')" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 25px rgba(255,122,0,0.3)'; this.style.borderColor='#FF7A00';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.2)'; this.style.borderColor='rgba(255,255,255,0.3)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;"><i class="fas fa-hand-paper"></i></div>
                        <strong style="font-size: 15px; color: #111111;">Latex</strong>
                        <div style="font-size: 12px; color: #4B5563; margin-top: 6px;">Powder-free available</div>
                    </div>
                    <div style="background: #ffffff; padding: 24px; border-radius: 12px; text-align: center; cursor: pointer; border: 2px solid rgba(255,255,255,0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s ease;" onclick="filterByMaterial('Vinyl')" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 25px rgba(37,99,235,0.3)'; this.style.borderColor='#2563EB';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.2)'; this.style.borderColor='rgba(255,255,255,0.3)';">
                        <div style="font-size: 36px; color: #2563EB; margin-bottom: 10px;"><i class="fas fa-hand-paper"></i></div>
                        <strong style="font-size: 15px; color: #1a1a1a;">Vinyl</strong>
                        <div style="font-size: 12px; color: #4B5563; margin-top: 6px;">Economy option</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #fff5f0 0%, #ffffff 100%); padding: 24px; border-radius: 12px; text-align: center; cursor: pointer; border: 2px solid #FF7A00; box-shadow: 0 4px 15px rgba(255,122,0,0.2); transition: all 0.3s ease;" onclick="navigate('products')" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 25px rgba(255,122,0,0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(255,122,0,0.2)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;"><i class="fas fa-filter"></i></div>
                        <strong style="font-size: 15px; color: #111111;">Advanced Filters</strong>
                        <div style="font-size: 12px; color: #4B5563; margin-top: 6px;">Search by all specs</div>
                    </div>
                </div>
            </div>
        </section>


        <!-- Featured Products Section -->
        <section style="background: linear-gradient(180deg, #111111 0%, #1a1a1a 100%); padding: 80px 0;">
            <div class="container">
                <div class="products-header">
                    <div>
                        <h2 style="color: #ffffff; font-size: 32px; font-weight: 700; margin-bottom: 8px;">Most Trusted Products</h2>
                        <p style="color: rgba(255,255,255,0.8); font-size: 15px; margin-top: 4px;">Best-selling gloves from certified manufacturers</p>
                    </div>
                    <button class="btn btn-outline-dark" onclick="navigate('products')" style="border: 2px solid #FF7A00; color: #FF7A00; background: transparent; padding: 12px 24px; font-weight: 600; transition: all 0.3s ease;" onmouseover="this.style.background='#FF7A00'; this.style.color='#ffffff'; this.style.borderColor='#FF7A00';" onmouseout="this.style.background='transparent'; this.style.color='#FF7A00'; this.style.borderColor='#FF7A00';">View All <i class="fas fa-arrow-right"></i></button>
                </div>
                <div id="homeProductsGrid" class="products-grid">
                    ${productsPlaceholder}
                </div>
            </div>
        </section>
        
        <!-- Trust Signals (Below Products) -->
        <section style="background: linear-gradient(180deg, #1a1a1a 0%, #111111 100%); padding: 50px 0; border-top: 1px solid rgba(255,255,255,0.1);">
            <div class="container">
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 24px; text-align: center;">
                    <div class="trust-signal" style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.3s ease;" onmouseover="this.style.borderColor='rgba(255,122,0,0.5)'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.2)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;">
                            <i class="fas fa-certificate"></i>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: #111111;">Authorized Distributor</div>
                    </div>
                    <div class="trust-signal" style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.3s ease;" onmouseover="this.style.borderColor='rgba(255,122,0,0.5)'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.2)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;">
                            <i class="fas fa-warehouse"></i>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: #111111;">Consistent Inventory</div>
                    </div>
                    <div class="trust-signal" style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.3s ease;" onmouseover="this.style.borderColor='rgba(255,122,0,0.5)'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.2)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;">
                            <i class="fas fa-shipping-fast"></i>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: #111111;">Fast Fulfillment</div>
                    </div>
                    <div class="trust-signal" style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.3s ease;" onmouseover="this.style.borderColor='rgba(255,122,0,0.5)'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.2)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;">
                            <i class="fas fa-clipboard-check"></i>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: #111111;">Spec-Based Recommendations</div>
                    </div>
                    <div class="trust-signal" style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.3s ease;" onmouseover="this.style.borderColor='rgba(255,122,0,0.5)'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.2)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;">
                            <i class="fas fa-file-invoice-dollar"></i>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: #111111;">Net Terms Available</div>
                    </div>
                    <div class="trust-signal" style="background: #ffffff; padding: 20px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.3s ease;" onmouseover="this.style.borderColor='rgba(255,122,0,0.5)'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(255,122,0,0.2)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';">
                        <div style="font-size: 36px; color: #FF7A00; margin-bottom: 10px;">
                            <i class="fas fa-user-tie"></i>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: #111111;">Dedicated Account Support</div>
                    </div>
                </div>
            </div>
        </section>
        
        <!-- Google Maps Section -->
        <section style="background: #111111; padding: 80px 0;">
            <div class="container">
                <div style="max-width: 1200px; margin: 0 auto;">
                    <div style="background: rgba(255,255,255,0.05); padding: 48px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                        <h3 style="font-size: 32px; font-weight: 700; margin-bottom: 16px; color: #FF7A00; text-align: center;">Built Here, Servicing Everywhere</h3>
                        <p style="color: rgba(255,255,255,0.9); line-height: 1.7; margin-bottom: 32px; text-align: center; font-size: 16px;">
                            Our headquarters in Salt Lake City, UT serves as the foundation of our operations. From this central location, we efficiently distribute quality gloves to businesses across the United States and beyond. Whether you're on the East Coast, West Coast, or anywhere in between, we're here to serve you.
                        </p>
                        <div style="width: 100%; height: 400px; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
                            <iframe 
                                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d12190.481301693!2d-111.89104748459382!3d40.76077997932681!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8752f5105c4b0b0b%3A0x5c5c5c5c5c5c5c5c!2sSalt%20Lake%20City%2C%20UT%2C%20USA!5e0!3m2!1sen!2sus!4v1706123456789!5m2!1sen!2sus" 
                                width="100%" 
                                height="400" 
                                style="border:0; border-radius: 12px;" 
                                allowfullscreen="" 
                                loading="lazy" 
                                referrerpolicy="no-referrer-when-downgrade"
                                title="Glovecubs Headquarters - Salt Lake City, UT">
                            </iframe>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
    // Fetch products and update the grid (timeout so we never leave "Loading products" stuck)
    let products = [];
    let loadError = false;
    const productFetchTimeout = 12000;
    try {
        const response = await Promise.race([
            api.get('/api/products'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Products request timed out')), productFetchTimeout))
        ]);
        if (Array.isArray(response)) products = response;
        else if (response && Array.isArray(response.products)) products = response.products;
        products = (products || []).filter(p => p && (p.id != null || p.sku));
    } catch (error) {
        console.error('Error loading products:', error);
        loadError = true;
    }
    const gridEl = document.getElementById('homeProductsGrid');
    if (gridEl) {
        if (loadError) {
            gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.9);"><p style="margin-bottom: 12px;">Unable to load products.</p><button type="button" class="btn btn-outline-dark" onclick="navigate(\'home\')" style="border: 2px solid #FF7A00; color: #FF7A00; background: transparent; padding: 10px 20px; font-weight: 600; border-radius: 8px; cursor: pointer;">Try again</button></div>';
        } else if (products.length > 0) {
            gridEl.innerHTML = products.slice(0, 8).map(product => renderProductCard(product)).join('');
        } else {
            gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.9);">No products available at the moment.</div>';
        }
    }
}

// ============================================
// ROTATING TEXT ANIMATION
// ============================================

function initRotatingText() {
    const rotatingWord = document.querySelector('.rotating-word');
    if (!rotatingWord) return;
    
    const words = ['Gloves', 'Quality', 'Time'];
    let currentIndex = 0;
    
    function rotateText() {
        // Fade out
        rotatingWord.style.opacity = '0';
        rotatingWord.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            currentIndex = (currentIndex + 1) % words.length;
            rotatingWord.textContent = words[currentIndex];
            
            // Fade in
            rotatingWord.style.opacity = '1';
            rotatingWord.style.transform = 'translateY(0)';
        }, 300);
    }
    
    // Set initial styles
    rotatingWord.style.transition = 'all 0.3s ease';
    rotatingWord.style.opacity = '1';
    
    // Start rotation after 2 seconds, then every 3 seconds
    setTimeout(() => {
        rotateText();
        setInterval(rotateText, 3000);
    }, 2000);
}

// ============================================
// PRODUCTS PAGE
// ============================================

async function renderProductsPage(opts) {
    const mainContent = document.getElementById('mainContent');
    
    // Sync search bar value into state so loadProducts() uses it (search works even if user typed then navigated)
    const searchInput = document.getElementById('searchInput');
    if (searchInput) state.filters.search = searchInput.value.trim();
    
    // SEO: apply category/material from clean URL segment (e.g. /gloves/nitrile/)
    if (opts && opts.categorySegment) {
        const seg = (opts.categorySegment || '').toLowerCase().replace(/\s+/g, '-');
        if (seg === 'nitrile') state.filters.material = ['Nitrile'];
        else if (seg === 'vinyl') state.filters.material = ['Vinyl'];
        else if (seg === 'latex') state.filters.material = ['Latex'];
        else if (seg === 'disposable-gloves') state.filters.category = 'Disposable Gloves';
        else if (seg === 'work-gloves') state.filters.category = 'Work Gloves';
        else state.filters.material = [seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')];
    }
    if (state.filters.category === 'Work Gloves') {
        setPageMeta('Reusable Work Gloves | Glovecubs', 'Shop reusable work gloves — cut-resistant, impact, coated, and leather. Bulk pricing and fast shipping.');
    }
    mainContent.innerHTML = `
        <section class="shop-page">
            <div class="container">
                <div class="shop-layout">
                    <aside class="shop-sidebar" style="max-height: calc(100vh - 120px); overflow-y: auto; padding-right: 10px;">
                        <div class="filter-section filter-section-price">
                            <h3 class="filter-section-price-title">Price range</h3>
                            <div class="filter-price-range filter-price-range-bar">
                                <div class="filter-price-range-labels filter-price-range-labels-top">
                                    <span id="priceMinLabel">$0</span>
                                    <span id="priceMaxLabel">$300</span>
                                </div>
                                <div class="filter-price-track">
                                    <div class="filter-price-filled" id="priceRangeFilled"></div>
                                </div>
                                <input type="range" id="priceMinSlider" min="0" max="300" value="0" step="5" class="filter-price-thumb filter-price-thumb-min" oninput="updatePriceRangeBar(); updatePriceLabels(); applyFilters();">
                                <input type="range" id="priceMaxSlider" min="0" max="300" value="300" step="5" class="filter-price-thumb filter-price-thumb-max" oninput="updatePriceRangeBar(); updatePriceLabels(); applyFilters();">
                            </div>
                        </div>
                        <div class="shop-ai-cta" style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #fff5f0 0%, #ffffff 100%); border: 2px solid var(--primary); border-radius: var(--radius);">
                            <p style="font-size: 13px; font-weight: 600; color: var(--secondary); margin-bottom: 10px;"><i class="fas fa-robot" style="color: var(--primary); margin-right: 6px;"></i>Not sure what you need?</p>
                            <button type="button" class="btn btn-primary" style="width: 100%; font-size: 14px; padding: 10px 16px;" onclick="navigate('ai-advisor', { prefill: getShopPrefill() }); return false;">
                                Get a recommendation
                            </button>
                        </div>
                        <div class="filter-section">
                            <h3>Categories</h3>
                            <div class="filter-options" id="categoryFilters">
                                <label class="filter-option">
                                    <input type="radio" name="category" value="" checked onchange="applyFilters()">
                                    <span>All Categories</span>
                                </label>
                                <label class="filter-option">
                                    <input type="radio" name="category" value="Disposable Gloves" onchange="applyFilters()">
                                    <span>Disposable Gloves</span>
                                </label>
                                <label class="filter-option">
                                    <input type="radio" name="category" value="Work Gloves" onchange="applyFilters()">
                                    <span>Reusable Work Gloves</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Material</h3>
                            <div class="filter-options" id="materialFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="material" value="Nitrile" onchange="applyFilters()">
                                    <span>Nitrile</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="material" value="Latex" onchange="applyFilters()">
                                    <span>Latex</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="material" value="Vinyl" onchange="applyFilters()">
                                    <span>Vinyl</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="material" value="Polyethylene (PE)" onchange="applyFilters()">
                                    <span>Polyethylene (PE)</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Size</h3>
                            <div class="filter-options" id="sizeFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="size" value="XS" onchange="applyFilters()">
                                    <span>XS</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="size" value="S" onchange="applyFilters()">
                                    <span>S</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="size" value="M" onchange="applyFilters()">
                                    <span>M</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="size" value="L" onchange="applyFilters()">
                                    <span>L</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="size" value="XL" onchange="applyFilters()">
                                    <span>XL</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="size" value="XXL" onchange="applyFilters()">
                                    <span>XXL</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Color</h3>
                            <div class="filter-color-swatches" id="colorFilters">
                                <label class="filter-color-swatch-wrap" title="Blue">
                                    <input type="checkbox" name="color" value="Blue" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#2563EB;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Violet/Blue">
                                    <input type="checkbox" name="color" value="Violet/Blue" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#5B21B6;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Black">
                                    <input type="checkbox" name="color" value="Black" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#000000;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="White">
                                    <input type="checkbox" name="color" value="White" onchange="applyFilters()">
                                    <span class="filter-color-swatch filter-color-swatch-light" style="background:#FFFFFF;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Clear">
                                    <input type="checkbox" name="color" value="Clear" onchange="applyFilters()">
                                    <span class="filter-color-swatch filter-color-swatch-light" style="background:#BFDBFE;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Orange">
                                    <input type="checkbox" name="color" value="Orange" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#EA580C;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Purple">
                                    <input type="checkbox" name="color" value="Purple" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#7C3AED;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Green">
                                    <input type="checkbox" name="color" value="Green" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#16A34A;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Natural">
                                    <input type="checkbox" name="color" value="Natural" onchange="applyFilters()">
                                    <span class="filter-color-swatch filter-color-swatch-light" style="background:#E7C9A0;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Gray">
                                    <input type="checkbox" name="color" value="Gray" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#6B7280;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Tan">
                                    <input type="checkbox" name="color" value="Tan" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#C4A574;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Yellow">
                                    <input type="checkbox" name="color" value="Yellow" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#EAB308;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Brown">
                                    <input type="checkbox" name="color" value="Brown" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#92400E;"></span>
                                </label>
                                <label class="filter-color-swatch-wrap" title="Pink">
                                    <input type="checkbox" name="color" value="Pink" onchange="applyFilters()">
                                    <span class="filter-color-swatch" style="background:#DB2777;"></span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Thickness (Mil)</h3>
                            <div class="filter-options" id="thicknessFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="thickness" value="2" onchange="applyFilters()">
                                    <span>2 mil</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="thickness" value="3" onchange="applyFilters()">
                                    <span>3 mil</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="thickness" value="4" onchange="applyFilters()">
                                    <span>4 mil</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="thickness" value="5" onchange="applyFilters()">
                                    <span>5 mil</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="thickness" value="6" onchange="applyFilters()">
                                    <span>6 mil</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="thickness" value="7+" onchange="applyFilters()">
                                    <span>7+ mil</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Powder</h3>
                            <div class="filter-options" id="powderFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="powder" value="Powder-Free" onchange="applyFilters()">
                                    <span>Powder-Free</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="powder" value="Powdered" onchange="applyFilters()">
                                    <span>Powdered</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Grade</h3>
                            <div class="filter-options" id="gradeFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="grade" value="Medical / Exam Grade" onchange="applyFilters()">
                                    <span>Medical / Exam Grade</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="grade" value="Industrial Grade" onchange="applyFilters()">
                                    <span>Industrial Grade</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="grade" value="Food Service Grade" onchange="applyFilters()">
                                    <span>Food Service Grade</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Industries</h3>
                            <div class="filter-options" id="useCaseFilters" style="max-height: 400px; overflow-y: auto;">
                                <div style="margin-bottom: 12px; font-weight: 600; color: var(--primary); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Disposable Gloves</div>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Healthcare" onchange="applyFilters()">
                                    <span>Healthcare</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Food Service" onchange="applyFilters()">
                                    <span>Food Service</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Food Processing" onchange="applyFilters()">
                                    <span>Food Processing</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Janitorial" onchange="applyFilters()">
                                    <span>Janitorial</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Sanitation" onchange="applyFilters()">
                                    <span>Sanitation</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Laboratories" onchange="applyFilters()">
                                    <span>Laboratories</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Pharmaceuticals" onchange="applyFilters()">
                                    <span>Pharmaceuticals</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Beauty & Personal Care" onchange="applyFilters()">
                                    <span>Beauty & Personal Care</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Tattoo & Body Art" onchange="applyFilters()">
                                    <span>Tattoo & Body Art</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Automotive" onchange="applyFilters()">
                                    <span>Automotive</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Education" onchange="applyFilters()">
                                    <span>Education</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Childcare" onchange="applyFilters()">
                                    <span>Childcare</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Cannabis" onchange="applyFilters()">
                                    <span>Cannabis</span>
                                </label>
                                
                                <div style="margin-top: 20px; margin-bottom: 12px; font-weight: 600; color: var(--primary); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Reusable Work Gloves</div>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Construction" onchange="applyFilters()">
                                    <span>Construction</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Trades (Electricians, HVAC, Plumbing)" onchange="applyFilters()">
                                    <span>Trades (Electricians, HVAC, Plumbing)</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Manufacturing" onchange="applyFilters()">
                                    <span>Manufacturing</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Industrial" onchange="applyFilters()">
                                    <span>Industrial</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Warehousing" onchange="applyFilters()">
                                    <span>Warehousing</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Logistics" onchange="applyFilters()">
                                    <span>Logistics</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Distribution" onchange="applyFilters()">
                                    <span>Distribution</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Transportation" onchange="applyFilters()">
                                    <span>Transportation</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Utilities" onchange="applyFilters()">
                                    <span>Utilities</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Energy" onchange="applyFilters()">
                                    <span>Energy</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Agriculture" onchange="applyFilters()">
                                    <span>Agriculture</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Landscaping" onchange="applyFilters()">
                                    <span>Landscaping</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Mining" onchange="applyFilters()">
                                    <span>Mining</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Heavy Industry" onchange="applyFilters()">
                                    <span>Heavy Industry</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Public Works" onchange="applyFilters()">
                                    <span>Public Works</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Municipal Services" onchange="applyFilters()">
                                    <span>Municipal Services</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Waste Management" onchange="applyFilters()">
                                    <span>Waste Management</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Recycling" onchange="applyFilters()">
                                    <span>Recycling</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="useCase" value="Environmental Services" onchange="applyFilters()">
                                    <span>Environmental Services</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Compliance / Certifications</h3>
                            <div class="filter-options" id="complianceFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="compliance" value="FDA Approved" onchange="applyFilters()">
                                    <span>FDA Approved</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="compliance" value="ASTM Tested" onchange="applyFilters()">
                                    <span>ASTM Tested</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="compliance" value="Food Safe" onchange="applyFilters()">
                                    <span>Food Safe</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="compliance" value="Latex Free" onchange="applyFilters()">
                                    <span>Latex Free</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="compliance" value="Chemo Rated" onchange="applyFilters()">
                                    <span>Chemo Rated</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="compliance" value="EN 455" onchange="applyFilters()">
                                    <span>EN 455</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="compliance" value="EN 374" onchange="applyFilters()">
                                    <span>EN 374</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Cut Level (ANSI)</h3>
                            <div class="filter-options" id="cutLevelFilters">
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A1" onchange="applyFilters()"><span>A1</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A2" onchange="applyFilters()"><span>A2</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A3" onchange="applyFilters()"><span>A3</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A4" onchange="applyFilters()"><span>A4</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A5" onchange="applyFilters()"><span>A5</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A6" onchange="applyFilters()"><span>A6</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A7" onchange="applyFilters()"><span>A7</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A8" onchange="applyFilters()"><span>A8</span></label>
                                <label class="filter-option"><input type="checkbox" name="cutLevel" value="A9" onchange="applyFilters()"><span>A9</span></label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Puncture Level</h3>
                            <div class="filter-options" id="punctureLevelFilters">
                                <label class="filter-option"><input type="checkbox" name="punctureLevel" value="P1" onchange="applyFilters()"><span>P1</span></label>
                                <label class="filter-option"><input type="checkbox" name="punctureLevel" value="P2" onchange="applyFilters()"><span>P2</span></label>
                                <label class="filter-option"><input type="checkbox" name="punctureLevel" value="P3" onchange="applyFilters()"><span>P3</span></label>
                                <label class="filter-option"><input type="checkbox" name="punctureLevel" value="P4" onchange="applyFilters()"><span>P4</span></label>
                                <label class="filter-option"><input type="checkbox" name="punctureLevel" value="P5" onchange="applyFilters()"><span>P5</span></label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Abrasion Level</h3>
                            <div class="filter-options" id="abrasionLevelFilters">
                                <label class="filter-option"><input type="checkbox" name="abrasionLevel" value="1" onchange="applyFilters()"><span>Level 1</span></label>
                                <label class="filter-option"><input type="checkbox" name="abrasionLevel" value="2" onchange="applyFilters()"><span>Level 2</span></label>
                                <label class="filter-option"><input type="checkbox" name="abrasionLevel" value="3" onchange="applyFilters()"><span>Level 3</span></label>
                                <label class="filter-option"><input type="checkbox" name="abrasionLevel" value="4" onchange="applyFilters()"><span>Level 4</span></label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Flame Resistant</h3>
                            <div class="filter-options" id="flameResistantFilters">
                                <label class="filter-option"><input type="checkbox" name="flameResistant" value="Yes" onchange="applyFilters()"><span>Flame Resistant</span></label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Arc Rating</h3>
                            <div class="filter-options" id="arcLevelFilters">
                                <label class="filter-option"><input type="checkbox" name="arcLevel" value="Cat 1" onchange="applyFilters()"><span>Category 1</span></label>
                                <label class="filter-option"><input type="checkbox" name="arcLevel" value="Cat 2" onchange="applyFilters()"><span>Category 2</span></label>
                                <label class="filter-option"><input type="checkbox" name="arcLevel" value="Cat 3" onchange="applyFilters()"><span>Category 3</span></label>
                                <label class="filter-option"><input type="checkbox" name="arcLevel" value="Cat 4" onchange="applyFilters()"><span>Category 4</span></label>
                                <label class="filter-option"><input type="checkbox" name="arcLevel" value="8 cal" onchange="applyFilters()"><span>8 cal</span></label>
                                <label class="filter-option"><input type="checkbox" name="arcLevel" value="12 cal" onchange="applyFilters()"><span>12 cal</span></label>
                                <label class="filter-option"><input type="checkbox" name="arcLevel" value="20 cal" onchange="applyFilters()"><span>20 cal</span></label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Warm / Cold Weather</h3>
                            <div class="filter-options" id="warmRatingFilters">
                                <label class="filter-option"><input type="checkbox" name="warmRating" value="Insulated" onchange="applyFilters()"><span>Insulated</span></label>
                                <label class="filter-option"><input type="checkbox" name="warmRating" value="Winter" onchange="applyFilters()"><span>Winter</span></label>
                                <label class="filter-option"><input type="checkbox" name="warmRating" value="Cold Weather" onchange="applyFilters()"><span>Cold Weather</span></label>
                                <label class="filter-option"><input type="checkbox" name="warmRating" value="Heated" onchange="applyFilters()"><span>Heated</span></label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Texture</h3>
                            <div class="filter-options" id="textureFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="texture" value="Smooth" onchange="applyFilters()">
                                    <span>Smooth</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="texture" value="Fingertip Textured" onchange="applyFilters()">
                                    <span>Fingertip Textured</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="texture" value="Fully Textured" onchange="applyFilters()">
                                    <span>Fully Textured</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Cuff Style</h3>
                            <div class="filter-options" id="cuffStyleFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="cuffStyle" value="Beaded Cuff" onchange="applyFilters()">
                                    <span>Beaded Cuff</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="cuffStyle" value="Non-Beaded" onchange="applyFilters()">
                                    <span>Non-Beaded</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="cuffStyle" value="Extended Cuff" onchange="applyFilters()">
                                    <span>Extended Cuff</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Hand Orientation</h3>
                            <div class="filter-options" id="handOrientationFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="handOrientation" value="Ambidextrous" onchange="applyFilters()">
                                    <span>Ambidextrous</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Packaging</h3>
                            <div class="filter-options" id="packagingFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="packaging" value="Box (100 ct)" onchange="applyFilters()">
                                    <span>Box (100 ct)</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="packaging" value="Box (200–250 ct)" onchange="applyFilters()">
                                    <span>Box (200–250 ct)</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="packaging" value="Case (1,000 ct)" onchange="applyFilters()">
                                    <span>Case (1,000 ct)</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="packaging" value="Case (2,000+ ct)" onchange="applyFilters()">
                                    <span>Case (2,000+ ct)</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Sterility</h3>
                            <div class="filter-options" id="sterilityFilters">
                                <label class="filter-option">
                                    <input type="checkbox" name="sterility" value="Non-Sterile" onchange="applyFilters()">
                                    <span>Non-Sterile</span>
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" name="sterility" value="Sterile" onchange="applyFilters()">
                                    <span>Sterile</span>
                                </label>
                            </div>
                        </div>
                        <div class="filter-section">
                            <h3>Brand</h3>
                            <div class="filter-options" id="brandFilters">
                                <!-- Loaded dynamically -->
                            </div>
                        </div>
                        <button class="btn btn-outline-dark btn-block" onclick="clearFilters()" style="margin-top: 20px;">
                            <i class="fas fa-times"></i> Clear All Filters
                        </button>
                    </aside>
                    <div class="shop-main">
                        <div class="shop-header">
                            ${state.filters.category ? `<div class="breadcrumb shop-page-breadcrumb"><a href="/" onclick="event.preventDefault(); navigate('home'); return false;">Home</a><span>/</span><a href="/gloves/" onclick="event.preventDefault(); navigate('products'); return false;">Products</a><span>/</span><span>${(state.filters.category && typeof getCategoryDisplayName === 'function' ? getCategoryDisplayName(state.filters.category) : state.filters.category) || 'Category'}</span></div>` : ''}
                            <h1 class="shop-header-title">${state.filters.category ? (typeof getCategoryDisplayName === 'function' ? getCategoryDisplayName(state.filters.category) : state.filters.category) : 'All Products'}</h1>
                            <div class="shop-controls">
                                <span class="results-count" id="resultsCount">Loading...</span>
                            </div>
                        </div>
                        <div class="products-grid" id="productsGrid">
                            <div class="loading"><div class="spinner"></div></div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
    var shopH1 = mainContent.querySelector('.shop-header h1');
    if (shopH1 && state.filters.category) shopH1.textContent = getCategoryDisplayName(state.filters.category);

    // Load brands for filter
    const brands = await api.get('/api/brands');
    const brandFiltersHtml = `
        <label class="filter-option">
            <input type="radio" name="brand" value="" checked onchange="applyFilters()">
            <span>All Brands</span>
        </label>
        ${brands.map(brand => `
            <label class="filter-option">
                <input type="radio" name="brand" value="${brand}" onchange="applyFilters()">
                <span>${brand}</span>
            </label>
        `).join('')}
    `;
    document.getElementById('brandFilters').innerHTML = brandFiltersHtml;

    // Restore search input value after rendering
    setTimeout(() => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput && state.filters.search) {
            searchInput.value = state.filters.search;
        }
    }, 100);

    // Apply any pre-set filters
    const restoreFilter = (name, value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(v => {
                const input = document.querySelector(`input[name="${name}"][value="${v}"]`);
                if (input) input.checked = true;
            });
        } else {
            const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (input) input.checked = true;
        }
    };
    
    restoreFilter('category', state.filters.category);
    restoreFilter('brand', state.filters.brand);
    restoreFilter('material', state.filters.material);
    restoreFilter('powder', state.filters.powder);
    restoreFilter('thickness', state.filters.thickness);
    restoreFilter('size', state.filters.size);
    restoreFilter('color', state.filters.color);
    restoreFilter('grade', state.filters.grade);
    restoreFilter('useCase', state.filters.useCase);
    restoreFilter('compliance', state.filters.compliance);
    restoreFilter('cutLevel', state.filters.cutLevel);
    restoreFilter('punctureLevel', state.filters.punctureLevel);
    restoreFilter('abrasionLevel', state.filters.abrasionLevel);
    restoreFilter('flameResistant', state.filters.flameResistant);
    restoreFilter('arcLevel', state.filters.arcLevel);
    restoreFilter('warmRating', state.filters.warmRating);
    restoreFilter('texture', state.filters.texture);
    restoreFilter('cuffStyle', state.filters.cuffStyle);
    restoreFilter('handOrientation', state.filters.handOrientation);
    restoreFilter('packaging', state.filters.packaging);
    restoreFilter('sterility', state.filters.sterility);
    const priceMinEl = document.getElementById('priceMinSlider');
    const priceMaxEl = document.getElementById('priceMaxSlider');
    if (priceMinEl && state.filters.priceMin != null) { priceMinEl.value = state.filters.priceMin; }
    if (priceMaxEl && state.filters.priceMax != null) { priceMaxEl.value = state.filters.priceMax; }
    updatePriceLabels();
    updatePriceRangeBar();
    initPriceRangeBar();

    // SEO: sync sidebar checkboxes/radios from state.filters (e.g. when opened via /gloves/nitrile/)
    if (opts && opts.categorySegment) {
        const seg = (opts.categorySegment || '').toLowerCase();
        const category = state.filters.category;
        const material = state.filters.material;
        if (category) {
            const radio = document.querySelector(`input[name="category"][value="${category.replace(/"/g, '\\"')}"]`);
            if (radio) { radio.checked = true; document.querySelector('input[name="category"][value=""]').checked = false; }
        }
        if (Array.isArray(material) && material.length > 0) {
            material.forEach(m => {
                const cb = document.querySelector(`input[name="material"][value="${(m || '').replace(/"/g, '\\"')}"]`);
                if (cb) cb.checked = true;
            });
        }
        if (window.history && window.history.replaceState) {
            const path = '/gloves/' + (opts.categorySegment || '') + '/';
            if (path !== window.location.pathname) window.history.replaceState(null, '', path);
        }
    }
    
    // Load products
    await loadProducts();
}

async function loadProducts() {
    let url = '/api/products?';
    const params = [];
    
    if (state.filters.category) params.push(`category=${encodeURIComponent(state.filters.category)}`);
    if (state.filters.brand) params.push(`brand=${encodeURIComponent(state.filters.brand)}`);
    if (state.filters.material) {
        if (Array.isArray(state.filters.material)) {
            state.filters.material.forEach(m => params.push(`material=${encodeURIComponent(m)}`));
        } else {
            params.push(`material=${encodeURIComponent(state.filters.material)}`);
        }
    }
    if (state.filters.powder) {
        if (Array.isArray(state.filters.powder)) {
            state.filters.powder.forEach(p => params.push(`powder=${encodeURIComponent(p)}`));
        } else {
            params.push(`powder=${encodeURIComponent(state.filters.powder)}`);
        }
    }
    if (state.filters.thickness) {
        if (Array.isArray(state.filters.thickness)) {
            state.filters.thickness.forEach(t => params.push(`thickness=${encodeURIComponent(t)}`));
        } else {
            params.push(`thickness=${encodeURIComponent(state.filters.thickness)}`);
        }
    }
    if (state.filters.size) {
        if (Array.isArray(state.filters.size)) {
            state.filters.size.forEach(s => params.push(`size=${encodeURIComponent(s)}`));
        } else {
            params.push(`size=${encodeURIComponent(state.filters.size)}`);
        }
    }
    if (state.filters.color) {
        if (Array.isArray(state.filters.color)) {
            state.filters.color.forEach(c => params.push(`color=${encodeURIComponent(c)}`));
        } else {
            params.push(`color=${encodeURIComponent(state.filters.color)}`);
        }
    }
    if (state.filters.grade) {
        if (Array.isArray(state.filters.grade)) {
            state.filters.grade.forEach(g => params.push(`grade=${encodeURIComponent(g)}`));
        } else {
            params.push(`grade=${encodeURIComponent(state.filters.grade)}`);
        }
    }
    if (state.filters.useCase) {
        if (Array.isArray(state.filters.useCase)) {
            state.filters.useCase.forEach(u => params.push(`useCase=${encodeURIComponent(u)}`));
        } else {
            params.push(`useCase=${encodeURIComponent(state.filters.useCase)}`);
        }
    }
    if (state.filters.compliance) {
        if (Array.isArray(state.filters.compliance)) {
            state.filters.compliance.forEach(c => params.push(`compliance=${encodeURIComponent(c)}`));
        } else {
            params.push(`compliance=${encodeURIComponent(state.filters.compliance)}`);
        }
    }
    if (state.filters.cutLevel) {
        if (Array.isArray(state.filters.cutLevel)) {
            state.filters.cutLevel.forEach(c => params.push(`cutLevel=${encodeURIComponent(c)}`));
        } else {
            params.push(`cutLevel=${encodeURIComponent(state.filters.cutLevel)}`);
        }
    }
    if (state.filters.punctureLevel) {
        if (Array.isArray(state.filters.punctureLevel)) {
            state.filters.punctureLevel.forEach(p => params.push(`punctureLevel=${encodeURIComponent(p)}`));
        } else {
            params.push(`punctureLevel=${encodeURIComponent(state.filters.punctureLevel)}`);
        }
    }
    if (state.filters.abrasionLevel) {
        if (Array.isArray(state.filters.abrasionLevel)) {
            state.filters.abrasionLevel.forEach(a => params.push(`abrasionLevel=${encodeURIComponent(a)}`));
        } else {
            params.push(`abrasionLevel=${encodeURIComponent(state.filters.abrasionLevel)}`);
        }
    }
    if (state.filters.flameResistant) {
        if (Array.isArray(state.filters.flameResistant)) {
            state.filters.flameResistant.forEach(f => params.push(`flameResistant=${encodeURIComponent(f)}`));
        } else {
            params.push(`flameResistant=${encodeURIComponent(state.filters.flameResistant)}`);
        }
    }
    if (state.filters.arcLevel) {
        if (Array.isArray(state.filters.arcLevel)) {
            state.filters.arcLevel.forEach(a => params.push(`arcLevel=${encodeURIComponent(a)}`));
        } else {
            params.push(`arcLevel=${encodeURIComponent(state.filters.arcLevel)}`);
        }
    }
    if (state.filters.warmRating) {
        if (Array.isArray(state.filters.warmRating)) {
            state.filters.warmRating.forEach(w => params.push(`warmRating=${encodeURIComponent(w)}`));
        } else {
            params.push(`warmRating=${encodeURIComponent(state.filters.warmRating)}`);
        }
    }
    if (state.filters.texture) {
        if (Array.isArray(state.filters.texture)) {
            state.filters.texture.forEach(t => params.push(`texture=${encodeURIComponent(t)}`));
        } else {
            params.push(`texture=${encodeURIComponent(state.filters.texture)}`);
        }
    }
    if (state.filters.cuffStyle) {
        if (Array.isArray(state.filters.cuffStyle)) {
            state.filters.cuffStyle.forEach(c => params.push(`cuffStyle=${encodeURIComponent(c)}`));
        } else {
            params.push(`cuffStyle=${encodeURIComponent(state.filters.cuffStyle)}`);
        }
    }
    if (state.filters.handOrientation) {
        if (Array.isArray(state.filters.handOrientation)) {
            state.filters.handOrientation.forEach(h => params.push(`handOrientation=${encodeURIComponent(h)}`));
        } else {
            params.push(`handOrientation=${encodeURIComponent(state.filters.handOrientation)}`);
        }
    }
    if (state.filters.packaging) {
        if (Array.isArray(state.filters.packaging)) {
            state.filters.packaging.forEach(p => params.push(`packaging=${encodeURIComponent(p)}`));
        } else {
            params.push(`packaging=${encodeURIComponent(state.filters.packaging)}`);
        }
    }
    if (state.filters.sterility) {
        if (Array.isArray(state.filters.sterility)) {
            state.filters.sterility.forEach(s => params.push(`sterility=${encodeURIComponent(s)}`));
        } else {
            params.push(`sterility=${encodeURIComponent(state.filters.sterility)}`);
        }
    }
    if (state.filters.priceMin != null && state.filters.priceMin > 0) params.push(`priceMin=${encodeURIComponent(state.filters.priceMin)}`);
    if (state.filters.priceMax != null && state.filters.priceMax < 300) params.push(`priceMax=${encodeURIComponent(state.filters.priceMax)}`);
    if (state.filters.search) params.push(`search=${encodeURIComponent(state.filters.search)}`);
    
    url += params.join('&');
    
    // Debug logging
    if (state.filters.search) {
        console.log('Searching for:', state.filters.search);
        console.log('Search URL:', url);
    }
    
    const products = await api.get(url);
    state.products = products;
    
    // Debug logging
    if (state.filters.search) {
        console.log('Search results:', products.length, 'products found');
    }
    
    const grid = document.getElementById('productsGrid');
    const count = document.getElementById('resultsCount');
    
    if (grid) {
        if (products.length === 0) {
            grid.innerHTML = `
                <div class="cart-empty" style="grid-column: 1/-1;">
                    <i class="fas fa-search"></i>
                    <h2>No Products Found</h2>
                    <p>Try adjusting your filters or search terms.</p>
                    <button class="btn btn-primary" onclick="clearFilters()">Clear Filters</button>
                </div>
            `;
        } else {
            grid.innerHTML = products.map(product => renderProductCard(product)).join('');
        }
    }
    
    if (count) {
        count.textContent = `${products.length} product${products.length !== 1 ? 's' : ''} found`;
    }
}

function applyFilters() {
    // Category (radio button)
    state.filters.category = document.querySelector('input[name="category"]:checked')?.value || null;
    
    // Brand (radio button)
    state.filters.brand = document.querySelector('input[name="brand"]:checked')?.value || null;
    
    // All other filters (checkboxes - can have multiple values)
    const getCheckedValues = (name) => {
        const checked = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
            .map(input => input.value);
        return checked.length > 0 ? checked : null;
    };
    
    state.filters.material = getCheckedValues('material');
    state.filters.powder = getCheckedValues('powder');
    state.filters.thickness = getCheckedValues('thickness');
    state.filters.size = getCheckedValues('size');
    state.filters.color = getCheckedValues('color');
    state.filters.grade = getCheckedValues('grade');
    state.filters.useCase = getCheckedValues('useCase');
    state.filters.compliance = getCheckedValues('compliance');
    state.filters.cutLevel = getCheckedValues('cutLevel');
    state.filters.punctureLevel = getCheckedValues('punctureLevel');
    state.filters.abrasionLevel = getCheckedValues('abrasionLevel');
    state.filters.flameResistant = getCheckedValues('flameResistant');
    state.filters.arcLevel = getCheckedValues('arcLevel');
    state.filters.warmRating = getCheckedValues('warmRating');
    state.filters.texture = getCheckedValues('texture');
    state.filters.cuffStyle = getCheckedValues('cuffStyle');
    state.filters.handOrientation = getCheckedValues('handOrientation');
    state.filters.packaging = getCheckedValues('packaging');
    state.filters.sterility = getCheckedValues('sterility');
    const priceMinSlider = document.getElementById('priceMinSlider');
    const priceMaxSlider = document.getElementById('priceMaxSlider');
    state.filters.priceMin = priceMinSlider ? parseFloat(priceMinSlider.value) : null;
    state.filters.priceMax = priceMaxSlider ? parseFloat(priceMaxSlider.value) : null;
    if (state.filters.priceMin != null && state.filters.priceMax != null && state.filters.priceMin > state.filters.priceMax) {
        const t = state.filters.priceMin; state.filters.priceMin = state.filters.priceMax; state.filters.priceMax = t;
    }
    
    loadProducts();
}

function updatePriceLabels() {
    const minEl = document.getElementById('priceMinSlider');
    const maxEl = document.getElementById('priceMaxSlider');
    const minLabel = document.getElementById('priceMinLabel');
    const maxLabel = document.getElementById('priceMaxLabel');
    if (minEl && maxEl && parseFloat(minEl.value) > parseFloat(maxEl.value)) {
        maxEl.value = minEl.value;
    }
    if (minEl && minLabel) minLabel.textContent = '$' + minEl.value;
    if (maxEl && maxLabel) maxLabel.textContent = '$' + maxEl.value;
}

function updatePriceRangeBar() {
    const minEl = document.getElementById('priceMinSlider');
    const maxEl = document.getElementById('priceMaxSlider');
    const filled = document.getElementById('priceRangeFilled');
    if (!minEl || !maxEl || !filled) return;
    const minVal = parseFloat(minEl.value);
    const maxVal = parseFloat(maxEl.value);
    const range = 300;
    const left = (Math.min(minVal, maxVal) / range) * 100;
    const right = 100 - (Math.max(minVal, maxVal) / range) * 100;
    filled.style.left = left + '%';
    filled.style.right = right + '%';
}

function initPriceRangeBar() {
    const bar = document.querySelector('.filter-price-range-bar');
    const minEl = document.getElementById('priceMinSlider');
    const maxEl = document.getElementById('priceMaxSlider');
    if (!bar || !minEl || !maxEl) return;
    bar.addEventListener('mousemove', function(e) {
        const rect = bar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        if (pct < 0.5) { minEl.style.zIndex = '3'; maxEl.style.zIndex = '2'; }
        else { maxEl.style.zIndex = '3'; minEl.style.zIndex = '2'; }
    });
    bar.addEventListener('mouseleave', function() {
        minEl.style.zIndex = '2'; maxEl.style.zIndex = '2';
    });
}

function clearFilters() {
    state.filters = {
        category: null,
        brand: null,
        material: null,
        powder: null,
        thickness: null,
        size: null,
        color: null,
        grade: null,
        useCase: null,
        compliance: null,
        cutLevel: null,
        punctureLevel: null,
        abrasionLevel: null,
        flameResistant: null,
        arcLevel: null,
        warmRating: null,
        texture: null,
        cuffStyle: null,
        handOrientation: null,
        packaging: null,
        sterility: null,
        priceMin: null,
        priceMax: null,
        search: ''
    };
    
    // Reset all radio buttons
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        if (radio.value === '') radio.checked = true;
        else radio.checked = false;
    });
    
    // Reset all checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Reset price sliders
    const priceMinSlider = document.getElementById('priceMinSlider');
    const priceMaxSlider = document.getElementById('priceMaxSlider');
    if (priceMinSlider) priceMinSlider.value = 0;
    if (priceMaxSlider) priceMaxSlider.value = 300;
    updatePriceLabels();
    updatePriceRangeBar();
    
    // Reset search input if it exists
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    loadProducts();
}

function filterByCategory(category) {
    state.filters.category = category;
    navigate('products');
}

function filterByBrand(brand) {
    state.filters.brand = brand;
    navigate('products');
}

function filterByMaterial(material) {
    state.filters.material = material;
    navigate('products');
}

function buildBulkOrder() {
    // Get values from bulk builder
    const qty = document.getElementById('bulkBuilderQty')?.value || '';
    const type = document.getElementById('bulkBuilderType')?.value || '';
    
    // Get multiple selected use cases
    const useCheckboxes = document.querySelectorAll('input[name="bulkBuilderUse"]:checked');
    const useCases = Array.from(useCheckboxes).map(cb => cb.value);
    
    // If 100+ cases, trigger RFQ modal instead
    if (qty === '100+ cases') {
        showRFQModal();
        return;
    }
    
    // Reset filters first
    state.filters = {
        category: null,
        brand: null,
        material: null,
        powder: null,
        thickness: null,
        size: null,
        color: null,
        grade: null,
        useCase: null,
        compliance: null,
        texture: null,
        cuffStyle: null,
        handOrientation: null,
        packaging: null,
        sterility: null,
        priceMin: null,
        priceMax: null,
        search: ''
    };
    
    // Map Type to category filter
    if (type) {
        if (type === 'Disposable Gloves') {
            state.filters.category = 'Disposable Gloves';
        } else if (type === 'Reusable Gloves') {
            state.filters.category = 'Work Gloves';
        } else if (type === 'Both') {
            // Don't set category filter - show both types
            state.filters.category = null;
        }
    }
    
    // Map Use cases to useCase filter (multiple selections)
    if (useCases.length > 0) {
        // Map common use cases to industry filters
        const useCaseMap = {
            'Food Service': 'Food Service',
            'Industrial': 'Industrial',
            'Medical': 'Healthcare',
            'Janitorial': 'Janitorial',
            'Healthcare': 'Healthcare',
            'Food Processing': 'Food Processing',
            'Sanitation': 'Sanitation',
            'Laboratories': 'Laboratories',
            'Pharmaceuticals': 'Pharmaceuticals',
            'Beauty & Personal Care': 'Beauty & Personal Care',
            'Tattoo & Body Art': 'Tattoo & Body Art',
            'Automotive': 'Automotive',
            'Construction': 'Construction',
            'Manufacturing': 'Manufacturing',
            'Warehousing': 'Warehousing',
            'Logistics': 'Logistics'
        };
        
        const mappedUseCases = useCases
            .map(use => useCaseMap[use])
            .filter(use => use !== undefined);
        
        if (mappedUseCases.length > 0) {
            state.filters.useCase = mappedUseCases;
        }
    }
    
    // Navigate to products page with filters applied
    navigate('products');
}

function searchProducts() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const query = searchInput.value.trim();
        state.filters.search = query;
        if (query.length > 0 && state.currentPage !== 'products') {
            navigate('products');
        } else if (state.currentPage === 'products') {
            loadProducts(); // Reload products with new search
        }
    }
}

// ============================================
// PRODUCT CARD
// ============================================

function renderProductCard(product) {
    if (!product || (product.id == null && !product.sku)) return '';
    try {
        const isBulkUser = state.user?.is_approved;
        const price = Number(product.price);
        const bulkPrice = Number(product.bulk_price);
        const customerPrice = product.sell_price != null && Number.isFinite(Number(product.sell_price)) ? Number(product.sell_price) : null;
        let displayPrice = customerPrice != null ? customerPrice : (isBulkUser && bulkPrice > 0 ? bulkPrice : price);
        if (!Number.isFinite(displayPrice)) displayPrice = 0;
        const imgUrl = (product.image_url || '').trim();
        const productId = product.id != null ? product.id : (product.sku || '');
        
        // Apply discount tier if user is approved
        if (isBulkUser && state.user?.discount_tier && typeof getDiscountPercent === 'function') {
            const discountPercent = getDiscountPercent(state.user.discount_tier);
            if (discountPercent > 0) {
                displayPrice = displayPrice * (1 - discountPercent / 100);
            }
        }
    
        const productUrl = getProductUrl(product);
    return `
        <a href="${(productUrl || '#').replace(/"/g, '&quot;')}" class="product-card" onclick="event.preventDefault(); navigate('product', { id: ${productId} }); return false;" style="display:block; text-decoration:none; color:#111111;">
            ${product.featured ? '<div class="product-badge"><span class="badge badge-featured">Featured</span></div>' : ''}
            <div class="product-image">
                ${imgUrl ? `<img src="${imgUrl.replace(/"/g, '&quot;')}" alt="${(product.name || '').replace(/"/g, '&quot;')} - ${(product.brand || '')} ${(product.material || '')} Gloves - ${(product.sku || '')}" class="product-card-img" style="display:block;" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'; var p=this.nextElementSibling; if(p) p.style.display='flex';" />` : ''}
                <div class="product-image-placeholder" style="${imgUrl ? 'display:none;' : 'display:flex;'}">
                    <i class="fas fa-hand-paper"></i>
                </div>
                <div class="product-actions" onclick="event.preventDefault(); event.stopPropagation();">
                    <button type="button" class="product-action-btn" onclick="event.preventDefault(); quickAddToCart(${productId})" title="Add to Cart">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                    <button type="button" class="product-action-btn" onclick="event.preventDefault(); event.stopPropagation(); navigate('product', { id: ${productId} });" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
            <div class="product-info">
                <div class="product-brand">${(product.brand || '').replace(/</g, '&lt;')}</div>
                <h3 class="product-name">${(product.name || '').replace(/</g, '&lt;')}</h3>
                <div class="product-sku">${(product.sku || '').replace(/</g, '&lt;')}</div>
                <div class="product-meta">
                    <span class="product-material">${(product.material || '').replace(/</g, '&lt;')}</span>
                    <span class="product-pack">${product.pack_qty || 100}/box</span>
                </div>
                ${(product.case_qty || product.pack_qty) ? '<div class="product-case-min">Sold by case (' + (product.case_qty || product.pack_qty) + '). Min: 1 case.</div>' : ''}
                <div class="product-price">
                    <span class="price-current">$${displayPrice.toFixed(2)}</span>
                    ${!isBulkUser && bulkPrice > 0 ? `<span class="price-bulk">B2B: <span>$${bulkPrice.toFixed(2)}</span></span>` : ''}
                </div>
            </div>
        </a>
    `;
    } catch (error) {
        console.error('Error rendering product card:', error, product);
        const pid = product && (product.id != null ? product.id : product.sku);
        const dp = Number(product?.bulk_price) || Number(product?.price) || 0;
        const imgUrlFallback = (product?.image_url || '').trim();
        return `
        <div class="product-card" onclick="navigate('product', { id: ${pid} })">
            <div class="product-image">
                ${imgUrlFallback ? `<img src="${String(imgUrlFallback).replace(/"/g, '&quot;')}" alt="" class="product-card-img" style="display:block;" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'; var p=this.nextElementSibling; if(p) p.style.display='flex';" />` : ''}
                <div class="product-image-placeholder" style="${imgUrlFallback ? 'display:none;' : 'display:flex;'}">
                    <i class="fas fa-hand-paper"></i>
                </div>
            </div>
            <div class="product-info">
                <div class="product-brand">${(product?.brand || '').replace(/</g, '&lt;')}</div>
                <h3 class="product-name">${(product?.name || '').replace(/</g, '&lt;')}</h3>
                <div class="product-sku">${(product?.sku || '').replace(/</g, '&lt;')}</div>
                <div class="product-price">
                    <span class="price-current">$${dp.toFixed(2)}</span>
                </div>
            </div>
        </div>
    `;
    }
}

// ============================================
// SINGLE PRODUCT PAGE
// ============================================

async function renderProductPage(productId, opts = {}) {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    
    let product;
    if (opts.slug) {
        const q = new URLSearchParams({ slug: opts.slug });
        if (opts.category) q.set('category', opts.category);
        product = await api.get('/api/products/by-slug?' + q.toString()).catch(() => null);
    } else {
        product = await api.get(`/api/products/${productId}`);
    }
    
    if (!product || product.error) {
        mainContent.innerHTML = `
            <section class="product-page">
                <div class="container">
                    <div class="cart-empty">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h2>Product Not Found</h2>
                        <p>The product you're looking for doesn't exist.</p>
                        <button class="btn btn-primary" onclick="navigate('products')">Browse Products</button>
                    </div>
                </div>
            </section>
        `;
        return;
    }

    // SEO: ensure clean URL is in the bar (whether we arrived by id or slug)
    if (window.history && window.history.replaceState) {
        const url = opts.size ? getProductSizeUrl(product, opts.size) : getProductUrl(product);
        if (url && url !== window.location.pathname) window.history.replaceState(null, '', url);
    }

    const sizes = product.sizes ? product.sizes.split(/[\s,]+/).map(s => s.trim()).filter(Boolean) : [];
    const preSelectSize = opts.size && sizes.some(s => s.toLowerCase() === String(opts.size).toLowerCase()) ? String(opts.size).toUpperCase() : null;
    const firstSizeDisplay = preSelectSize || (sizes[0] || '').trim();
    const categorySeg = (product.material || product.subcategory || 'gloves').toString().toLowerCase().replace(/\s+/g, '-');
    const isBulkUser = state.user?.is_approved;
    const customerPrice = product.sell_price != null && Number.isFinite(Number(product.sell_price)) ? Number(product.sell_price) : null;
    let displayPrice = customerPrice != null ? customerPrice : (isBulkUser && product.bulk_price ? product.bulk_price : product.price);
    
    // Apply discount tier if user is approved
    if (isBulkUser && state.user?.discount_tier && typeof getDiscountPercent === 'function') {
        try {
            const discountPercent = getDiscountPercent(state.user.discount_tier);
            if (discountPercent > 0) {
                displayPrice = displayPrice * (1 - discountPercent / 100);
            }
        } catch (error) {
            console.error('Error applying discount:', error);
        }
    }

    const sizingChartUrl = (product.sizing_chart_url || '').trim();
    const isSizingChartUrl = (url) => {
        if (!url) return false;
        const u = url.toLowerCase();
        return u === sizingChartUrl.toLowerCase() || u.includes('sizing') || u.includes('sizingchart') || u.includes('size-chart') || u.includes('size_chart');
    };
    const allGalleryUrls = [(product.image_url || '').trim(), ...(Array.isArray(product.images) ? product.images : []).map(u => (typeof u === 'string' ? u : (u && u.url) ? u.url : '').trim())].filter(Boolean);
    const galleryImages = allGalleryUrls.filter(url => !isSizingChartUrl(url));
    const mainImgUrl = galleryImages[0] || '';
    const videoUrl = (product.video_url || '').trim();
    const isYouTube = videoUrl && (/youtube\.com\/watch\?v=|youtu\.be\//.test(videoUrl));
    const youtubeEmbed = videoUrl && isYouTube ? (videoUrl.includes('youtu.be/') ? 'https://www.youtube.com/embed/' + videoUrl.split('youtu.be/')[1].split('?')[0] : 'https://www.youtube.com/embed/' + (videoUrl.match(/[?&]v=([^&]+)/) || [])[1]) : '';
    mainContent.innerHTML = `
        <section class="product-page">
            <div class="container">
                <div class="breadcrumb">
                    <a href="/" onclick="event.preventDefault(); navigate('home'); return false;">Home</a>
                    <span>/</span>
                    <a href="/gloves/" onclick="event.preventDefault(); navigate('products'); return false;">Products</a>
                    <span>/</span>
                    <a href="/gloves/${(product.material || product.subcategory || 'gloves').toString().toLowerCase().replace(/\s+/g, '-')}/" onclick="event.preventDefault(); filterByCategory('${(product.category || '').replace(/'/g, "\\'")}'); navigate('products'); return false;">${getCategoryDisplayName(product.category)}</a>
                    <span>/</span>
                    <span>${product.name}${preSelectSize ? ' Size ' + preSelectSize : ''}</span>
                </div>
                <div class="product-detail">
                    <div class="product-gallery">
                        <div class="product-gallery-main">
                            ${mainImgUrl ? `<img id="productMainImage" src="${mainImgUrl.replace(/"/g, '&quot;')}" alt="${(product.name || 'Product').replace(/"/g, '&quot;')}" style="max-width:100%; height:auto; border-radius:8px; display:block;" referrerpolicy="no-referrer" onerror="this.style.display='none'; var p=this.nextElementSibling; if(p) p.style.display='flex';" />` : ''}
                            <div class="product-gallery-placeholder" style="${mainImgUrl ? 'display:none;' : 'display:flex;'}">
                                <i class="fas fa-hand-paper"></i>
                            </div>
                        </div>
                        ${galleryImages.length > 1 ? `
                        <div class="product-gallery-thumbs">
                            ${galleryImages.map((url, idx) => `
                                <button type="button" class="product-gallery-thumb ${idx === 0 ? 'active' : ''}" data-url="${(url || '').replace(/"/g, '&quot;')}" onclick="setProductMainImage(this)" aria-label="View image ${idx + 1}">
                                    <img src="${(url || '').replace(/"/g, '&quot;')}" alt="" loading="lazy" referrerpolicy="no-referrer" />
                                </button>
                            `).join('')}
                        </div>
                        ` : ''}
                        ${videoUrl ? `
                        <div class="product-video-section" style="margin-top: 20px;">
                            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #1a1a1a;">Product Video</h4>
                            ${youtubeEmbed ? `
                                <div class="product-video-embed" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; background: #000;">
                                    <iframe src="${youtubeEmbed.replace(/"/g, '&quot;')}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe>
                                </div>
                            ` : `
                                <video src="${videoUrl.replace(/"/g, '&quot;')}" controls style="max-width: 100%; border-radius: 8px; background: #000;"></video>
                            `}
                        </div>
                        ` : ''}
                    </div>
                    <div class="product-detail-info">
                        <div class="product-detail-brand">${product.brand}</div>
                        <h1>${product.name}${preSelectSize ? ' Size ' + preSelectSize : ''}</h1>
                        <div class="product-detail-sku">SKU: ${product.sku}</div>
                        ${sizes.length > 0 ? `<div id="productVariantSkuDisplay" class="product-detail-sku" style="margin-top:4px; color:#FF7A00; font-weight:600;" data-base-sku="${(product.sku || '').replace(/"/g, '&quot;')}">Variant SKU(s): <span id="productVariantSkuSize">${product.sku}-${firstSizeDisplay}</span></div>` : ''}
                        
                        <div class="product-detail-price">
                            <span class="price-current">$${displayPrice.toFixed(2)}</span>
                            <span class="price-bulk">per box of ${product.pack_qty}</span>
                            ${!isBulkUser && product.bulk_price ? `
                                <div class="bulk-notice">
                                    <i class="fas fa-tag"></i>
                                    B2B Price: $${product.bulk_price.toFixed(2)} - <a href="#" onclick="navigate('register'); return false;">Apply for B2B Account</a>
                                </div>
                            ` : ''}
                        </div>

                        <p class="product-description">${product.description}</p>

                        <div class="product-specs">
                            <h3>Specifications</h3>
                            <div class="specs-list">
                                <div class="spec-item">
                                    <span class="spec-label">Material:</span>
                                    <span class="spec-value">${product.material}</span>
                                </div>
                                <div class="spec-item">
                                    <span class="spec-label">Color:</span>
                                    <span class="spec-value">${product.color}</span>
                                </div>
                                <div class="spec-item">
                                    <span class="spec-label">Pack Qty:</span>
                                    <span class="spec-value">${product.pack_qty}/box</span>
                                </div>
                                <div class="spec-item">
                                    <span class="spec-label">Case Qty:</span>
                                    <span class="spec-value">${product.case_qty}/case</span>
                                </div>
                                ${(product.case_weight != null && product.case_weight > 0) || (product.case_length != null || product.case_width != null || product.case_height != null) ? `
                                <div class="spec-item">
                                    <span class="spec-label">Shipping:</span>
                                    <span class="spec-value">${[product.case_weight != null && product.case_weight > 0 ? product.case_weight + ' lbs/case' : '', (product.case_length != null && product.case_width != null && product.case_height != null) ? product.case_length + '×' + product.case_width + '×' + product.case_height + ' in' : ''].filter(Boolean).join(' • ')}</span>
                                </div>
                                ` : ''}
                            </div>
                            ${(product.case_qty || product.pack_qty) ? '<p style="font-size: 13px; color: var(--gray-600); margin-top: 12px;"><i class="fas fa-box"></i> Sold by case (' + (product.case_qty || product.pack_qty) + '). Min: 1 case.</p>' : ''}
                        </div>

                        ${sizes.length > 0 ? `
                            <div class="size-selector">
                                <h3>Select Size(s)</h3>
                                <p class="size-selector-hint" style="font-size: 12px; color: #4B5563; margin-bottom: 10px;">Select one or more sizes to add to cart.</p>
                                <div class="size-options size-options-checkboxes">
                                    ${sizes.map((size, i) => {
                                        const s = size.trim();
                                        const esc = (x) => (x || '').replace(/"/g, '&quot;');
                                        const checked = preSelectSize ? (s.toUpperCase() === preSelectSize) : (i === 0);
                                        return `
                                        <label class="size-checkbox-label">
                                            <input type="checkbox" class="size-checkbox" data-size="${esc(s)}" ${checked ? 'checked' : ''} onchange="toggleSizeCheckbox(this)">
                                            <span class="size-checkbox-text">${esc(s)}</span>
                                        </label>`;
                                    }).join('')}
                                </div>
                                <p class="size-seo-links" style="font-size: 12px; color: #6B7280; margin-top: 10px;">Shop by size: ${sizes.map(s => {
                                    const sz = s.trim();
                                    const u = getProductSizeUrl(product, sz);
                                    return `<a href="${u.replace(/"/g, '&quot;')}" onclick="event.preventDefault(); navigate('product', { slug: '${(slugify(product.name) || '').replace(/'/g, "\\'")}', category: '${(categorySeg || '').replace(/'/g, "\\'")}', size: '${sz.replace(/'/g, "\\'")}' }); return false;">${sz}</a>`;
                                }).join(' | ')}</p>
                            </div>
                        ` : ''}

                        <div class="product-sizing-chart-section">
                            <h3><i class="fas fa-ruler-combined"></i> Sizing Chart</h3>
                            ${sizingChartUrl ? `
                                <div class="sizing-chart-image-wrap">
                                    <img src="${sizingChartUrl.replace(/"/g, '&quot;')}" alt="Sizing chart for ${(product.name || 'product').replace(/"/g, '&quot;')}" class="sizing-chart-image" loading="lazy" referrerpolicy="no-referrer" />
                                </div>
                            ` : sizes.length > 0 ? (function(){
                                const letterSizes = ['XS','S','M','L','XL','2XL','3XL'];
                                const isLetterSizes = sizes.some(s => letterSizes.includes((s || '').trim().toUpperCase()));
                                if (isLetterSizes) {
                                    const rows = [
                                        ['Size', 'Hand width (in)', 'Hand length (in)'],
                                        ['XS', '2\u20132\u00BD', '6'],
                                        ['S', '2\u00BD\u20133', '6\u00BD'],
                                        ['M', '3\u20133\u00BD', '7'],
                                        ['L', '3\u00BD\u20134', '7\u00BD'],
                                        ['XL', '4\u20134\u00BD', '8'],
                                        ['2XL', '4\u00BD\u20135', '8\u00BD'],
                                        ['3XL', '5+', '9+']
                                    ];
                                    return '<p class="sizing-chart-hint" style="font-size:13px;color:var(--gray-600);margin-bottom:10px;">Measure around the widest part of your palm (excluding thumb). Length: from base of palm to tip of middle finger.</p><table class="sizing-chart-table"><thead><tr>' + rows[0].map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map(row => '<tr>' + row.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
                                }
                                const numRows = [['Size', 'Fits hand (in)', 'Typical use'], ['7', '7\u20137\u00BD', 'Small'], ['8', '7\u00BD\u20138', 'Medium'], ['9', '8\u20138\u00BD', 'Large'], ['10', '8\u00BD\u20139', 'X-Large'], ['11', '9+', 'XX-Large']];
                                return '<p class="sizing-chart-hint" style="font-size:13px;color:var(--gray-600);margin-bottom:10px;">Work glove numeric size typically matches hand circumference in inches.</p><table class="sizing-chart-table"><thead><tr>' + numRows[0].map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + numRows.slice(1).map(row => '<tr>' + row.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
                            })() : '<p class="sizing-chart-hint" style="font-size:13px;color:var(--gray-600);">This product has no size options. One size fits all.</p>'}
                        </div>

                        <div class="quantity-selector">
                            <h3>Quantity (boxes)</h3>
                            <div class="quantity-input">
                                <button onclick="updateQuantity(-1)">-</button>
                                <input type="number" id="productQuantity" value="1" min="1">
                                <button onclick="updateQuantity(1)">+</button>
                            </div>
                        </div>

                        <div class="add-to-cart-section">
                            <button class="btn btn-primary btn-lg" onclick="addProductToCart(${product.id})">
                                <i class="fas fa-cart-plus"></i> Add to Cart
                            </button>
                        </div>
                        <div class="product-ai-cta" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--gray-200);">
                            <p style="font-size: 14px; color: var(--gray-600); margin-bottom: 10px;">Not the right fit?</p>
                            <button type="button" class="btn btn-outline" onclick="navigate('ai-advisor', { prefill: getProductPrefill(window.__currentProduct) }); return false;" style="font-size: 14px;">
                                <i class="fas fa-robot" style="margin-right: 8px;"></i>Get a recommendation
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;

    window.__currentProduct = product;
    // Store selected sizes (array for multi-select); pre-select size for programmatic SEO pages
    window.selectedSizes = sizes.length > 0 ? (preSelectSize ? [preSelectSize] : [sizes[0].trim()]) : [];

    // SEO: document title and meta for product / product size page
    const seoTitle = product.name + (preSelectSize ? ' Size ' + preSelectSize : '');
    const seoDesc = (product.description || '').substring(0, 160) || (product.name + ' - ' + (product.material || '') + ' gloves. ' + (product.brand || '') + '. B2B bulk pricing.');
    setPageMeta(seoTitle, seoDesc);
}

// ============================================
// INDUSTRY LANDING PAGES (config-driven template)
// ============================================

function industryEsc(s) {
    if (s == null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function buildIndustryLandingHTML(slug, industry, products, config) {
    const c = config || {};
    const headline = c.heroHeadline || industry.title || slug;
    const subheadline = c.heroSubheadline || industry.description || '';
    const heroImage = (c.heroImage || '').trim() || '';
    const heroImageAlt = c.heroImageAlt || headline;
    const ctaPrimary = c.ctaPrimary || { text: 'Shop Gloves', href: '#shop', action: 'scroll' };
    const ctaSecondary = c.ctaSecondary || { text: 'Bulk Pricing', href: '#bulk', action: 'scroll' };
    const features = Array.isArray(c.features) ? c.features : [];
    const complianceBadges = Array.isArray(c.complianceBadges) ? c.complianceBadges : [];
    const proofStats = Array.isArray(c.proofStats) ? c.proofStats : [];
    const faq = Array.isArray(c.faq) ? c.faq : [];
    const filterDefaults = c.filterDefaults || { materials: [], thicknesses: [], certifications: [] };

    const proofStripHtml = proofStats.length > 0
        ? '<div class="industry-proof-strip"><div class="container"><div class="industry-proof-inner">' +
          proofStats.map(function (s) { return '<div class="industry-proof-stat"><span class="industry-proof-value">' + industryEsc(s.value) + '</span><span class="industry-proof-label">' + industryEsc(s.label) + '</span></div>'; }).join('') +
          '</div></div></div>'
        : '';

    const materialOpts = ['Nitrile', 'Latex', 'Vinyl', 'Polyethylene (PE)'];
    const thicknessOpts = ['2', '3', '4', '5', '6', '7+'];
    const defaultMaterials = filterDefaults.materials || [];
    const defaultThicknesses = filterDefaults.thicknesses || [];
    const quickPickerHtml = '<div class="industry-quick-picker" id="industryQuickPicker"><div class="container"><p class="industry-quick-picker-title">Quick filters</p><div class="industry-quick-picker-chips"><span class="industry-chip-label">Material:</span>' +
        materialOpts.map(function (m) {
            const active = defaultMaterials.indexOf(m) !== -1 ? ' industry-chip-active' : '';
            return '<button type="button" class="industry-chip' + active + '" data-filter="material" data-value="' + industryEsc(m) + '" onclick="industryQuickPickerChip(this)">' + industryEsc(m) + '</button>';
        }).join('') +
        '</div><div class="industry-quick-picker-chips"><span class="industry-chip-label">Thickness (mil):</span>' +
        thicknessOpts.map(function (t) {
            const active = defaultThicknesses.indexOf(t) !== -1 ? ' industry-chip-active' : '';
            return '<button type="button" class="industry-chip' + active + '" data-filter="thickness" data-value="' + industryEsc(t) + '" onclick="industryQuickPickerChip(this)">' + industryEsc(t) + '</button>';
        }).join('') +
        '</div></div></div>';

    const highlightsHtml = features.length > 0
        ? '<div class="industry-highlights"><div class="container"><div class="industry-highlights-grid">' +
          features.slice(0, 3).map(function (f) { return '<div class="industry-highlight-card"><h4 class="industry-highlight-title">' + industryEsc(f.title) + '</h4><p class="industry-highlight-desc">' + industryEsc(f.description) + '</p></div>'; }).join('') +
          '</div></div></div>'
        : '';

    const badgesHtml = complianceBadges.length > 0
        ? '<div class="industry-badges"><div class="container"><div class="industry-badges-inner">' +
          complianceBadges.map(function (b) { return '<span class="industry-badge">' + industryEsc(b) + '</span>'; }).join('') +
          '</div></div></div>'
        : '';

    const productCardsHtml = (products || []).slice(0, 48).map(function (p) { return renderProductCard(p); }).join('');

    const faqHtml = faq.length > 0
        ? '<div class="industry-faq"><div class="container"><h2 class="industry-faq-title">Frequently asked questions</h2><div class="industry-faq-list" id="industryFaqList">' +
          faq.map(function (item, i) {
            return '<div class="industry-faq-item"><button type="button" class="industry-faq-q" aria-expanded="false" aria-controls="industry-faq-a-' + i + '" id="industry-faq-q-' + i + '" onclick="industryFaqToggle(this)">' + industryEsc(item.q) + '</button><div class="industry-faq-a" id="industry-faq-a-' + i + '" role="region" aria-labelledby="industry-faq-q-' + i + '">' + industryEsc(item.a) + '</div></div>';
          }).join('') +
          '</div></div></div>'
        : '';

    const primaryAction = ctaPrimary.action === 'scroll' ? 'onclick="document.getElementById(\'shop\')&&document.getElementById(\'shop\').scrollIntoView({behavior:\'smooth\'}); return false;"' : '';
    const secondaryAction = ctaSecondary.action === 'scroll' && ctaSecondary.href === '#bulk' ? 'onclick="document.getElementById(\'bulk\')&&document.getElementById(\'bulk\').scrollIntoView({behavior:\'smooth\'}); return false;"' : (ctaSecondary.href === '#bulk' ? 'onclick="event.preventDefault(); navigate(\'b2b\'); return false;"' : '');

    return '<section class="industry-landing" data-industry="' + industryEsc(slug) + '" id="industryLanding">' +
        '<div class="industry-hero" style="' + (heroImage ? 'background-image:url(' + industryEsc(heroImage) + ');' : '') + '">' +
        '<div class="industry-hero-overlay"></div><div class="industry-hero-content"><div class="container"><h1 class="industry-hero-title">' + industryEsc(headline) + '</h1><p class="industry-hero-sub">' + industryEsc(subheadline) + '</p>' +
        '<div class="industry-hero-ctas"><a href="#shop" class="btn btn-primary industry-cta-primary" ' + primaryAction + '>' + industryEsc(ctaPrimary.text) + '</a><a href="#bulk" class="btn btn-outline industry-cta-secondary" ' + secondaryAction + '>' + industryEsc(ctaSecondary.text) + '</a></div></div></div></div>' +
        proofStripHtml +
        quickPickerHtml +
        highlightsHtml +
        badgesHtml +
        '<div class="industry-shop-section" id="shop"><div class="container"><h2 class="industry-section-title">Shop gloves</h2><div class="products-grid industry-products-grid" id="industryProductsGrid">' + (productCardsHtml || '<p class="industry-no-products">No products found. Try adjusting filters above.</p>') + '</div></div></div>' +
        '<div class="industry-bulk-panel" id="bulk"><div class="container"><div class="industry-bulk-inner"><h2 class="industry-section-title">Bulk pricing &amp; reorders</h2><p class="industry-bulk-desc">Get case pricing and net terms. Tell us your volume and we’ll respond with a quote.</p><button type="button" class="btn btn-primary" onclick="event.preventDefault(); navigate(\'b2b\'); return false;">Request bulk quote</button></div></div></div>' +
        faqHtml +
        '<div class="industry-sticky-cta" id="industryStickyCta" aria-label="Mobile actions"><a href="#shop" class="industry-sticky-btn" onclick="document.getElementById(\'shop\')&&document.getElementById(\'shop\').scrollIntoView({behavior:\'smooth\'}); return false;">Shop Now</a><button type="button" class="industry-sticky-btn industry-sticky-btn-secondary" onclick="navigate(\'b2b\')">Bulk Pricing</button></div>' +
        '</section>';
}

function industryQuickPickerChip(btn) {
    if (!btn || !btn.classList) return;
    btn.classList.toggle('industry-chip-active');
    industryApplyQuickPickerToUrl();
    industryFilterGridFromParams();
}

function industryApplyQuickPickerToUrl() {
    var picker = document.getElementById('industryQuickPicker');
    if (!picker) return;
    var materials = [];
    var thicknesses = [];
    picker.querySelectorAll('.industry-chip.industry-chip-active[data-filter="material"]').forEach(function (b) { materials.push(b.getAttribute('data-value')); });
    picker.querySelectorAll('.industry-chip.industry-chip-active[data-filter="thickness"]').forEach(function (b) { thicknesses.push(b.getAttribute('data-value')); });
    var params = new URLSearchParams(window.location.search);
    if (materials.length) params.set('material', materials.join(',')); else params.delete('material');
    if (thicknesses.length) params.set('thickness', thicknesses.join(',')); else params.delete('thickness');
    var qs = params.toString();
    var url = window.location.pathname + (qs ? '?' + qs : '');
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
}

function industryFilterGridFromParams() {
    var products = window.__industryProducts;
    if (!Array.isArray(products)) return;
    var params = new URLSearchParams(window.location.search);
    var materialParam = (params.get('material') || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    var thicknessParam = (params.get('thickness') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var filtered = products.filter(function (p) {
        if (materialParam.length) {
            var pm = (p.material || '').toLowerCase();
            if (!materialParam.some(function (m) { return pm.indexOf(m) !== -1 || m.indexOf(pm) !== -1; })) return false;
        }
        if (thicknessParam.length) {
            var pt = p.thickness != null ? (p.thickness >= 7 ? '7+' : String(p.thickness)) : '';
            if (!pt && thicknessParam.length) return false;
            if (pt && thicknessParam.indexOf(pt) === -1) return false;
        }
        return true;
    });
    var grid = document.getElementById('industryProductsGrid');
    if (!grid) return;
    grid.innerHTML = filtered.length ? filtered.slice(0, 48).map(function (p) { return renderProductCard(p); }).join('') : '<p class="industry-no-products">No products match. Try adjusting filters.</p>';
}

function industryFaqToggle(btn) {
    if (!btn || !btn.getAttribute) return;
    var expanded = btn.getAttribute('aria-expanded') === 'true';
    var id = btn.getAttribute('aria-controls');
    var panel = id ? document.getElementById(id) : btn.nextElementSibling;
    btn.setAttribute('aria-expanded', !expanded);
    if (panel) panel.classList.toggle('industry-faq-a-open', !expanded);
}

async function renderIndustryPage(industrySlug) {
    var mainContent = document.getElementById('mainContent');
    if (!mainContent) return;
    mainContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    var slug = (industrySlug || '').toString().trim().toLowerCase().replace(/\s+/g, '-');
    var configSlug = slug;
    if (slug === 'foodservice' || slug === 'food-processing') configSlug = 'food-service';
    if (slug === 'manufacturing') configSlug = 'industrial';
    var config = (typeof window.industryConfig !== 'undefined' && window.industryConfig[configSlug]) ? window.industryConfig[configSlug] : null;
    try {
        var data = await api.get('/api/seo/industry/' + encodeURIComponent(slug));
        if (!data || !data.industry) {
            setPageMeta('Industry Not Found', '');
            mainContent.innerHTML = '<section class="container" style="padding: 60px 20px;"><h1>Industry Not Found</h1><p><a href="#" onclick="navigate(\'products\'); return false;">Browse all gloves</a></p></section>';
            return;
        }
        var industry = data.industry;
        var products = data.products || [];
        setPageMeta(industry.title, industry.description);
        if (window.history && window.history.replaceState) {
            var path = '/industries/' + slug + '/';
            if (path !== window.location.pathname) window.history.replaceState(null, '', path);
        }
        window.__industryProducts = products;
        window.__industrySlug = slug;
        var qs = window.location.search;
        var params = new URLSearchParams(qs);
        var materialParam = (params.get('material') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var thicknessParam = (params.get('thickness') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (config && config.filterDefaults) {
            if (materialParam.length === 0 && config.filterDefaults.materials && config.filterDefaults.materials.length) materialParam = config.filterDefaults.materials;
            if (thicknessParam.length === 0 && config.filterDefaults.thicknesses && config.filterDefaults.thicknesses.length) thicknessParam = config.filterDefaults.thicknesses;
            if (materialParam.length || thicknessParam.length) {
                var p2 = new URLSearchParams();
                if (materialParam.length) p2.set('material', materialParam.join(','));
                if (thicknessParam.length) p2.set('thickness', thicknessParam.join(','));
                var newUrl = window.location.pathname + (p2.toString() ? '?' + p2.toString() : '');
                if (newUrl !== window.location.pathname + window.location.search) window.history.replaceState(null, '', newUrl);
            }
        }
        mainContent.innerHTML = buildIndustryLandingHTML(slug, industry, products, config);
        (function syncChipsFromUrl() {
            var params = new URLSearchParams(window.location.search);
            var hasParams = params.has('material') || params.has('thickness');
            if (!hasParams) return;
            var materials = (params.get('material') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            var thicknesses = (params.get('thickness') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            var picker = document.getElementById('industryQuickPicker');
            if (picker) {
                picker.querySelectorAll('.industry-chip[data-filter="material"]').forEach(function (b) {
                    var v = b.getAttribute('data-value');
                    if (materials.indexOf(v) !== -1) b.classList.add('industry-chip-active'); else b.classList.remove('industry-chip-active');
                });
                picker.querySelectorAll('.industry-chip[data-filter="thickness"]').forEach(function (b) {
                    var v = b.getAttribute('data-value');
                    if (thicknesses.indexOf(v) !== -1) b.classList.add('industry-chip-active'); else b.classList.remove('industry-chip-active');
                });
            }
        })();
        industryFilterGridFromParams();
    } catch (e) {
        var is404 = (e && e.message && /not found|404/i.test(e.message));
        setPageMeta(is404 ? 'Industry Not Found' : 'Error', '');
        mainContent.innerHTML = '<section class="container" style="padding: 60px 20px;"><h1>' + (is404 ? 'Industry Not Found' : 'Unable to load page') + '</h1><p>The page you requested may not exist or a network error occurred.</p><p><a href="#" onclick="navigate(\'products\'); return false;">Browse all gloves</a></p></section>';
    }
}

function isElementInViewport(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
}

function setProductMainImage(thumbBtn) {
    if (!thumbBtn) return;
    const url = thumbBtn.getAttribute('data-url');
    if (!url) return;
    const main = document.getElementById('productMainImage');
    if (main) main.src = url;
    document.querySelectorAll('.product-gallery-thumb').forEach(btn => btn.classList.remove('active'));
    thumbBtn.classList.add('active');
}

function toggleSizeCheckbox(checkbox) {
    const size = checkbox && checkbox.getAttribute('data-size');
    if (!size) return;
    const checkboxes = document.querySelectorAll('.size-checkbox:checked');
    window.selectedSizes = Array.from(checkboxes).map(cb => cb.getAttribute('data-size'));
    const span = document.getElementById('productVariantSkuSize');
    const displayEl = document.getElementById('productVariantSkuDisplay');
    const baseSku = (displayEl && displayEl.getAttribute('data-base-sku')) || '';
    if (span) {
        span.textContent = window.selectedSizes.length === 0
            ? '—'
            : window.selectedSizes.map(s => baseSku ? `${baseSku}-${s}` : s).join(', ');
    }
}

function updateQuantity(change) {
    const input = document.getElementById('productQuantity');
    let value = parseInt(input.value) + change;
    if (value < 1) value = 1;
    input.value = value;
}

async function addProductToCart(productId) {
    const quantity = parseInt(document.getElementById('productQuantity')?.value || 1);
    const selectedSizes = window.selectedSizes && Array.isArray(window.selectedSizes) ? window.selectedSizes : [];
    // If no multi-select (e.g. product has no sizes), fall back to single selectedSize for backwards compatibility
    const sizesToAdd = selectedSizes.length > 0 ? selectedSizes : (window.selectedSize ? [window.selectedSize] : [null]);

    if (sizesToAdd.length === 0 || (sizesToAdd.length === 1 && sizesToAdd[0] === null)) {
        // Product has no sizes - add single item
        await api.post('/api/cart', {
            product_id: productId,
            size: null,
            quantity: quantity
        });
        await loadCart();
        showToast('Product added to cart!');
        toggleCartSidebar(true);
        return;
    }

    for (const size of sizesToAdd) {
        await api.post('/api/cart', {
            product_id: productId,
            size: size,
            quantity: quantity
        });
    }

    await loadCart();
    const msg = sizesToAdd.length === 1
        ? 'Product added to cart!'
        : sizesToAdd.length + ' sizes added to cart!';
    showToast(msg);
    toggleCartSidebar(true);
}

async function quickAddToCart(productId) {
    await api.post('/api/cart', {
        product_id: productId,
        size: 'M',
        quantity: 1
    });

    await loadCart();
    showToast('Product added to cart!');
}

// ============================================
// CART
// ============================================

async function loadCart() {
    state.cart = await api.get('/api/cart');
    updateCartCount();
    updateCartSidebar();
}

function updateCartCount() {
    const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = count;
}

function updateCartSidebar() {
    const content = document.getElementById('cartSidebarContent');
    const subtotal = document.getElementById('cartSubtotal');
    
    if (state.cart.length === 0) {
        content.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #374151;">
                <i class="fas fa-shopping-cart" style="font-size: 48px; color: #ddd; margin-bottom: 16px;"></i>
                <p>Your cart is empty</p>
            </div>
        `;
        subtotal.textContent = '$0.00';
    } else {
        const isBulkUser = state.user?.is_approved;
        let total = 0;
        
        // Get discount percent for tier
        let discountPercent = 0;
        if (isBulkUser && state.user?.discount_tier && typeof getDiscountPercent === 'function') {
            try {
                discountPercent = getDiscountPercent(state.user.discount_tier);
            } catch (error) {
                console.error('Error getting discount percent:', error);
            }
        }
        
        content.innerHTML = state.cart.map(item => {
            let price = isBulkUser && item.bulk_price ? item.bulk_price : item.price;
            // Apply discount tier to price
            if (discountPercent > 0) {
                price = price * (1 - discountPercent / 100);
            }
            total += price * item.quantity;
            const itemImg = (item.image_url || '').trim();
            return `
                <div class="cart-sidebar-item">
                    <div class="cart-sidebar-item-image">
                        ${itemImg ? `<img src="${itemImg.replace(/"/g, '&quot;')}" alt="${item.name || 'Item'}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; display:block;" referrerpolicy="no-referrer" onerror="this.style.display='none'; var i=this.nextElementSibling; if(i) i.style.display='block';" />` : ''}
                        <i class="fas fa-hand-paper" style="${itemImg ? 'display:none;' : ''}"></i>
                    </div>
                    <div class="cart-sidebar-item-info">
                        <h4>${item.name}</h4>
                        <div class="sku" style="font-size: 11px; color: #4B5563; margin-top: 2px;">
                            ${item.variant_sku && item.variant_sku !== item.sku ? 
                                `<span style="font-weight: 600; color: #FF7A00;">${item.variant_sku}</span> <span style="color: #9CA3AF;">(${item.sku})</span>` : 
                                item.sku || 'N/A'
                            }
                        </div>
                        ${item.size ? `<div class="size" style="margin-top: 4px; font-size: 11px;"><strong>Size:</strong> <span style="background: #FF7A00; color: #ffffff; padding: 1px 6px; border-radius: 3px; font-weight: 600;">${item.size}</span></div>` : ''}
                        <div class="price">${item.quantity} x $${price.toFixed(2)}</div>
                    </div>
                    <button class="cart-sidebar-item-remove" onclick="removeFromCart(${item.id})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        subtotal.textContent = `$${total.toFixed(2)}`;
    }
}

function toggleCartSidebar(open) {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    
    if (open === undefined) {
        open = !sidebar.classList.contains('open');
    }
    
    if (open) {
        sidebar.classList.add('open');
        overlay.classList.add('open');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }
}

async function removeFromCart(cartItemId) {
    await api.delete(`/api/cart/${cartItemId}`);
    await loadCart();
    
    // Refresh cart page if on it
    if (state.currentPage === 'cart') {
        renderCartPage();
    }
}

// ============================================
// RFQ MODAL
// ============================================

function handleBulkBuilderQtyChange(selectElement) {
    if (selectElement.value === '100+ cases') {
        showRFQModal();
    }
}

function showRFQModal() {
    // Remove existing modal if present
    const existingModal = document.getElementById('rfqModalOverlay');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Get values from bulk builder if available
    const qty = document.getElementById('bulkBuilderQty')?.value || '';
    const type = document.getElementById('bulkBuilderType')?.value || '';
    
    // Get multiple selected use cases
    const useCheckboxes = document.querySelectorAll('input[name="bulkBuilderUse"]:checked');
    const useCases = Array.from(useCheckboxes).map(cb => cb.value);
    const use = useCases.length > 0 ? useCases.join(', ') : '';
    
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'rfqModalOverlay';
    modalOverlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.75); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);';
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) closeRFQModal();
    };
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background: #ffffff; border-radius: 20px; padding: 0; max-width: 700px; width: 100%; max-height: 90vh; overflow: hidden; box-shadow: 0 25px 70px rgba(0,0,0,0.4); position: relative; display: flex; flex-direction: column;';
    modalContent.onclick = (e) => e.stopPropagation();
    
    modalContent.innerHTML = `
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); padding: 32px 40px; color: #ffffff; position: relative; overflow: hidden;">
            <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
            <div style="position: absolute; bottom: -30px; left: -30px; width: 150px; height: 150px; background: rgba(255,255,255,0.08); border-radius: 50%;"></div>
            <button onclick="closeRFQModal()" style="position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.2); border: none; font-size: 20px; color: #ffffff; cursor: pointer; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; backdrop-filter: blur(10px);" onmouseover="this.style.background='rgba(255,255,255,0.3)'; this.style.transform='rotate(90deg)';" onmouseout="this.style.background='rgba(255,255,255,0.2)'; this.style.transform='rotate(0deg)';">
                <i class="fas fa-times"></i>
            </button>
            <div style="position: relative; z-index: 1; text-align: center;">
                <div style="width: 72px; height: 72px; background: rgba(255,255,255,0.25); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; backdrop-filter: blur(10px); border: 3px solid rgba(255,255,255,0.3);">
                    <i class="fas fa-file-invoice-dollar" style="color: #ffffff; font-size: 32px;"></i>
                </div>
                <h2 style="font-size: 32px; font-weight: 800; margin-bottom: 8px; text-shadow: 0 2px 10px rgba(0,0,0,0.2);">Request a Quote</h2>
                <p style="font-size: 16px; opacity: 0.95; font-weight: 500;">Get custom pricing for bulk orders • Response within 24 hours</p>
            </div>
        </div>
        
        <!-- Form Content -->
        <div style="padding: 40px; overflow-y: auto; flex: 1;">
            <form id="rfqForm" onsubmit="submitRFQ(event)" style="display: grid; gap: 24px;">
                <!-- Company Info Section -->
                <div>
                    <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <div style="width: 4px; height: 24px; background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); border-radius: 2px;"></div>
                        Company Information
                    </h3>
                    <div style="display: grid; gap: 20px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                                Company Name <span style="color: #FF7A00;">*</span>
                            </label>
                            <input type="text" name="company_name" required style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; transition: all 0.3s ease; background: #FFFFFF;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';" placeholder="Your company name">
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                                    Contact Name <span style="color: #FF7A00;">*</span>
                                </label>
                                <input type="text" name="contact_name" required style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; transition: all 0.3s ease; background: #FFFFFF;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';" placeholder="Your name">
                            </div>
                            <div>
                                <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                                    Email <span style="color: #FF7A00;">*</span>
                                </label>
                                <input type="email" name="email" required style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; transition: all 0.3s ease; background: #FFFFFF;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';" placeholder="your@email.com">
                            </div>
                        </div>
                        
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                                Phone <span style="color: #FF7A00;">*</span>
                            </label>
                            <input type="tel" name="phone" required style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; transition: all 0.3s ease; background: #FFFFFF;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';" placeholder="(555) 123-4567">
                        </div>
                    </div>
                </div>
                
                <!-- Order Details Section -->
                ${qty || type || use ? `
                <div style="background: linear-gradient(135deg, #fff5f0 0%, #ffe8d6 100%); padding: 24px; border-radius: 12px; border: 2px solid #FF7A00; position: relative; overflow: hidden;">
                    <div style="position: absolute; top: -20px; right: -20px; width: 100px; height: 100px; background: rgba(255,122,0,0.1); border-radius: 50%;"></div>
                    <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; position: relative; z-index: 1;">
                        <i class="fas fa-boxes" style="color: #FF7A00; font-size: 20px;"></i>
                        Order Details
                    </h3>
                    <div style="display: grid; gap: 16px; position: relative; z-index: 1;">
                        ${qty ? `
                        <div style="background: #FFFFFF; padding: 14px 16px; border-radius: 8px; border: 1px solid rgba(255,122,0,0.2);">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #4B5563; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Quantity</label>
                            <div style="font-size: 16px; font-weight: 700; color: #111111;">${qty}</div>
                            <input type="hidden" name="quantity" value="${qty}">
                        </div>
                        ` : ''}
                        ${type ? `
                        <div style="background: #FFFFFF; padding: 14px 16px; border-radius: 8px; border: 1px solid rgba(255,122,0,0.2);">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #4B5563; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Type</label>
                            <div style="font-size: 16px; font-weight: 700; color: #111111;">${type}</div>
                            <input type="hidden" name="type" value="${type}">
                        </div>
                        ` : ''}
                        ${use ? `
                        <div style="background: #FFFFFF; padding: 14px 16px; border-radius: 8px; border: 1px solid rgba(255,122,0,0.2);">
                            <label style="display: block; font-size: 12px; font-weight: 600; color: #4B5563; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Use Case</label>
                            <div style="font-size: 16px; font-weight: 700; color: #111111;">${use}</div>
                            <input type="hidden" name="use_case" value="${use}">
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : `
                <div style="background: #F9FAFB; padding: 24px; border-radius: 12px; border: 2px dashed #E5E7EB;">
                    <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin-bottom: 16px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-boxes" style="color: #4B5563; font-size: 20px;"></i>
                        Order Details
                    </h3>
                    <div style="display: grid; gap: 16px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                                Quantity <span style="color: #FF7A00;">*</span>
                            </label>
                            <input type="text" name="quantity" required style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; transition: all 0.3s ease; background: #FFFFFF;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';" placeholder="e.g., 100+ cases, 5000 units">
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                                Type of Gloves
                            </label>
                            <select name="type" style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; transition: all 0.3s ease; background: #FFFFFF; cursor: pointer;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';">
                                <option value="">Select Type</option>
                                <option value="Disposable Gloves">Disposable Gloves</option>
                                <option value="Reusable Gloves">Reusable Gloves</option>
                                <option value="Both">Both</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                                Use Case / Industry
                            </label>
                            <input type="text" name="use_case" style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; transition: all 0.3s ease; background: #FFFFFF;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';" placeholder="e.g., Food Service, Healthcare, Manufacturing">
                        </div>
                    </div>
                </div>
                `}
                
                <!-- Additional Notes -->
                <div>
                    <label style="display: block; font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">
                        Additional Notes or Requirements
                    </label>
                    <textarea name="notes" rows="5" style="width: 100%; padding: 14px 16px; border: 2px solid #E5E7EB; border-radius: 10px; font-size: 15px; font-family: inherit; resize: vertical; transition: all 0.3s ease; background: #FFFFFF; line-height: 1.6;" onfocus="this.style.borderColor='#FF7A00'; this.style.boxShadow='0 0 0 4px rgba(255,122,0,0.1)'; this.style.outline='none';" onblur="this.style.borderColor='#E5E7EB'; this.style.boxShadow='none';" placeholder="Any specific requirements, certifications needed, delivery timeline, preferred brands, etc."></textarea>
                </div>
                
                <!-- Submit Buttons -->
                <div style="display: flex; gap: 12px; margin-top: 10px; padding-top: 20px; border-top: 2px solid #E5E7EB;">
                    <button type="button" onclick="closeRFQModal()" style="flex: 1; padding: 16px; font-size: 15px; font-weight: 600; background: #F9FAFB; border: 2px solid #E5E7EB; border-radius: 10px; color: #4B5563; cursor: pointer; transition: all 0.3s ease;" onmouseover="this.style.background='#F3F4F6'; this.style.borderColor='#D1D5DB'; this.style.color='#111111';" onmouseout="this.style.background='#F9FAFB'; this.style.borderColor='#E5E7EB'; this.style.color='#6B7280';">
                        Cancel
                    </button>
                    <button type="submit" id="rfqSubmitBtn" style="flex: 2; padding: 16px; font-size: 16px; font-weight: 700; background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); border: none; border-radius: 10px; color: #ffffff; cursor: pointer; box-shadow: 0 4px 15px rgba(255,122,0,0.4); transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(255,122,0,0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(255,122,0,0.4)';">
                        <i class="fas fa-paper-plane"></i>
                        <span>Submit RFQ</span>
                    </button>
                </div>
            </form>
        </div>
    `;
    
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    
    // Add entrance animation
    modalOverlay.style.opacity = '0';
    modalOverlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
        modalOverlay.style.opacity = '1';
        modalContent.style.transform = 'scale(0.95)';
        modalContent.style.transition = 'transform 0.3s ease';
        setTimeout(() => {
            modalContent.style.transform = 'scale(1)';
        }, 10);
    }, 10);
    
    // Focus first input
    setTimeout(() => {
        const firstInput = modalContent.querySelector('input[type="text"], input[type="email"]');
        if (firstInput) firstInput.focus();
    }, 100);
}

function closeRFQModal() {
    const modal = document.getElementById('rfqModalOverlay');
    if (modal) {
        modal.style.opacity = '0';
        modal.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

async function submitRFQ(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>Submitting...';
    submitBtn.disabled = true;
    
    try {
        const response = await api.post('/api/rfqs', data);
        showToast('RFQ submitted successfully! We\'ll contact you within 24 hours.', 'success');
        closeRFQModal();
    } catch (error) {
        showToast('Error submitting RFQ. Please try again or contact us directly.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function updateCartItemQuantity(cartItemId, quantity) {
    await api.put(`/api/cart/${cartItemId}`, { quantity });
    await loadCart();
    renderCartPage();
}

async function renderCartPage() {
    const mainContent = document.getElementById('mainContent');
    let budgetInfo = null;
    if (state.user) {
        try { budgetInfo = await api.get('/api/account/budget'); } catch (e) {}
    }
    
    if (state.cart.length === 0) {
        mainContent.innerHTML = `
            <section class="cart-page">
                <div class="container">
                    <div class="cart-empty">
                        <i class="fas fa-shopping-cart"></i>
                        <h2>Your Cart is Empty</h2>
                        <p>Looks like you haven't added anything to your cart yet.</p>
                        <button class="btn btn-primary" onclick="navigate('products')">Start Shopping</button>
                    </div>
                </div>
            </section>
        `;
        return;
    }

    const isBulkUser = state.user?.is_approved;
    let subtotal = 0;
    
    // Get discount percent for tier
    let discountPercent = 0;
    if (isBulkUser && state.user?.discount_tier && typeof getDiscountPercent === 'function') {
        try {
            discountPercent = getDiscountPercent(state.user.discount_tier);
        } catch (error) {
            console.error('Error getting discount percent:', error);
        }
    }
    
    state.cart.forEach(item => {
        let price = isBulkUser && item.bulk_price ? item.bulk_price : item.price;
        // Apply discount tier to price
        if (discountPercent > 0) {
            price = price * (1 - discountPercent / 100);
        }
        subtotal += price * item.quantity;
    });
    
    const shipping = subtotal >= 500 ? 0 : 25;
    const tax = subtotal * 0.08;
    const total = subtotal + shipping + tax;

    mainContent.innerHTML = `
        <section class="cart-page">
            <div class="container">
                <h1 style="margin-bottom: 32px;">Shopping Cart</h1>
                <div class="cart-bulk-upload" style="margin-bottom: 24px; padding: 16px; background: var(--gray-100); border-radius: 8px;">
                    <h4 style="margin-bottom: 8px;"><i class="fas fa-upload"></i> Bulk add by SKU</h4>
                    <p style="font-size: 13px; color: var(--gray-600); margin-bottom: 10px;">Paste SKU, quantity (one per line). Example: GLV-GL-N105FB, 5</p>
                    <textarea id="bulkCartInput" rows="3" placeholder="SKU, quantity&#10;GLV-GL-N105FB, 5&#10;GLV-590MF, 2" style="width: 100%; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px; font-family: monospace; font-size: 13px;"></textarea>
                    <button type="button" class="btn btn-outline btn-sm" style="margin-top: 8px;" onclick="bulkAddToCart(); return false;">Add to cart</button>
                </div>
                <div class="cart-layout">
                    <div class="cart-items">
                        <div class="cart-header">
                            <span>Product</span>
                            <span>Price</span>
                            <span>Quantity</span>
                            <span>Total</span>
                            <span></span>
                        </div>
                        ${                        state.cart.map(item => {
                            let price = isBulkUser && item.bulk_price ? item.bulk_price : item.price;
                            // Apply discount tier to price
                            if (discountPercent > 0) {
                                price = price * (1 - discountPercent / 100);
                            }
                            const itemTotal = price * item.quantity;
                            const itemImg = (item.image_url || '').trim();
                            return `
                                <div class="cart-item">
                                    <div class="cart-item-info">
                                        <div class="cart-item-image">
                                            ${itemImg ? `<img src="${itemImg.replace(/"/g, '&quot;')}" alt="${item.name || 'Item'}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; display:block;" referrerpolicy="no-referrer" onerror="this.style.display='none'; var i=this.nextElementSibling; if(i) i.style.display='block';" />` : ''}
                                            <i class="fas fa-hand-paper" style="${itemImg ? 'display:none;' : ''}"></i>
                                        </div>
                                        <div class="cart-item-details">
                                            <h4>${item.name}</h4>
                                            <div class="sku">
                                                ${item.variant_sku && item.variant_sku !== item.sku ? 
                                                    `<span style="font-weight: 600; color: #FF7A00;">${item.variant_sku}</span> <span style="color: #4B5563; font-size: 12px;">(${item.sku})</span>` : 
                                                    item.sku || 'N/A'
                                                }
                                            </div>
                                            ${item.size ? `<div class="size" style="margin-top: 4px;"><strong>Size:</strong> <span style="background: #FF7A00; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">${item.size}</span></div>` : ''}
                                        </div>
                                    </div>
                                    <div class="cart-item-price">$${price.toFixed(2)}</div>
                                    <div class="cart-item-quantity">
                                        <div class="quantity-input">
                                            <button onclick="updateCartItemQuantity(${item.id}, ${item.quantity - 1})">-</button>
                                            <input type="number" value="${item.quantity}" readonly>
                                            <button onclick="updateCartItemQuantity(${item.id}, ${item.quantity + 1})">+</button>
                                        </div>
                                    </div>
                                    <div class="cart-item-total">$${itemTotal.toFixed(2)}</div>
                                    <button class="cart-item-remove" onclick="removeFromCart(${item.id})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="cart-summary">
                        <h3>Order Summary</h3>
                        ${!state.user ? `
                            <div class="b2b-discount-notice">
                                <i class="fas fa-info-circle"></i>
                                <a href="#" onclick="navigate('login'); return false;">Log in</a> to see B2B pricing and discounts!
                            </div>
                        ` : ''}
                        ${budgetInfo && budgetInfo.budget_amount != null ? `
                            <div class="cart-budget-widget" style="background: var(--gray-100); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
                                <strong><i class="fas fa-wallet"></i> Purchasing budget (${budgetInfo.budget_period})</strong><br>
                                Budget: $${Number(budgetInfo.budget_amount).toLocaleString()} | Spent: $${Number(budgetInfo.spent).toLocaleString()} | <span style="color: var(--success); font-weight: 600;">Remaining: $${Number(budgetInfo.remaining).toLocaleString()}</span>
                            </div>
                        ` : ''}
                        <div class="summary-row">
                            <span class="label">Subtotal</span>
                            <span class="value">$${subtotal.toFixed(2)}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Shipping</span>
                            <span class="value">${shipping === 0 ? 'FREE' : '$' + shipping.toFixed(2)}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Est. Tax</span>
                            <span class="value">$${tax.toFixed(2)}</span>
                        </div>
                        <div class="summary-row total">
                            <span class="label">Total</span>
                            <span class="value">$${total.toFixed(2)}</span>
                        </div>
                        ${subtotal < 500 ? `<p style="font-size: 13px; color: #374151; margin-top: 16px;"><i class="fas fa-truck" style="color: var(--primary);"></i> Add $${(500 - subtotal).toFixed(2)} more for free shipping!</p>` : ''}
                        <button class="btn btn-primary btn-block" onclick="navigate('checkout')">
                            Proceed to Checkout
                        </button>
                        ${state.user ? '<button type="button" class="btn btn-outline btn-block" onclick="saveCartAsList(); return false;"><i class="fas fa-save"></i> Save current cart as list</button>' : ''}
                        <button class="btn btn-outline-dark btn-block" onclick="navigate('products')">
                            Continue Shopping
                        </button>
                    </div>
                </div>
            </div>
        </section>
    `;
}

async function bulkAddToCart() {
    const ta = document.getElementById('bulkCartInput');
    if (!ta || !state.user) { showToast('Log in to use bulk add', 'error'); return; }
    const text = ta.value.trim();
    if (!text) { showToast('Enter SKU, quantity lines', 'error'); return; }
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
        const parts = line.split(/[,\t]/).map(p => p.trim());
        const sku = parts[0];
        const qty = parseInt(parts[1], 10) || 1;
        if (sku) items.push({ sku, quantity: qty });
    }
    if (items.length === 0) { showToast('No valid SKU, quantity lines', 'error'); return; }
    try {
        const res = await api.post('/api/cart/bulk', { items });
        showToast('Added ' + res.added + ' item(s)' + (res.skipped ? ', ' + res.skipped + ' skipped' : ''), 'success');
        ta.value = '';
        await loadCart();
        renderCartPage();
        const cartCount = document.getElementById('cartCount');
        if (cartCount) cartCount.textContent = state.cart.length;
    } catch (e) {
        showToast(e.message || 'Bulk add failed', 'error');
    }
}

async function saveCartAsList() {
    if (!state.user || state.cart.length === 0) { showToast('Cart is empty or log in first', 'error'); return; }
    const name = prompt('Name for this list (e.g. Monthly replenishment)');
    if (!name || !name.trim()) return;
    const items = state.cart.map(i => ({ product_id: i.product_id, size: i.size || null, quantity: i.quantity }));
    try {
        await api.post('/api/saved-lists', { name: name.trim(), items });
        showToast('List saved', 'success');
        navigate('dashboard');
    } catch (e) {
        showToast(e.message || 'Could not save list', 'error');
    }
}

// ============================================
// CHECKOUT PAGE
// ============================================

async function renderCheckoutPage() {
    if (!state.user) {
        navigate('login');
        showToast('Please log in to checkout');
        return;
    }

    if (state.cart.length === 0) {
        navigate('cart');
        return;
    }

    const mainContent = document.getElementById('mainContent');
    const [user, shipToAddresses] = await Promise.all([
        api.get('/api/auth/me'),
        api.get('/api/ship-to').catch(() => [])
    ]);
    
    const isBulkUser = user.is_approved;
    let subtotal = 0;
    
    // Get discount percent for tier
    let discountPercent = 0;
    if (user.is_approved && user.discount_tier && typeof getDiscountPercent === 'function') {
        try {
            discountPercent = getDiscountPercent(user.discount_tier);
        } catch (error) {
            console.error('Error getting discount percent:', error);
            // Fallback to manual calculation
            switch (user.discount_tier) {
                case 'bronze': discountPercent = 5; break;
                case 'silver': discountPercent = 10; break;
                case 'gold': discountPercent = 15; break;
                case 'platinum': discountPercent = 20; break;
            }
        }
    }
    
    // Calculate subtotal with tier discount already applied to individual prices
    state.cart.forEach(item => {
        let price = isBulkUser && item.bulk_price ? item.bulk_price : item.price;
        // Apply discount tier to price
        if (discountPercent > 0) {
            price = price * (1 - discountPercent / 100);
        }
        subtotal += price * item.quantity;
    });
    
    // Discount is already applied to prices, so discount amount is 0
    const discount = 0;
    const shipping = subtotal >= 500 ? 0 : 25;
    const tax = (subtotal - discount) * 0.08;
    const total = subtotal - discount + shipping + tax;

    mainContent.innerHTML = `
        <section class="checkout-page">
            <div class="container">
                <h1 style="margin-bottom: 32px;">Checkout</h1>
                <div class="checkout-layout">
                    <div class="checkout-form">
                        ${user.is_approved && (user.payment_terms || 'credit_card') === 'net30' ? '<div class="checkout-net-terms" style="background: #f0f9ff; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #bae6fd;"><i class="fas fa-file-invoice-dollar"></i> <strong>Payment: Net 30</strong> — This order will be invoiced. Pay within 30 days.</div>' : ''}
                        ${user.is_approved && (user.payment_terms || 'credit_card') === 'credit_card' ? '<div style="background: var(--gray-100); padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;"><i class="fas fa-credit-card"></i> <strong>Payment: Credit Card</strong> — You will pay by credit card for this order.</div>' : ''}
                        <div class="checkout-section">
                            <h3>Shipping Address</h3>
                            ${shipToAddresses.length > 0 ? `
                                <div class="form-group">
                                    <label>Ship to</label>
                                    <select id="checkoutShipTo" style="width:100%; padding:12px; border:2px solid #e0e0e0; border-radius:8px;" onchange="toggleCheckoutAddress(this);">
                                        <option value="">Custom address (below)</option>
                                        ${shipToAddresses.map(s => '<option value="' + s.id + '">' + (s.label || 'Primary') + ' — ' + s.address + ', ' + s.city + ', ' + s.state + ' ' + s.zip + '</option>').join('')}
                                    </select>
                                </div>
                            ` : ''}
                            <div id="checkoutAddressFields">
                            <div class="form-group">
                                <label>Company Name</label>
                                <input type="text" id="checkoutCompany" value="${user.company_name}" readonly>
                            </div>
                            <div class="form-group">
                                <label>Contact Name</label>
                                <input type="text" id="checkoutContact" value="${user.contact_name}">
                            </div>
                            <div class="form-group">
                                <label>Street Address</label>
                                <input type="text" id="checkoutAddress" value="${user.address || ''}" placeholder="Enter street address">
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>City</label>
                                    <input type="text" id="checkoutCity" value="${user.city || ''}" placeholder="City">
                                </div>
                                <div class="form-group">
                                    <label>State</label>
                                    <input type="text" id="checkoutState" value="${user.state || ''}" placeholder="State">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>ZIP Code</label>
                                    <input type="text" id="checkoutZip" value="${user.zip || ''}" placeholder="ZIP">
                                </div>
                                <div class="form-group">
                                    <label>Phone</label>
                                    <input type="text" id="checkoutPhone" value="${user.phone || ''}" placeholder="Phone number">
                                </div>
                            </div>
                            </div>
                        </div>
                        <div class="checkout-section">
                            <h3>Order Notes (Optional)</h3>
                            <div class="form-group">
                                <textarea id="checkoutNotes" rows="3" placeholder="Special instructions for your order..."></textarea>
                            </div>
                        </div>
                        <input type="hidden" id="checkoutPaymentMethod" value="${(user.payment_terms || 'credit_card')}">
                        <button class="btn btn-primary btn-lg btn-block" onclick="placeOrder()">
                            <i class="fas fa-lock"></i> Place Order - $${total.toFixed(2)}
                        </button>
                    </div>
                    <div class="checkout-summary">
                        <h3>Order Summary</h3>
                        <div class="checkout-items">
                            ${                        state.cart.map(item => {
                            let price = isBulkUser && item.bulk_price ? item.bulk_price : item.price;
                            // Apply discount tier to price
                            if (discountPercent > 0) {
                                price = price * (1 - discountPercent / 100);
                            }
                            const checkoutItemImg = (item.image_url || '').trim();
                            return `
                                    <div class="checkout-item">
                                        <div class="checkout-item-image">
                                            ${checkoutItemImg ? `<img src="${checkoutItemImg.replace(/"/g, '&quot;')}" alt="${item.name || 'Item'}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; display:block;" referrerpolicy="no-referrer" onerror="this.style.display='none'; var i=this.nextElementSibling; if(i) i.style.display='block';" />` : ''}
                                            <i class="fas fa-hand-paper" style="${checkoutItemImg ? 'display:none;' : ''}"></i>
                                        </div>
                                        <div class="checkout-item-info">
                                            <h4>${item.name}</h4>
                                            <div class="meta">
                                                ${item.variant_sku && item.variant_sku !== item.sku ? 
                                                    `<span style="font-weight: 600; color: #FF7A00;">SKU: ${item.variant_sku}</span> | ` : 
                                                    `SKU: ${item.sku} | `
                                                }
                                                ${item.size ? `Size: <strong>${item.size}</strong> | ` : ''}Qty: ${item.quantity}
                                            </div>
                                            <div class="price">$${(price * item.quantity).toFixed(2)}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="summary-row">
                            <span class="label">Subtotal</span>
                            <span class="value">$${subtotal.toFixed(2)}</span>
                        </div>
                        ${discountPercent > 0 ? `
                            <div class="summary-row" style="color: #4caf50; font-weight: 600;">
                                <span class="label"><i class="fas fa-tag" style="margin-right: 6px;"></i>${user.discount_tier.charAt(0).toUpperCase() + user.discount_tier.slice(1)} Tier Discount (${discountPercent}% applied)</span>
                                <span class="value">Included</span>
                            </div>
                        ` : ''}
                        <div class="summary-row">
                            <span class="label">Shipping</span>
                            <span class="value">${shipping === 0 ? 'FREE' : '$' + shipping.toFixed(2)}</span>
                        </div>
                        <div class="summary-row">
                            <span class="label">Tax</span>
                            <span class="value">$${tax.toFixed(2)}</span>
                        </div>
                        <div class="summary-row total">
                            <span class="label">Total</span>
                            <span class="value">$${total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function toggleCheckoutAddress(selectEl) {
    const fields = document.getElementById('checkoutAddressFields');
    if (!fields) return;
    fields.style.display = selectEl.value ? 'none' : 'block';
}

async function placeOrder() {
    const shipToSelect = document.getElementById('checkoutShipTo');
    const ship_to_id = shipToSelect && shipToSelect.value ? shipToSelect.value : null;
    const address = `${document.getElementById('checkoutContact').value}
${document.getElementById('checkoutAddress').value}
${document.getElementById('checkoutCity').value}, ${document.getElementById('checkoutState').value} ${document.getElementById('checkoutZip').value}
Phone: ${document.getElementById('checkoutPhone').value}`;
    
    const notes = document.getElementById('checkoutNotes').value;
    const paymentMethodEl = document.getElementById('checkoutPaymentMethod');
    const payment_method = paymentMethodEl ? paymentMethodEl.value : 'credit_card';

    const result = await api.post('/api/orders', {
        shipping_address: address,
        ship_to_id: ship_to_id || undefined,
        notes: notes,
        payment_method: payment_method
    });

    if (result.success) {
        await loadCart();
        showOrderConfirmation(result.order_number, result.total);
    } else {
        showToast(result.error || 'Failed to place order');
    }
}

function showOrderConfirmation(orderNumber, total) {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="cart-page">
            <div class="container">
                <div class="cart-empty">
                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                    <h2>Order Placed Successfully!</h2>
                    <p>Thank you for your order. Your order number is:</p>
                    <h3 style="color: var(--primary); margin: 16px 0;">${orderNumber}</h3>
                    <p>Total: $${total.toFixed(2)}</p>
                    <p style="margin-top: 16px; color: #374151;">A confirmation email has been sent to your email address.</p>
                    <div style="display: flex; gap: 16px; justify-content: center; margin-top: 24px;">
                        <button class="btn btn-primary" onclick="navigate('dashboard')">View Orders</button>
                        <button class="btn btn-outline-dark" onclick="navigate('products')">Continue Shopping</button>
                    </div>
                </div>
            </div>
        </section>
    `;
}

// ============================================
// AUTH PAGES
// ============================================

function renderLoginPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="auth-page">
            <div class="container auth-container">
                <div class="auth-tabs">
                    <div class="auth-tab active" onclick="navigate('login')">Login</div>
                    <div class="auth-tab" onclick="navigate('register')">Register</div>
                </div>
                <div class="auth-content auth-content-split">
                    <div class="auth-form">
                        <h2>Welcome Back</h2>
                        <p class="subtitle">Sign in to access your B2B account and exclusive pricing.</p>
                        
                        <div id="loginError" class="error-message" style="display: none;"></div>
                        
                        <div class="form-group">
                            <label for="loginEmail">Email Address</label>
                            <input type="email" id="loginEmail" placeholder="Enter your email" autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="loginPassword">Password</label>
                            <div class="password-input-wrap">
                                <input type="password" id="loginPassword" placeholder="Enter your password" autocomplete="current-password">
                                <button type="button" class="password-toggle" onclick="toggleLoginPasswordVisibility()" title="Show password" aria-label="Show password">
                                    <i class="fas fa-eye" id="loginPasswordToggleIcon"></i>
                                </button>
                            </div>
                        </div>
                        <button class="btn btn-primary btn-block" onclick="handleLogin()">
                            <i class="fas fa-sign-in-alt"></i> Sign In
                        </button>
                        <p class="auth-legal" style="margin-top: 12px;">
                            <a href="#" onclick="navigate('forgot-password'); return false;">Forgot password?</a>
                        </p>
                    </div>
                    <div class="b2b-benefits">
                            <h4>B2B Account Benefits</h4>
                            <ul>
                                <li><i class="fas fa-check"></i> Wholesale pricing on all products</li>
                                <li><i class="fas fa-check"></i> Volume discounts up to 20% off</li>
                                <li><i class="fas fa-check"></i> Dedicated account manager</li>
                                <li><i class="fas fa-check"></i> Net 30 payment terms (approved accounts)</li>
                                <li><i class="fas fa-check"></i> Order history and quick reorder</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;

    // Add enter key listener
    document.getElementById('loginPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
}

function toggleLoginPasswordVisibility() {
    const input = document.getElementById('loginPassword');
    const icon = document.getElementById('loginPasswordToggleIcon');
    togglePasswordVisibility(input, icon);
}

function toggleRegPasswordVisibility(inputId, iconId) {
    togglePasswordVisibility(document.getElementById(inputId), document.getElementById(iconId));
}

function togglePasswordVisibility(input, icon) {
    if (!input || !icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        icon.parentElement.setAttribute('title', 'Hide password');
        icon.parentElement.setAttribute('aria-label', 'Hide password');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        icon.parentElement.setAttribute('title', 'Show password');
        icon.parentElement.setAttribute('aria-label', 'Hide password');
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    if (!email || !password) {
        if (errorDiv) {
            errorDiv.textContent = 'Please enter email and password.';
            errorDiv.style.display = 'block';
        }
        return;
    }

    try {
        const result = await api.post('/api/auth/login', { email, password });
        if (result && result.success) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            state.user = result.user;
            updateHeaderAccount();
            await loadCart();
            showToast('Welcome back, ' + result.user.contact_name + '!');
            navigate('dashboard');
        } else {
            if (errorDiv) {
                errorDiv.textContent = result.error || 'Login failed. Please try again.';
                errorDiv.style.display = 'block';
            }
        }
    } catch (err) {
        if (errorDiv) {
            errorDiv.textContent = err.message || 'Invalid email or password. Please try again.';
            errorDiv.style.display = 'block';
        }
    }
}

function getResetTokenFromHash() {
    const hash = window.location.hash || '';
    const match = hash.match(/reset-password\?token=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

function renderForgotPasswordPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="auth-page" style="padding: 60px 20px;">
            <div class="container auth-container" style="max-width: 480px;">
                <div class="auth-form">
                    <h2><i class="fas fa-key"></i> Forgot Password</h2>
                    <p class="subtitle">Enter your account email and we'll send you a link to reset your password.</p>
                    <div id="forgotError" class="error-message" style="display: none; margin-bottom: 16px; padding: 12px; background: #ffebee; border-radius: 8px;"></div>
                    <div id="forgotSuccess" style="display: none; margin-bottom: 16px; padding: 12px; background: #e8f5e9; border-radius: 8px; color: #2e7d32;"></div>
                    <div class="form-group">
                        <label for="forgotEmail">Email Address</label>
                        <input type="email" id="forgotEmail" placeholder="your@company.com" autocomplete="email">
                    </div>
                    <button class="btn btn-primary btn-block" onclick="handleForgotPassword()">
                        <i class="fas fa-paper-plane"></i> Send Reset Link
                    </button>
                    <p style="text-align: center; margin-top: 16px;">
                        <a href="#" onclick="navigate('login'); return false;" style="color: var(--primary);">Back to Login</a>
                    </p>
                </div>
            </div>
        </section>
    `;
}

async function handleForgotPassword() {
    const email = document.getElementById('forgotEmail')?.value?.trim();
    const errorDiv = document.getElementById('forgotError');
    const successDiv = document.getElementById('forgotSuccess');
    if (errorDiv) { errorDiv.style.display = 'none'; errorDiv.textContent = ''; }
    if (successDiv) successDiv.style.display = 'none';
    if (!email) {
        if (errorDiv) { errorDiv.textContent = 'Please enter your email.'; errorDiv.style.display = 'block'; }
        return;
    }
    try {
        await api.post('/api/auth/forgot-password', { email });
        if (successDiv) {
            successDiv.textContent = 'If that email is on file, we sent a reset link. Check your inbox (and spam folder).';
            successDiv.style.display = 'block';
        }
    } catch (e) {
        if (errorDiv) {
            errorDiv.textContent = e.message || 'Something went wrong. Try again later.';
            errorDiv.style.display = 'block';
        }
    }
}

function renderResetPasswordPage(token) {
    const mainContent = document.getElementById('mainContent');
    if (!token) {
        mainContent.innerHTML = `
            <section class="auth-page" style="padding: 60px 20px;">
                <div class="container auth-container" style="max-width: 480px; text-align: center;">
                    <h2>Invalid Reset Link</h2>
                    <p>This link is invalid or has expired. Please <a href="#" onclick="navigate('forgot-password'); return false;">request a new one</a>.</p>
                    <button class="btn btn-primary" onclick="navigate('login')">Back to Login</button>
                </div>
            </section>
        `;
        return;
    }
    mainContent.innerHTML = `
        <section class="auth-page" style="padding: 60px 20px;">
            <div class="container auth-container" style="max-width: 480px;">
                <div class="auth-form">
                    <h2><i class="fas fa-lock"></i> Set New Password</h2>
                    <p class="subtitle">Enter your new password below.</p>
                    <div id="resetError" class="error-message" style="display: none; margin-bottom: 16px; padding: 12px; background: #ffebee; border-radius: 8px;"></div>
                    <div id="resetSuccess" style="display: none; margin-bottom: 16px; padding: 12px; background: #e8f5e9; border-radius: 8px; color: #2e7d32;"></div>
                    <div class="form-group">
                        <label for="resetPassword">New Password</label>
                        <input type="password" id="resetPassword" placeholder="Min 6 characters" autocomplete="new-password">
                    </div>
                    <div class="form-group">
                        <label for="resetPassword2">Confirm Password</label>
                        <input type="password" id="resetPassword2" placeholder="Confirm new password" autocomplete="new-password">
                    </div>
                    <button class="btn btn-primary btn-block" onclick="handleResetPassword('${token.replace(/'/g, "\\'")}')">
                        <i class="fas fa-check"></i> Update Password
                    </button>
                    <p style="text-align: center; margin-top: 16px;">
                        <a href="#" onclick="navigate('login'); return false;" style="color: var(--primary);">Back to Login</a>
                    </p>
                </div>
            </div>
        </section>
    `;
}

async function handleResetPassword(token) {
    const password = document.getElementById('resetPassword')?.value;
    const password2 = document.getElementById('resetPassword2')?.value;
    const errorDiv = document.getElementById('resetError');
    const successDiv = document.getElementById('resetSuccess');
    if (errorDiv) { errorDiv.style.display = 'none'; errorDiv.textContent = ''; }
    if (successDiv) successDiv.style.display = 'none';
    if (!password || password.length < 6) {
        if (errorDiv) { errorDiv.textContent = 'Password must be at least 6 characters.'; errorDiv.style.display = 'block'; }
        return;
    }
    if (password !== password2) {
        if (errorDiv) { errorDiv.textContent = 'Passwords do not match.'; errorDiv.style.display = 'block'; }
        return;
    }
    try {
        await api.post('/api/auth/reset-password', { token, password });
        if (successDiv) {
            successDiv.textContent = 'Password updated! You can log in now.';
            successDiv.style.display = 'block';
        }
        setTimeout(() => navigate('login'), 2000);
    } catch (e) {
        if (errorDiv) {
            errorDiv.textContent = e.message || 'Invalid or expired link. Please request a new one.';
            errorDiv.style.display = 'block';
        }
    }
}

function render404Page() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section style="padding: 80px 20px; text-align: center;">
            <div style="font-size: 72px; color: var(--primary); margin-bottom: 16px;"><i class="fas fa-search"></i></div>
            <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 12px;">Page Not Found</h1>
            <p style="color: var(--gray-600); margin-bottom: 24px; font-size: 18px;">The page you're looking for doesn't exist or has been moved.</p>
            <button onclick="navigate('home')" class="btn btn-primary" style="padding: 14px 28px; font-size: 16px;">
                <i class="fas fa-home"></i> Go to Homepage
            </button>
        </section>
    `;
}

function renderRegisterPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="auth-page">
            <div class="container auth-container">
                <div class="auth-tabs">
                    <div class="auth-tab" onclick="navigate('login')">Login</div>
                    <div class="auth-tab active" onclick="navigate('register')">Register</div>
                </div>
                <div class="auth-content">
                    <div class="auth-form auth-form-wide auth-form-register">
                        <h2 class="form-group-span-3">Apply for B2B Account</h2>
                        <p class="subtitle form-group-span-3">Create your business account to access wholesale pricing and bulk discounts.</p>
                        
                        <div id="registerError" class="error-message form-group-span-3" style="display: none;"></div>
                        <div id="registerSuccess" class="auth-success form-group-span-3" style="display: none;"></div>
                        
                        <div class="form-group form-group-span-2">
                            <label for="regCompany">Company Name *</label>
                            <input type="text" id="regCompany" placeholder="Your company name" autocomplete="organization">
                        </div>
                        <div class="form-group">
                            <label for="regContact">Contact Name *</label>
                            <input type="text" id="regContact" placeholder="Your full name" autocomplete="name">
                        </div>
                        <div class="form-group">
                            <label for="regPhone">Phone Number</label>
                            <input type="tel" id="regPhone" placeholder="(555) 123-4567" autocomplete="tel">
                        </div>
                        <div class="form-group form-group-span-3">
                            <label for="regEmail">Email Address *</label>
                            <input type="email" id="regEmail" placeholder="business@company.com" autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="regPassword">Password *</label>
                            <div class="password-input-wrap">
                                <input type="password" id="regPassword" placeholder="Min 6 characters" autocomplete="new-password">
                                <button type="button" class="password-toggle" onclick="toggleRegPasswordVisibility('regPassword', 'regPasswordToggleIcon')" title="Show password" aria-label="Show password">
                                    <i class="fas fa-eye" id="regPasswordToggleIcon"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="regPassword2">Confirm Password *</label>
                            <div class="password-input-wrap">
                                <input type="password" id="regPassword2" placeholder="Confirm password" autocomplete="new-password">
                                <button type="button" class="password-toggle" onclick="toggleRegPasswordVisibility('regPassword2', 'regPassword2ToggleIcon')" title="Show password" aria-label="Show password">
                                    <i class="fas fa-eye" id="regPassword2ToggleIcon"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group form-group-span-3">
                            <label for="regAddress">Business Address</label>
                            <input type="text" id="regAddress" placeholder="Street address" autocomplete="street-address">
                        </div>
                        <div class="form-group">
                            <label for="regCity">City</label>
                            <input type="text" id="regCity" placeholder="City" autocomplete="address-level2">
                        </div>
                        <div class="form-group">
                            <label for="regState">State</label>
                            <input type="text" id="regState" placeholder="State" autocomplete="address-level1">
                        </div>
                        <div class="form-group">
                            <label for="regZip">ZIP Code</label>
                            <input type="text" id="regZip" placeholder="ZIP" autocomplete="postal-code">
                        </div>
                        
                        <div class="form-group auth-checkbox-box form-group-span-3 auth-free-upgrades-row">
                            <label class="auth-checkbox-with-help" for="regAllowFreeUpgrades">
                                <input type="checkbox" id="regAllowFreeUpgrades" style="margin-top: 2px; accent-color: #FF7A00;">
                                <span class="auth-checkbox-label">Allow free upgrades</span>
                            </label>
                            <span class="auth-tooltip-trigger" tabindex="0" role="button" aria-label="What are free upgrades?">
                                <i class="fas fa-question-circle" aria-hidden="true"></i>
                                <span class="auth-tooltip-popover">If we are out of stock on an item, we will send another in-stock glove of equal or greater thickness and quality without charging you for the difference.</span>
                            </span>
                        </div>
                        
                        <div class="form-group-span-3">
                            <button class="btn btn-primary btn-block" onclick="handleRegister()">
                                <i class="fas fa-user-plus"></i> Create Account
                            </button>
                        </div>
                        
                        <p class="auth-legal form-group-span-3">
                            By registering, you agree to our <a href="#" onclick="navigate('terms'); return false;">Terms of Service</a> and <a href="#" onclick="navigate('privacy'); return false;">Privacy Policy</a>.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    `;
}

async function handleRegister() {
    const errorDiv = document.getElementById('registerError');
    const successDiv = document.getElementById('registerSuccess');
    
    const data = {
        company_name: document.getElementById('regCompany').value,
        contact_name: document.getElementById('regContact').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value,
        phone: document.getElementById('regPhone').value,
        address: document.getElementById('regAddress').value,
        city: document.getElementById('regCity').value,
        state: document.getElementById('regState').value,
        zip: document.getElementById('regZip').value,
        allow_free_upgrades: document.getElementById('regAllowFreeUpgrades').checked
    };

    const password2 = document.getElementById('regPassword2').value;

    // Validation
    if (!data.company_name || !data.contact_name || !data.email || !data.password) {
        errorDiv.textContent = 'Please fill in all required fields';
        errorDiv.style.display = 'block';
        successDiv.style.display = 'none';
        return;
    }

    if (data.password !== password2) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        successDiv.style.display = 'none';
        return;
    }

    if (data.password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        errorDiv.style.display = 'block';
        successDiv.style.display = 'none';
        return;
    }

    const result = await api.post('/api/auth/register', data);

    if (result.success) {
        errorDiv.style.display = 'none';
        successDiv.innerHTML = `
            <i class="fas fa-check-circle"></i> ${result.message}<br>
            <a href="#" onclick="navigate('login'); return false;">Click here to login</a>
        `;
        successDiv.style.display = 'block';
    } else {
        errorDiv.textContent = result.error || 'Registration failed';
        errorDiv.style.display = 'block';
        successDiv.style.display = 'none';
    }
}

function updateHeaderAccount() {
    const accountDiv = document.getElementById('headerAccount');
    if (!accountDiv) return;

    if (state.user) {
        const adminLink = state.user.is_approved ? `
            <a href="#" onclick="navigate('admin'); return false;" style="margin-right: 12px; color: #FF7A00; font-weight: 600;">
                <i class="fas fa-shield-alt"></i>
                <span>Admin</span>
            </a>
        ` : '';
        accountDiv.innerHTML = `
            ${adminLink}
            <a href="#" onclick="navigate('dashboard'); return false;">
                <i class="fas fa-user-circle"></i>
                <span>${state.user.company_name}</span>
            </a>
        `;
        var themeToggle = document.getElementById('headerThemeToggle');
        if (themeToggle) {
            if (isPortalPage()) themeToggle.classList.remove('theme-toggle-auth-only');
            else themeToggle.classList.add('theme-toggle-auth-only');
        }
    } else {
        accountDiv.innerHTML = `
            <a href="#" onclick="navigate('login'); return false;">
                <i class="fas fa-user"></i>
                <span>B2B Login</span>
            </a>
        `;
        var themeToggle = document.getElementById('headerThemeToggle');
        if (themeToggle) themeToggle.classList.add('theme-toggle-auth-only');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    state.user = null;
    state.cart = [];
    document.documentElement.setAttribute('data-theme', 'light');
    updateHeaderAccount();
    updateCartCount();
    showToast('You have been logged out');
    navigate('home');
}

// ============================================
// DASHBOARD PAGE
// ============================================

async function renderDashboardPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    
    const [user, orders, summary, tierProgress, budget, rep, savedLists, rfqsMine, shipToAddresses] = await Promise.all([
        api.get('/api/auth/me'),
        api.get('/api/orders'),
        api.get('/api/account/summary').catch(() => ({ total_spend: 0, ytd_spend: 0, last_30_days_spend: 0, total_savings: 0, order_count: 0, total_units: 0, ytd_orders: 0 })),
        api.get('/api/account/tier-progress').catch(() => null),
        api.get('/api/account/budget').catch(() => null),
        api.get('/api/account/rep').catch(() => ({ name: 'Glovecubs Sales', email: 'sales@glovecubs.com', phone: '1-800-GLOVECUBS' })),
        api.get('/api/saved-lists').catch(() => []),
        api.get('/api/rfqs/mine').catch(() => []),
        api.get('/api/ship-to').catch(() => [])
    ]);
    const sum = summary || {};

    const paymentTermsText = (user.payment_terms || 'credit_card') === 'net30' ? 'Net 30' : 'Credit Card';
    const netTermsText = user.is_approved ? ((user.payment_terms || 'credit_card') === 'net30' ? 'Net 30 terms' : 'Credit card') : 'Net terms after approval';
    const budgetHtml = budget ? `
        <div class="dashboard-section dashboard-budget-card">
            <h2><i class="fas fa-wallet"></i> Purchasing Budget</h2>
            ${budget.budget_amount != null ? `
                <div class="budget-display">
                    <div class="budget-row"><span>Budget (${budget.budget_period}):</span> <strong>$${Number(budget.budget_amount).toLocaleString()}</strong></div>
                    <div class="budget-row"><span>Spent:</span> <strong>$${Number(budget.spent).toLocaleString()}</strong></div>
                    <div class="budget-row budget-remaining"><span>Remaining:</span> <strong>$${Number(budget.remaining).toLocaleString()}</strong></div>
                    <div class="budget-progress-bar"><div class="budget-progress-fill" style="width: ${Math.min(100, (budget.spent / budget.budget_amount) * 100)}%"></div></div>
                </div>
                <button type="button" class="btn btn-outline btn-sm" onclick="openBudgetModal()">Edit Budget</button>
            ` : `
                <p style="color: var(--gray-600); margin-bottom: 12px;">Set a budget so your team can track spending.</p>
                <button type="button" class="btn btn-primary btn-sm" onclick="openBudgetModal()">Set Budget</button>
            `}
        </div>
    ` : '';

    const tierProgressHtml = tierProgress && tierProgress.next_tier ? `
        <div class="dashboard-section dashboard-tier-progress">
            <h2><i class="fas fa-chart-line"></i> Tier Progress</h2>
            <p>YTD spend: <strong>$${Number(tierProgress.ytd_spend).toLocaleString()}</strong></p>
            <p>You're <strong>$${Number(tierProgress.amount_to_next_tier).toLocaleString()}</strong> from <strong>${tierProgress.next_tier}</strong> (${tierProgress.next_tier_threshold ? '$' + Number(tierProgress.next_tier_threshold).toLocaleString() : ''})</p>
            <div class="tier-progress-bar"><div class="tier-progress-fill" style="width: ${tierProgress.next_tier_threshold ? Math.min(100, (tierProgress.ytd_spend / tierProgress.next_tier_threshold) * 100) : 0}%"></div></div>
        </div>
    ` : '';

    mainContent.innerHTML = `
        <section class="dashboard-page">
            <div class="container">
                <div class="dashboard-layout">
                    <aside class="dashboard-sidebar">
                        <div class="dashboard-user">
                            <div class="dashboard-user-avatar">
                                <i class="fas fa-building"></i>
                            </div>
                            <h3>${user.company_name}</h3>
                            <p>${user.email}</p>
                            ${user.is_approved ? `<span class="dashboard-tier">${user.discount_tier} Tier</span>` : '<span class="dashboard-tier" style="background: #666;">Pending Approval</span>'}
                        </div>
                        <div class="dashboard-sidebar-net-terms">
                            <i class="fas fa-file-invoice-dollar"></i> ${netTermsText}
                        </div>
                        <div class="dashboard-rep-card">
                            <h4>Your Rep</h4>
                            <p><strong>${rep.name}</strong></p>
                            <p><a href="mailto:${rep.email}">${rep.email}</a></p>
                            <p><a href="tel:${rep.phone.replace(/\D/g,'')}">${rep.phone}</a></p>
                        </div>
                        <nav class="dashboard-nav">
                            <a href="#" class="active"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
                            <a href="#" onclick="navigate('products'); return false;"><i class="fas fa-shopping-bag"></i> Shop Products</a>
                            <a href="#" onclick="navigate('cart'); return false;"><i class="fas fa-shopping-cart"></i> My Cart</a>
                            <a href="#" onclick="navigate('cart'); return false;"><i class="fas fa-upload"></i> Bulk Upload</a>
                            <a href="#" onclick="logout(); return false;"><i class="fas fa-sign-out-alt"></i> Logout</a>
                        </nav>
                    </aside>
                    <div class="dashboard-main">
                        <div class="dashboard-section dashboard-spend-savings">
                            <h2><i class="fas fa-chart-pie"></i> Spend &amp; Savings</h2>
                            <p style="color: #374151; font-size: 14px; margin-bottom: 20px;">Your purchasing activity and savings vs. list price.</p>
                            <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
                                <div class="stat-card" style="background: linear-gradient(135deg, #111 0%, #333 100%); color: #fff;">
                                    <i class="fas fa-dollar-sign" style="opacity: 0.9;"></i>
                                    <div class="value">$${Number(sum.total_spend || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                    <div class="label">Total Spend</div>
                                    <div class="stat-sub">All time</div>
                                </div>
                                <div class="stat-card" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #fff;">
                                    <i class="fas fa-calendar-alt" style="opacity: 0.9;"></i>
                                    <div class="value">$${Number(sum.ytd_spend || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                    <div class="label">YTD Spend</div>
                                    <div class="stat-sub">This year</div>
                                </div>
                                <div class="stat-card" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #fff;">
                                    <i class="fas fa-piggy-bank" style="opacity: 0.9;"></i>
                                    <div class="value">$${Number(sum.total_savings || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                    <div class="label">Total Savings</div>
                                    <div class="stat-sub">vs. list price</div>
                                </div>
                                <div class="stat-card" style="background: linear-gradient(135deg, #FF7A00 0%, #E66A00 100%); color: #fff;">
                                    <i class="fas fa-boxes" style="opacity: 0.9;"></i>
                                    <div class="value">${Number(sum.total_units || 0).toLocaleString()}</div>
                                    <div class="label">Units Ordered</div>
                                    <div class="stat-sub">Gloves / items</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                                <div><strong>Last 30 days:</strong> $${Number(sum.last_30_days_spend || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                                <div><strong>Orders this year:</strong> ${sum.ytd_orders || 0}</div>
                                ${(user.payment_terms || 'credit_card') === 'net30' ? '<div><i class="fas fa-file-invoice-dollar"></i> <strong>Payment:</strong> Net 30</div>' : '<div><i class="fas fa-credit-card"></i> <strong>Payment:</strong> Credit Card</div>'}
                            </div>
                        </div>
                        <div class="dashboard-section">
                            <h2>Account at a Glance</h2>
                            <div class="stats-grid">
                                <div class="stat-card">
                                    <i class="fas fa-shopping-bag"></i>
                                    <div class="value">${sum.order_count || orders.length}</div>
                                    <div class="label">Total Orders</div>
                                </div>
                                <div class="stat-card">
                                    <i class="fas fa-percent"></i>
                                    <div class="value">${getDiscountPercent(user.discount_tier)}%</div>
                                    <div class="label">Your Discount</div>
                                </div>
                                <div class="stat-card">
                                    <i class="fas fa-${user.is_approved ? 'check-circle' : 'clock'}"></i>
                                    <div class="value">${user.is_approved ? 'Active' : 'Pending'}</div>
                                    <div class="label">Account Status</div>
                                </div>
                                <div class="stat-card">
                                    <i class="fas fa-${(user.payment_terms || 'credit_card') === 'net30' ? 'file-invoice-dollar' : 'credit-card'}"></i>
                                    <div class="value">${paymentTermsText}</div>
                                    <div class="label">Payment Terms</div>
                                </div>
                            </div>
                        </div>
                        ${tierProgressHtml}
                        ${budgetHtml}
                        <div class="dashboard-section">
                            <h2>Recent Orders</h2>
                            ${orders.length > 0 ? `<button type="button" class="btn btn-outline btn-sm" style="margin-bottom:12px;" onclick="reorderOrder(${orders[0].id}); return false;"><i class="fas fa-redo"></i> Reorder Last Order</button>` : ''}
                            ${orders.length === 0 ? `
                                <p style="color: #374151; text-align: center; padding: 40px;">No orders yet. <a href="#" onclick="navigate('products'); return false;">Start shopping</a></p>
                            ` : `
                                <div class="orders-table-wrap">
                                <table class="orders-table">
                                    <thead>
                                        <tr>
                                            <th>Order #</th>
                                            <th>Date</th>
                                            <th>Status</th>
                                            <th>Total</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${orders.slice(0, 10).map(order => `
                                            <tr>
                                                <td><strong>${order.order_number}</strong></td>
                                                <td>${new Date(order.created_at).toLocaleDateString()}</td>
                                                <td><span class="order-status status-${order.status}">${order.status}</span></td>
                                                <td><strong>$${order.total.toFixed(2)}</strong></td>
                                                <td class="order-actions">
                                                    <button type="button" class="btn-order-action" onclick="reorderOrder(${order.id}); return false;" title="Reorder">Reorder</button>
                                                    ${(order.tracking_number || order.tracking_url) ? `<a href="${(order.tracking_url || '#').replace(/"/g,'&quot;')}" target="_blank" rel="noopener" class="btn-order-action">Track</a>` : '<span class="order-action-muted">Track</span>'}
                                                    <button type="button" class="btn-order-action" onclick="openInvoiceModal(${order.id}); return false;">Invoice</button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                                </div>
                            `}
                        </div>

                        <div class="dashboard-section">
                            <h2>Saved Lists</h2>
                            ${savedLists.length === 0 ? `
                                <p style="color: var(--gray-600);">Save your cart as a list to reorder quickly. Add items to cart, then "Save current cart as list" from the cart page.</p>
                                <a href="#" onclick="navigate('cart'); return false;" class="btn btn-outline btn-sm">Go to Cart</a>
                            ` : `
                                <ul class="saved-lists-list">
                                    ${savedLists.map(list => `
                                        <li class="saved-list-item">
                                            <span>${list.name}</span> (${list.items ? list.items.length : 0} items)
                                            <button type="button" class="btn btn-primary btn-sm" onclick="addSavedListToCart(${list.id}); return false;">Add to Cart</button>
                                            <button type="button" class="btn btn-outline btn-sm" onclick="deleteSavedList(${list.id}); return false;">Delete</button>
                                        </li>
                                    `).join('')}
                                </ul>
                            `}
                        </div>

                        <div class="dashboard-section">
                            <h2>My Quotes (RFQs)</h2>
                            ${rfqsMine.length === 0 ? `
                                <p style="color: var(--gray-600);">No quote requests yet. Use the RFQ form for bulk or custom quotes.</p>
                            ` : `
                                <ul class="rfq-list">
                                    ${rfqsMine.map(rfq => `
                                        <li class="rfq-item">
                                            <span class="rfq-status status-${rfq.status || 'pending'}">${rfq.status || 'pending'}</span>
                                            ${rfq.quantity ? rfq.quantity + ' • ' : ''}${rfq.type || ''} — ${new Date(rfq.created_at).toLocaleDateString()}
                                        </li>
                                    `).join('')}
                                </ul>
                            `}
                        </div>

                        <div class="dashboard-section">
                            <h2>Ship-To Addresses</h2>
                            ${shipToAddresses.length === 0 ? `
                                <p style="color: var(--gray-600);">Add multiple ship-to addresses for checkout.</p>
                                <button type="button" class="btn btn-outline btn-sm" onclick="openShipToModal(); return false;">Add Address</button>
                            ` : `
                                <ul class="ship-to-list">
                                    ${shipToAddresses.map(s => `
                                        <li>${s.label || 'Primary'}: ${s.address}, ${s.city}, ${s.state} ${s.zip} ${s.is_default ? '(default)' : ''}
                                            <button type="button" class="btn btn-outline btn-sm" onclick="openShipToModal(${s.id}); return false;">Edit</button>
                                        </li>
                                    `).join('')}
                                </ul>
                                <button type="button" class="btn btn-outline btn-sm" onclick="openShipToModal(); return false;">Add Address</button>
                            `}
                        </div>

                        <div class="dashboard-section">
                            <h2>Account Details</h2>
                            <div class="specs-list">
                                <div class="spec-item">
                                    <span class="spec-label">Company:</span>
                                    <span class="spec-value">${user.company_name}</span>
                                </div>
                                <div class="spec-item">
                                    <span class="spec-label">Contact:</span>
                                    <span class="spec-value">${user.contact_name}</span>
                                </div>
                                <div class="spec-item">
                                    <span class="spec-label">Email:</span>
                                    <span class="spec-value">${user.email}</span>
                                </div>
                                <div class="spec-item">
                                    <span class="spec-label">Phone:</span>
                                    <span class="spec-value">${user.phone || 'Not provided'}</span>
                                </div>
                                <div class="spec-item">
                                    <span class="spec-label">Address:</span>
                                    <span class="spec-value">${user.address ? `${user.address}, ${user.city}, ${user.state} ${user.zip}` : 'Not provided'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <div id="budgetModalOverlay" class="modal-overlay" style="display:none;"></div>
        <div id="invoiceModalOverlay" class="modal-overlay" style="display:none;"></div>
        <div id="shipToModalOverlay" class="modal-overlay" style="display:none;"></div>
    `;
    // Budget modal content (injected when opened)
    window._dashboardBudget = budget;
    window._dashboardShipToList = shipToAddresses;
}

async function reorderOrder(orderId) {
    try {
        await api.post('/api/orders/' + orderId + '/reorder');
        showToast('Items added to cart', 'success');
        const cartCount = document.getElementById('cartCount');
        if (cartCount) { const c = await api.get('/api/cart'); cartCount.textContent = (c && c.length) ? c.length : 0; }
        navigate('cart');
    } catch (e) {
        showToast(e.message || 'Could not reorder', 'error');
    }
}

async function openInvoiceModal(orderId) {
    try {
        const data = await api.get('/api/orders/' + orderId + '/invoice');
        const o = data.order;
        const company = data.company || {};
        const itemsRows = (o.items || []).map(i => '<tr><td>' + (i.name || '') + '</td><td>' + i.quantity + '</td><td>$' + Number(i.price).toFixed(2) + '</td><td>$' + Number(i.quantity * i.price).toFixed(2) + '</td></tr>').join('');
        const html = '<div class="invoice-print" style="max-width:700px; margin:0 auto; padding:24px; background:#fff; color:#111;">' +
            '<h2 style="margin-bottom:8px;">Invoice</h2>' +
            '<p><strong>' + (company.company_name || '') + '</strong><br>' + (company.contact_name || '') + '<br>' + (company.address || '') + ' ' + (company.city || '') + ', ' + (company.state || '') + ' ' + (company.zip || '') + '<br>' + (company.email || '') + ' ' + (company.phone || '') + '</p>' +
            '<p>Order #: <strong>' + (o.order_number || '') + '</strong><br>Date: ' + (o.created_at ? new Date(o.created_at).toLocaleDateString() : '') + '</p>' +
            '<table style="width:100%; border-collapse:collapse; margin:16px 0;"><thead><tr style="border-bottom:2px solid #ddd;"><th style="text-align:left;">Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>' + itemsRows + '</tbody></table>' +
            '<p>Subtotal: $' + Number(o.subtotal).toFixed(2) + ' | Shipping: $' + Number(o.shipping || 0).toFixed(2) + ' | Tax: $' + Number(o.tax || 0).toFixed(2) + '</p>' +
            '<p><strong>Total: $' + Number(o.total).toFixed(2) + '</strong></p></div>';
        const overlay = document.getElementById('invoiceModalOverlay');
        if (!overlay) return;
        overlay.innerHTML = '<div class="modal-content" style="max-height:90vh; overflow:auto;">' + html + '<div style="margin-top:16px;"><button type="button" class="btn btn-primary" onclick="window.print();">Print</button> <button type="button" class="btn btn-outline" onclick="closeInvoiceModal();">Close</button></div></div>';
        overlay.style.display = 'flex';
        overlay.onclick = function(e) { if (e.target === overlay) closeInvoiceModal(); };
    } catch (e) {
        showToast(e.message || 'Could not load invoice', 'error');
    }
}
function closeInvoiceModal() {
    const el = document.getElementById('invoiceModalOverlay');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

function openBudgetModal() {
    const budget = window._dashboardBudget || {};
    const overlay = document.getElementById('budgetModalOverlay');
    if (!overlay) return;
    const period = budget.budget_period || 'monthly';
    overlay.innerHTML = '<div class="modal-content" style="max-width:400px;">' +
        '<h2>Purchasing Budget</h2>' +
        '<p style="color:var(--gray-600); font-size:14px;">Set a budget so your staff can see remaining spend when ordering.</p>' +
        '<label style="display:block; margin-top:12px;">Amount ($)</label>' +
        '<input type="number" id="budgetAmount" value="' + (budget.budget_amount != null ? budget.budget_amount : '') + '" min="0" step="100" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px;">' +
        '<label style="display:block; margin-top:12px;">Period</label>' +
        '<select id="budgetPeriod" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px;">' +
        '<option value="monthly"' + (period === 'monthly' ? ' selected' : '') + '>Monthly</option>' +
        '<option value="annual"' + (period === 'annual' ? ' selected' : '') + '>Annual</option>' +
        '</select>' +
        '<div style="margin-top:20px; display:flex; gap:10px;">' +
        '<button type="button" class="btn btn-primary" onclick="saveBudget(); return false;">Save</button>' +
        '<button type="button" class="btn btn-outline" onclick="closeBudgetModal(); return false;">Cancel</button>' +
        '</div></div>';
    overlay.style.display = 'flex';
    overlay.onclick = function(e) { if (e.target === overlay) closeBudgetModal(); };
}
function closeBudgetModal() {
    const el = document.getElementById('budgetModalOverlay');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}
async function saveBudget() {
    const amount = document.getElementById('budgetAmount');
    const period = document.getElementById('budgetPeriod');
    if (!amount || !period) return;
    try {
        await api.put('/api/account/budget', { budget_amount: amount.value ? parseFloat(amount.value) : null, budget_period: period.value });
        showToast('Budget updated', 'success');
        closeBudgetModal();
        renderDashboardPage();
    } catch (e) {
        showToast(e.message || 'Failed to save budget', 'error');
    }
}

async function addSavedListToCart(listId) {
    try {
        await api.post('/api/saved-lists/' + listId + '/add-to-cart');
        showToast('List added to cart', 'success');
        const cartCount = document.getElementById('cartCount');
        if (cartCount) { const c = await api.get('/api/cart'); cartCount.textContent = (c && c.length) ? c.length : 0; }
        navigate('cart');
    } catch (e) {
        showToast(e.message || 'Could not add list to cart', 'error');
    }
}
async function deleteSavedList(listId) {
    if (!confirm('Delete this saved list?')) return;
    try {
        await api.delete('/api/saved-lists/' + listId);
        showToast('List deleted', 'success');
        renderDashboardPage();
    } catch (e) {
        showToast(e.message || 'Could not delete', 'error');
    }
}

function openShipToModal(editId) {
    const list = window._dashboardShipToList || [];
    const edit = editId ? list.find(s => s.id == editId) : null;
    const overlay = document.getElementById('shipToModalOverlay');
    if (!overlay) return;
    overlay.innerHTML = '<div class="modal-content" style="max-width:420px;">' +
        '<h2>' + (edit ? 'Edit' : 'Add') + ' Ship-To Address</h2>' +
        '<input type="hidden" id="shipToId" value="' + (edit ? edit.id : '') + '">' +
        '<label>Label (e.g. Warehouse A)</label>' +
        '<input type="text" id="shipToLabel" value="' + (edit ? (edit.label || '') : '') + '" placeholder="Primary" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:10px;">' +
        '<label>Address</label>' +
        '<input type="text" id="shipToAddress" value="' + (edit ? (edit.address || '') : '') + '" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:10px;">' +
        '<label>City</label>' +
        '<input type="text" id="shipToCity" value="' + (edit ? (edit.city || '') : '') + '" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:10px;">' +
        '<label>State</label>' +
        '<input type="text" id="shipToState" value="' + (edit ? (edit.state || '') : '') + '" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:10px;">' +
        '<label>ZIP</label>' +
        '<input type="text" id="shipToZip" value="' + (edit ? (edit.zip || '') : '') + '" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:10px;">' +
        '<label><input type="checkbox" id="shipToDefault"' + (edit && edit.is_default ? ' checked' : '') + '> Default address</label>' +
        '<div style="margin-top:16px; display:flex; gap:10px;">' +
        '<button type="button" class="btn btn-primary" onclick="saveShipTo(); return false;">Save</button>' +
        '<button type="button" class="btn btn-outline" onclick="closeShipToModal(); return false;">Cancel</button>' +
        (edit ? '<button type="button" class="btn btn-outline" style="color:#c00;" onclick="deleteShipTo(' + edit.id + '); return false;">Delete</button>' : '') +
        '</div></div>';
    overlay.style.display = 'flex';
    overlay.onclick = function(e) { if (e.target === overlay) closeShipToModal(); };
}
function closeShipToModal() {
    const el = document.getElementById('shipToModalOverlay');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}
async function saveShipTo() {
    const id = document.getElementById('shipToId') && document.getElementById('shipToId').value;
    const label = document.getElementById('shipToLabel').value.trim() || 'Primary';
    const address = document.getElementById('shipToAddress').value.trim();
    const city = document.getElementById('shipToCity').value.trim();
    const state = document.getElementById('shipToState').value.trim();
    const zip = document.getElementById('shipToZip').value.trim();
    const isDefault = document.getElementById('shipToDefault').checked;
    if (!address || !city || !state || !zip) { showToast('Please fill address, city, state, and ZIP', 'error'); return; }
    try {
        if (id) {
            await api.put('/api/ship-to/' + id, { label, address, city, state, zip, is_default: isDefault });
        } else {
            await api.post('/api/ship-to', { label, address, city, state, zip, is_default: isDefault });
        }
        showToast('Address saved', 'success');
        closeShipToModal();
        renderDashboardPage();
    } catch (e) {
        showToast(e.message || 'Failed to save', 'error');
    }
}
async function deleteShipTo(id) {
    try {
        await api.delete('/api/ship-to/' + id);
        showToast('Address deleted', 'success');
        closeShipToModal();
        renderDashboardPage();
    } catch (e) {
        showToast(e.message || 'Failed to delete', 'error');
    }
}

// getDiscountPercent moved to top of file for early availability

// ============================================
// B2B PAGE
// ============================================

function renderB2BPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="b2b-page">
            <div class="b2b-hero">
                <div class="container">
                    <h1>B2B <span>Wholesale Program</span></h1>
                    <p>Join our business program and unlock exclusive wholesale pricing, dedicated support, and volume discounts designed for professionals.</p>
                    <button class="btn btn-primary btn-lg" onclick="navigate('register')">
                        <i class="fas fa-user-plus"></i> Apply Now
                    </button>
                </div>
            </div>

            <section class="b2b-tiers">
                <div class="container">
                    <div class="section-header">
                        <h2>Discount Tiers</h2>
                        <p>The more you order, the more you save</p>
                    </div>
                    <div class="tiers-grid">
                        <div class="tier-card">
                            <div class="tier-icon tier-bronze"><i class="fas fa-medal"></i></div>
                            <h3>Bronze</h3>
                            <div class="tier-discount">5% <span>off</span></div>
                            <div class="tier-min">$1,000+ annual orders</div>
                            <ul class="tier-features">
                                <li><i class="fas fa-check"></i> Wholesale pricing</li>
                                <li><i class="fas fa-check"></i> Online ordering</li>
                                <li><i class="fas fa-check"></i> Email support</li>
                                <li><i class="fas fa-check"></i> Order tracking</li>
                            </ul>
                        </div>
                        <div class="tier-card">
                            <div class="tier-icon tier-silver"><i class="fas fa-medal"></i></div>
                            <h3>Silver</h3>
                            <div class="tier-discount">10% <span>off</span></div>
                            <div class="tier-min">$5,000+ annual orders</div>
                            <ul class="tier-features">
                                <li><i class="fas fa-check"></i> All Bronze benefits</li>
                                <li><i class="fas fa-check"></i> Priority shipping</li>
                                <li><i class="fas fa-check"></i> Phone support</li>
                                <li><i class="fas fa-check"></i> Quarterly reviews</li>
                            </ul>
                        </div>
                        <div class="tier-card featured">
                            <div class="tier-icon tier-gold"><i class="fas fa-crown"></i></div>
                            <h3>Gold</h3>
                            <div class="tier-discount">15% <span>off</span></div>
                            <div class="tier-min">$15,000+ annual orders</div>
                            <ul class="tier-features">
                                <li><i class="fas fa-check"></i> All Silver benefits</li>
                                <li><i class="fas fa-check"></i> Dedicated rep</li>
                                <li><i class="fas fa-check"></i> Net 30 terms</li>
                                <li><i class="fas fa-check"></i> Custom orders</li>
                            </ul>
                        </div>
                        <div class="tier-card">
                            <div class="tier-icon tier-platinum"><i class="fas fa-gem"></i></div>
                            <h3>Platinum</h3>
                            <div class="tier-discount">20% <span>off</span></div>
                            <div class="tier-min">$50,000+ annual orders</div>
                            <ul class="tier-features">
                                <li><i class="fas fa-check"></i> All Gold benefits</li>
                                <li><i class="fas fa-check"></i> Volume rebates</li>
                                <li><i class="fas fa-check"></i> Net 60 terms</li>
                                <li><i class="fas fa-check"></i> Private labeling</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <section class="b2b-cta">
                <div class="container">
                    <h2>Ready to Get Started?</h2>
                    <p>Apply for a B2B account today and start saving on your glove orders.</p>
                    <div style="display: flex; gap: 16px; justify-content: center;">
                        <button class="btn btn-primary btn-lg" onclick="navigate('register')">
                            <i class="fas fa-user-plus"></i> Apply Now
                        </button>
                        <button class="btn btn-secondary btn-lg" onclick="navigate('contact')">
                            <i class="fas fa-phone"></i> Contact Sales
                        </button>
                    </div>
                </div>
            </section>
        </section>
    `;
}

// ============================================
// CONTACT PAGE
// ============================================

function renderContactPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="contact-page">
            <div class="container">
                <div class="contact-grid">
                    <div class="contact-info">
                        <h1>Contact Us</h1>
                        <p>Have questions about our products or B2B program? We're here to help!</p>
                        
                        <div class="contact-cards">
                            <div class="contact-card">
                                <i class="fas fa-phone"></i>
                                <div>
                                    <h4>Phone</h4>
                                    <p>1-800-GLOVECUBS<br>Mon-Fri: 8AM - 6PM MST</p>
                                </div>
                            </div>
                            <div class="contact-card">
                                <i class="fas fa-envelope"></i>
                                <div>
                                    <h4>Email</h4>
                                    <p>sales@glovecubs.com<br>support@glovecubs.com</p>
                                </div>
                            </div>
                            <div class="contact-card">
                                <i class="fas fa-map-marker-alt"></i>
                                <div>
                                    <h4>Headquarters</h4>
                                    <p>Salt Lake City, UT<br>United States</p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin-top: 40px; background: #111111; padding: 32px; border-radius: 12px; color: #ffffff;">
                            <h3 style="font-size: 24px; font-weight: 700; margin-bottom: 12px; color: #FF7A00;">Built Here, Servicing Everywhere</h3>
                            <p style="color: #E5E7EB; line-height: 1.7; margin-bottom: 24px;">
                                Our headquarters in Salt Lake City, UT serves as the foundation of our operations. From this central location, we efficiently distribute quality gloves to businesses across the United States and beyond. Whether you're on the East Coast, West Coast, or anywhere in between, we're here to serve you.
                            </p>
                            <div style="width: 100%; height: 400px; border-radius: 8px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
                                <iframe 
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d12190.481301693!2d-111.89104748459382!3d40.76077997932681!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8752f5105c4b0b0b%3A0x5c5c5c5c5c5c5c5c!2sSalt%20Lake%20City%2C%20UT%2C%20USA!5e0!3m2!1sen!2sus!4v1706123456789!5m2!1sen!2sus" 
                                    width="100%" 
                                    height="400" 
                                    style="border:0; border-radius: 8px;" 
                                    allowfullscreen="" 
                                    loading="lazy" 
                                    referrerpolicy="no-referrer-when-downgrade"
                                    title="Glovecubs Headquarters - Salt Lake City, UT">
                                </iframe>
                            </div>
                        </div>
                    </div>
                    <div class="contact-form-container">
                        <h2>Send us a Message</h2>
                        <div class="form-group">
                            <label>Your Name</label>
                            <input type="text" id="contactName" placeholder="Full name">
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="contactEmail" placeholder="your@email.com">
                        </div>
                        <div class="form-group">
                            <label>Company (Optional)</label>
                            <input type="text" id="contactCompany" placeholder="Company name">
                        </div>
                        <div class="form-group">
                            <label>Subject</label>
                            <select id="contactSubject">
                                <option>General Inquiry</option>
                                <option>Product Question</option>
                                <option>B2B Account</option>
                                <option>Order Support</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Message</label>
                            <textarea id="contactMessage" rows="5" placeholder="How can we help you?"></textarea>
                        </div>
                        <button class="btn btn-primary btn-block" onclick="submitContact()">
                            <i class="fas fa-paper-plane"></i> Send Message
                        </button>
                    </div>
                </div>
            </div>
        </section>
    `;
}

// ============================================
// GLOVE FINDER (AI)
// ============================================

function renderGloveFinderPage() {
    setPageMeta('Glove Finder | Glovecubs', 'AI-powered glove recommendations by industry and use case.');
    const mainContent = document.getElementById('mainContent');
    const results = state.gloveFinderResults || null;
    mainContent.innerHTML = `
        <section class="container" style="padding: 48px 24px; max-width: 800px; margin: 0 auto;">
            <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #111;">Glove Finder</h1>
            <p style="color: #6B7280; margin-bottom: 32px;">Answer a few questions and get AI-powered product recommendations.</p>
            <div id="gloveFinderWizard" style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <div class="form-group" style="margin-bottom: 16px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 6px;">Industry / Use case</label>
                    <input type="text" id="gfIndustry" placeholder="e.g. Healthcare, Food Service" style="width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 16px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 6px;">Material preference</label>
                    <input type="text" id="gfMaterial" placeholder="e.g. Nitrile, Vinyl" style="width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 16px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 6px;">Quantity per month (optional)</label>
                    <input type="text" id="gfQuantity" placeholder="e.g. 5000" style="width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 16px;">
                    <label style="display: block; font-weight: 600; margin-bottom: 6px;">Budget or constraints (optional)</label>
                    <input type="text" id="gfConstraints" placeholder="e.g. budget-conscious" style="width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px;">
                </div>
                <button type="button" id="gfSubmitBtn" class="btn btn-primary" onclick="submitGloveFinder()" style="padding: 12px 24px;">
                    <i class="fas fa-search"></i> Get recommendations
                </button>
            </div>
            <div id="gloveFinderStatus" style="min-height: 24px; margin-bottom: 16px; font-size: 14px;"></div>
            <div id="gloveFinderResults" style="display: ${results ? 'block' : 'none'}; background: #fff; border: 1px solid #E5E7EB; border-radius: 12px; padding: 24px;">
                ${results ? '<h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">Recommendations</h2>' + (results.recommendations || []).map(function(r) {
                    return '<div style="padding: 12px 0; border-bottom: 1px solid #F3F4F6;"><strong>' + (r.name || '').replace(/</g, '&lt;') + '</strong>' + (r.brand ? ' &middot; ' + (r.brand || '').replace(/</g, '&lt;') : '') + '<p style="margin: 8px 0 0; color: #6B7280; font-size: 14px;">' + (r.reason || '').replace(/</g, '&lt;') + '</p></div>';
                }).join('') + (results.summary ? '<p style="margin-top: 16px; color: #374151;">' + (results.summary || '').replace(/</g, '&lt;') + '</p>' : '') : ''}
            </div>
        </section>
    `;
}

async function submitGloveFinder() {
    const btn = document.getElementById('gfSubmitBtn');
    const statusEl = document.getElementById('gloveFinderStatus');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finding...'; }
    if (statusEl) statusEl.textContent = '';
    try {
        const res = await fetch(api.baseUrl + '/api/ai/glove-finder', {
            method: 'POST',
            headers: api.getHeaders(),
            body: JSON.stringify({
                industry: (document.getElementById('gfIndustry') && document.getElementById('gfIndustry').value) || undefined,
                use_case: (document.getElementById('gfIndustry') && document.getElementById('gfIndustry').value) || undefined,
                material_preference: (document.getElementById('gfMaterial') && document.getElementById('gfMaterial').value) || undefined,
                quantity_per_month: (document.getElementById('gfQuantity') && document.getElementById('gfQuantity').value) || undefined,
                constraints: (document.getElementById('gfConstraints') && document.getElementById('gfConstraints').value) || undefined,
            }),
        });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            var errMsg = (data.error && typeof data.error === 'object' && data.error.message) ? data.error.message : (data.error || 'Request failed');
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (typeof errMsg === 'string' ? errMsg : 'Request failed') + '</span>';
            return;
        }
        state.gloveFinderResults = data;
        renderGloveFinderPage();
    } catch (err) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (err.message || 'Request failed') + '</span>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> Get recommendations'; }
    }
}

// ============================================
// INVOICE SAVINGS (AI)
// ============================================

function renderInvoiceSavingsPage() {
    setPageMeta('Invoice Savings | Glovecubs', 'Upload an invoice to get AI-powered swap recommendations.');
    const mainContent = document.getElementById('mainContent');
    const report = state.invoiceSavingsReport || null;
    mainContent.innerHTML = `
        <section class="container" style="padding: 48px 24px; max-width: 900px; margin: 0 auto;">
            <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #111;">Invoice Savings</h1>
            <p style="color: #6B7280; margin-bottom: 32px;">Paste invoice text to extract line items, then get product swap recommendations.</p>
            <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px;">Invoice text (paste from PDF or email)</label>
                <textarea id="invoiceText" rows="8" placeholder="Paste invoice content here..." style="width: 100%; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;"></textarea>
                <button type="button" id="invExtractBtn" class="btn btn-primary" onclick="submitInvoiceExtract()" style="margin-top: 12px; padding: 12px 24px;">
                    <i class="fas fa-file-alt"></i> Extract &amp; recommend
                </button>
            </div>
            <div id="invoiceStatus" style="min-height: 24px; margin-bottom: 16px; font-size: 14px;"></div>
            <div id="invoiceReport" style="display: ${report ? 'block' : 'none'}; background: #fff; border: 1px solid #E5E7EB; border-radius: 12px; padding: 24px;">
                ${report ? (report.summary ? '<p style="margin-bottom: 16px;">' + (report.summary || '').replace(/</g, '&lt;') + '</p>' : '') + (report.total_estimated_savings != null ? '<p style="font-weight: 600; margin-bottom: 16px;">Estimated savings: $' + Number(report.total_estimated_savings).toFixed(2) + '</p>' : '') + (report.recommendations || []).map(function(r) {
                    return '<div style="padding: 12px 0; border-bottom: 1px solid #F3F4F6;"><strong>' + (r.recommended_name || '').replace(/</g, '&lt;') + '</strong>' + (r.reason ? ' &middot; ' + (r.reason || '').replace(/</g, '&lt;') : '') + '</div>';
                }).join('') : ''}
            </div>
        </section>
    `;
}

async function submitInvoiceExtract() {
    const btn = document.getElementById('invExtractBtn');
    const statusEl = document.getElementById('invoiceStatus');
    const text = (document.getElementById('invoiceText') && document.getElementById('invoiceText').value) || '';
    if (!text.trim() || text.trim().length < 10) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #B45309;">Enter at least 10 characters of invoice text.</span>';
        return;
    }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting...'; }
    if (statusEl) statusEl.textContent = '';
    try {
        let res = await fetch(api.baseUrl + '/api/ai/invoice/extract', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify({ text: text }) });
        let data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (data.error || 'Extract failed') + '</span>';
            return;
        }
        if (statusEl) statusEl.textContent = 'Getting recommendations...';
        res = await fetch(api.baseUrl + '/api/ai/invoice/recommend', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify({ extract: data, upload_id: data.upload_id }) });
        data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (data.error || 'Recommend failed') + '</span>';
            return;
        }
        state.invoiceSavingsReport = data;
        renderInvoiceSavingsPage();
    } catch (err) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (err.message || 'Request failed') + '</span>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-alt"></i> Extract &amp; recommend'; }
    }
}

function renderAboutPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="contact-page" style="padding: 60px 0;">
            <div class="container">
                <div style="max-width: 900px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 48px;">
                        <h1 style="font-size: 42px; font-weight: 800; margin-bottom: 16px; color: var(--secondary);">About Glovecubs</h1>
                        <p style="font-size: 18px; color: var(--gray-600);">Real business. Real people. Real trust.</p>
                    </div>

                    <div style="background: var(--gray-100); padding: 40px; border-radius: var(--radius-lg); margin-bottom: 32px;">
                        <h2 style="font-size: 28px; font-weight: 700; margin-bottom: 20px; color: var(--secondary);">Our Story</h2>
                        <p style="color: var(--gray-700); line-height: 1.8; font-size: 16px; margin-bottom: 16px;">
                            <strong>Glovecubs LLC</strong> was founded in 2018 to serve healthcare facilities, food processors, and manufacturers with reliable, certified glove supply. We're not a pop-up reseller. We're a real business with real inventory, real people, and real commitment to your success.
                        </p>
                        <p style="color: var(--gray-700); line-height: 1.8; font-size: 16px;">
                            After seeing too many businesses struggle with unreliable suppliers, backorders, and quality issues, we built Glovecubs to be different. We focus on transparency, reliability, and building long-term partnerships—not quick sales.
                        </p>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-bottom: 48px;">
                        <div style="background: var(--white); padding: 32px; border-radius: var(--radius-lg); border: 1px solid var(--gray-200);">
                            <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: var(--secondary);">
                                <i class="fas fa-building" style="color: var(--primary); margin-right: 8px;"></i>
                                Company Information
                            </h3>
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100);">
                                    <strong>Legal Name:</strong> Glovecubs LLC
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100);">
                                    <strong>Founded:</strong> 2018
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100);">
                                    <strong>Headquarters:</strong> Salt Lake City, UT
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100);">
                                    <strong>Phone:</strong> 1-800-GLOVECUBS
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100);">
                                    <strong>Email:</strong> sales@glovecubs.com
                                </li>
                                <li style="padding: 8px 0;">
                                    <strong>Business Hours:</strong> Mon-Fri, 8AM - 6PM MST
                                </li>
                            </ul>
                        </div>
                        <div style="background: var(--white); padding: 32px; border-radius: var(--radius-lg); border: 1px solid var(--gray-200);">
                            <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: var(--secondary);">
                                <i class="fas fa-certificate" style="color: var(--primary); margin-right: 8px;"></i>
                                Certifications & Affiliations
                            </h3>
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100); display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                                    <span>FDA Registered Distributor</span>
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100); display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                                    <span>ISO Certified Supply Chain</span>
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100); display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                                    <span>ASTM Member</span>
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid var(--gray-100); display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                                    <span>NSF Certified Products</span>
                                </li>
                                <li style="padding: 8px 0; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-check-circle" style="color: var(--success);"></i>
                                    <span>CE Marked Products Available</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div style="background: var(--white); padding: 40px; border-radius: var(--radius-lg); border: 1px solid var(--gray-200);">
                        <h2 style="font-size: 28px; font-weight: 700; margin-bottom: 24px; color: var(--secondary); text-align: center;">Our Team</h2>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px;">
                            <div style="text-align: center;">
                                <div style="width: 120px; height: 120px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--white); font-size: 48px;">
                                    <i class="fas fa-user-tie"></i>
                                </div>
                                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">John Smith</h3>
                                <div style="font-size: 14px; color: var(--primary); font-weight: 600; margin-bottom: 8px;">CEO & Founder</div>
                                <p style="font-size: 13px; color: var(--gray-600);">20+ years in medical supply chain</p>
                            </div>
                            <div style="text-align: center;">
                                <div style="width: 120px; height: 120px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--white); font-size: 48px;">
                                    <i class="fas fa-user-tie"></i>
                                </div>
                                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Sarah Johnson</h3>
                                <div style="font-size: 14px; color: var(--primary); font-weight: 600; margin-bottom: 8px;">VP of Operations</div>
                                <p style="font-size: 13px; color: var(--gray-600);">Quality assurance & compliance expert</p>
                            </div>
                            <div style="text-align: center;">
                                <div style="width: 120px; height: 120px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--white); font-size: 48px;">
                                    <i class="fas fa-user-tie"></i>
                                </div>
                                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Mike Davis</h3>
                                <div style="font-size: 14px; color: var(--primary); font-weight: 600; margin-bottom: 8px;">Head of Sales</div>
                                <p style="font-size: 13px; color: var(--gray-600);">B2B account management specialist</p>
                            </div>
                        </div>
                    </div>

                    <div style="background: var(--primary); color: var(--white); padding: 40px; border-radius: var(--radius-lg); text-align: center; margin-top: 48px;">
                        <h2 style="font-size: 32px; font-weight: 700; margin-bottom: 16px;">Ready to Work Together?</h2>
                        <p style="font-size: 16px; opacity: 0.95; margin-bottom: 24px;">Let's discuss how we can support your glove supply needs.</p>
                        <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-secondary btn-lg" onclick="navigate('contact')" style="background: var(--white); color: var(--primary);">
                                <i class="fas fa-phone"></i> Contact Us
                            </button>
                            <button class="btn btn-outline btn-lg" onclick="navigate('register')" style="border-color: var(--white); color: var(--white);">
                                <i class="fas fa-user-plus"></i> Start B2B Account
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

// ============================================
// FAQ PAGE
// ============================================

function renderFAQPage() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <section class="faq-page" style="padding: 80px 0; background: linear-gradient(180deg, #ffffff 0%, #f8f8f8 100%);">
            <div class="container">
                <div style="max-width: 1000px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 60px;">
                        <h1 style="font-size: 48px; font-weight: 800; margin-bottom: 16px; color: #111111;">Frequently Asked Questions</h1>
                        <p style="font-size: 18px; color: #4B5563;">Everything you need to know about ordering from Glovecubs</p>
                    </div>

                    <div style="display: grid; gap: 24px;">
                        <!-- Ordering & Pricing -->
                        <div style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                            <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px; color: #FF7A00; display: flex; align-items: center; gap: 12px;">
                                <i class="fas fa-shopping-cart"></i> Ordering & Pricing
                            </h2>
                            <div style="display: grid; gap: 20px;">
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        What are your minimum order quantities?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Minimum orders vary by product. Most disposable gloves have a minimum of 1 case (typically 1,000 gloves). Reusable work gloves typically have a minimum of 12 pairs per order. For bulk orders of 100+ cases, please use our RFQ form for custom pricing.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        Do you offer volume discounts?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Yes! We offer tiered discount pricing for B2B customers: Bronze (5%), Silver (10%), Gold (15%), and Platinum (20%) based on your annual order volume. Discounts are automatically applied at checkout for approved accounts.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        Can I get a quote for a large order?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Absolutely! Use our Quick Bulk Builder on the homepage or submit an RFQ form for orders of 100+ cases. Our team will respond within 24 hours with custom pricing and availability.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        Do you offer net terms?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Yes, we offer Net-30 and Net-45 terms for approved B2B accounts. To qualify, complete our B2B registration and provide business information. Approval typically takes 1-2 business days.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Shipping & Delivery -->
                        <div style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                            <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px; color: #FF7A00; display: flex; align-items: center; gap: 12px;">
                                <i class="fas fa-shipping-fast"></i> Shipping & Delivery
                            </h2>
                            <div style="display: grid; gap: 20px;">
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        How fast is your shipping?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Orders ship from our Salt Lake City warehouse within 1-2 business days. Standard shipping takes 3-5 business days. Expedited shipping options are available for rush orders.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        Do you ship internationally?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Currently, we ship within the United States. For international orders, please contact our sales team to discuss options.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        What if my order is damaged or incorrect?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Contact us within 48 hours of delivery. We'll arrange a replacement or refund immediately. Photos of damaged items help expedite the process.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Product Information -->
                        <div style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                            <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px; color: #FF7A00; display: flex; align-items: center; gap: 12px;">
                                <i class="fas fa-box"></i> Product Information
                            </h2>
                            <div style="display: grid; gap: 20px;">
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        Are your products FDA approved?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>All medical-grade gloves are FDA 510(k) cleared. Product pages clearly indicate FDA status, ASTM certifications, and other compliance information. Certificates are available for download on each product page.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        Can I get product samples?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Yes! Contact your dedicated account representative or submit a request through our contact form. Samples are typically available for B2B customers evaluating products.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        How do I know which glove is right for my application?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Use our AI Glove Advisor tool! Answer 5-7 questions about your use case, and we'll recommend specific SKUs with explanations. You can also filter products by industry, material, thickness, and certifications.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Account & B2B -->
                        <div style="background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                            <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px; color: #FF7A00; display: flex; align-items: center; gap: 12px;">
                                <i class="fas fa-user-tie"></i> Account & B2B
                            </h2>
                            <div style="display: grid; gap: 20px;">
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        How do I create a B2B account?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Click "Register" in the header and fill out the B2B registration form. Provide your business information, tax ID, and expected order volume. Our team reviews applications within 1-2 business days.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        What are the benefits of a B2B account?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>B2B accounts get bulk pricing, volume discounts, net terms, dedicated account representatives, order history tracking, and priority customer support.</p>
                                    </div>
                                </div>
                                <div class="faq-item">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111111; cursor: pointer;" onclick="toggleFAQ(this)">
                                        <i class="fas fa-chevron-down" style="margin-right: 8px; color: #FF7A00; transition: transform 0.3s;"></i>
                                        Can I track my orders?
                                    </h3>
                                    <div class="faq-answer" style="display: none; padding-left: 28px; color: #4B5563; line-height: 1.7;">
                                        <p>Yes! Log into your account and visit your dashboard to view order history, track shipments, download invoices, and manage your account settings.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); color: #ffffff; padding: 48px; border-radius: 16px; text-align: center; margin-top: 48px;">
                        <h2 style="font-size: 32px; font-weight: 700; margin-bottom: 16px;">Still Have Questions?</h2>
                        <p style="font-size: 18px; opacity: 0.95; margin-bottom: 32px;">Our team is here to help. Get in touch and we'll respond within 24 hours.</p>
                        <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-secondary btn-lg" onclick="navigate('contact')" style="background: #ffffff; color: #FF7A00; padding: 14px 32px; font-weight: 600;">
                                <i class="fas fa-envelope"></i> Contact Us
                            </button>
                            <button class="btn btn-outline btn-lg" onclick="navigate('b2b')" style="border: 2px solid #ffffff; color: #ffffff; padding: 14px 32px; font-weight: 600;">
                                <i class="fas fa-phone"></i> Call 1-800-GLOVECUBS
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function toggleFAQ(element) {
    const answer = element.nextElementSibling;
    const icon = element.querySelector('i');
    const isOpen = answer.style.display === 'block';
    
    // Close all other FAQs in the same section
    const section = element.closest('.faq-item').parentElement;
    section.querySelectorAll('.faq-answer').forEach(ans => {
        if (ans !== answer) {
            ans.style.display = 'none';
            ans.previousElementSibling.querySelector('i').style.transform = 'rotate(0deg)';
        }
    });
    
    // Toggle current FAQ
    answer.style.display = isOpen ? 'none' : 'block';
    icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ============================================
// AI GLOVE ADVISOR
// ============================================

let aiAdvisorState = {
    currentStep: 0,
    answers: {},
    recommendations: null
};

/** Build prefill from current product (for product page CTA). */
function getProductPrefill(product) {
    if (!product) return {};
    var prefill = {};
    var cat = (product.category || '').toLowerCase();
    if (cat.indexOf('disposable') !== -1) prefill.gloveType = 'disposable';
    else if (cat.indexOf('work') !== -1) prefill.gloveType = 'work';
    var nameDesc = ((product.name || '') + ' ' + (product.description || '') + ' ' + (product.useCase || '')).toLowerCase();
    if (nameDesc.indexOf('healthcare') !== -1 || nameDesc.indexOf('medical') !== -1 || nameDesc.indexOf('exam') !== -1) prefill.industry = 'healthcare';
    else if (nameDesc.indexOf('food') !== -1) prefill.industry = 'food';
    else if (nameDesc.indexOf('manufacturing') !== -1 || nameDesc.indexOf('industrial') !== -1) prefill.industry = 'manufacturing';
    else if (nameDesc.indexOf('automotive') !== -1 || nameDesc.indexOf('auto') !== -1) prefill.industry = 'automotive';
    else if (nameDesc.indexOf('janitorial') !== -1 || nameDesc.indexOf('cleaning') !== -1) prefill.industry = 'janitorial';
    if ((product.material || '').toLowerCase() === 'nitrile') prefill.allergies = 'yes';
    return prefill;
}

/** Build prefill from current shop filters (for shop page CTA). */
function getShopPrefill() {
    var prefill = {};
    var cat = state.filters && state.filters.category;
    if (cat === 'Disposable Gloves') prefill.gloveType = 'disposable';
    else if (cat === 'Work Gloves') prefill.gloveType = 'work';
    var materials = state.filters && state.filters.material;
    if (Array.isArray(materials) && materials.length === 1 && materials[0] === 'Nitrile') prefill.allergies = 'yes';
    return prefill;
}

/** Apply prefill to advisor state and set currentStep to first unanswered question. */
function applyAIAdvisorPrefill(prefill) {
    if (!prefill || typeof prefill !== 'object') return;
    var ids = aiQuestions.map(function(q) { return q.id; });
    for (var key in prefill) {
        if (prefill.hasOwnProperty(key) && ids.indexOf(key) !== -1) {
            var val = prefill[key];
            if (val !== undefined && val !== null && val !== '') aiAdvisorState.answers[key] = val;
        }
    }
    for (var i = 0; i < aiQuestions.length; i++) {
        if (aiAdvisorState.answers[aiQuestions[i].id] === undefined) {
            aiAdvisorState.currentStep = i;
            return;
        }
    }
    aiAdvisorState.currentStep = aiQuestions.length - 1;
}

const aiQuestions = [
    {
        id: 'gloveType',
        question: 'Do you need disposable gloves or reusable work gloves?',
        type: 'select',
        options: [
            { value: 'disposable', label: 'Disposable gloves', icon: 'fa-hand-paper', desc: 'Single-use for exam, food service, cleaning, light industrial' },
            { value: 'work', label: 'Reusable work gloves', icon: 'fa-hard-hat', desc: 'Reusable, cut-resistant, impact protection, heavy duty' },
            { value: 'both', label: 'Not sure — help me decide', icon: 'fa-question-circle', desc: 'Recommend based on my industry and application' }
        ]
    },
    {
        id: 'industry',
        question: 'What industry or application will these gloves be used for?',
        type: 'select',
        options: [
            { value: 'healthcare', label: 'Healthcare / Medical', icon: 'fa-hospital' },
            { value: 'food', label: 'Food Service / Processing', icon: 'fa-utensils' },
            { value: 'manufacturing', label: 'Manufacturing / Industrial', icon: 'fa-industry' },
            { value: 'automotive', label: 'Automotive', icon: 'fa-car' },
            { value: 'janitorial', label: 'Janitorial / Cleaning', icon: 'fa-broom' },
            { value: 'other', label: 'Other', icon: 'fa-question-circle' }
        ]
    },
    {
        id: 'environment',
        question: 'What will the gloves come in contact with?',
        type: 'multi-select',
        options: [
            { value: 'oils', label: 'Oils / Grease', icon: 'fa-tint' },
            { value: 'chemicals', label: 'Chemicals / Solvents', icon: 'fa-flask' },
            { value: 'food', label: 'Food Products', icon: 'fa-apple-alt' },
            { value: 'blood', label: 'Blood / Bodily Fluids', icon: 'fa-heartbeat' },
            { value: 'sharp', label: 'Sharp Objects / Cut Risk', icon: 'fa-cut' },
            { value: 'general', label: 'General Use / Light Duty', icon: 'fa-hand-paper' }
        ]
    },
    {
        id: 'duration',
        question: 'How long will gloves be worn per use?',
        type: 'select',
        options: [
            { value: 'short', label: 'Short-term (under 15 minutes)', icon: 'fa-clock' },
            { value: 'medium', label: 'Medium (15-60 minutes)', icon: 'fa-clock' },
            { value: 'long', label: 'Long-term (over 1 hour)', icon: 'fa-clock' }
        ]
    },
    {
        id: 'allergies',
        question: 'Any latex allergies or sensitivities?',
        type: 'select',
        options: [
            { value: 'yes', label: 'Yes, avoid latex', icon: 'fa-exclamation-triangle' },
            { value: 'no', label: 'No known allergies', icon: 'fa-check-circle' },
            { value: 'unknown', label: 'Not sure / Mixed users', icon: 'fa-question-circle' }
        ]
    },
    {
        id: 'compliance',
        question: 'What compliance standards are required?',
        type: 'multi-select',
        options: [
            { value: 'fda', label: 'FDA 510(k) / Medical Grade', icon: 'fa-certificate' },
            { value: 'food', label: 'FDA Food Contact Approved', icon: 'fa-certificate' },
            { value: 'ansi', label: 'ANSI Cut-Resistant (A2-A5)', icon: 'fa-shield-alt' },
            { value: 'astm', label: 'ASTM Standards', icon: 'fa-certificate' },
            { value: 'none', label: 'No specific compliance needed', icon: 'fa-check' }
        ]
    },
    {
        id: 'texture',
        question: 'Do you need textured/grippy gloves?',
        type: 'select',
        options: [
            { value: 'yes', label: 'Yes, textured for grip', icon: 'fa-hand-rock' },
            { value: 'no', label: 'No, smooth is fine', icon: 'fa-hand-paper' },
            { value: 'either', label: 'Either works', icon: 'fa-hand-paper' }
        ]
    },
    {
        id: 'budget',
        question: 'What\'s your priority?',
        type: 'select',
        options: [
            { value: 'quality', label: 'Maximum quality / durability', icon: 'fa-award' },
            { value: 'cost', label: 'Best value / cost-effective', icon: 'fa-dollar-sign' },
            { value: 'balance', label: 'Balance of quality and cost', icon: 'fa-balance-scale' }
        ]
    }
];

function renderAIAdvisor() {
    const mainContent = document.getElementById('mainContent');
    const isLoggedIn = state.user;
    
    if (!isLoggedIn) {
        mainContent.innerHTML = `
            <section class="contact-page" style="padding: 60px 0;">
                <div class="container">
                    <div style="max-width: 600px; margin: 0 auto; text-align: center;">
                        <div style="font-size: 64px; color: var(--primary); margin-bottom: 24px;">
                            <i class="fas fa-robot"></i>
                        </div>
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 16px;">AI Glove Advisor</h1>
                        <p style="font-size: 18px; color: var(--gray-600); margin-bottom: 32px;">Get personalized glove recommendations based on your specific needs. Login or create an account to get started.</p>
                        <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-lg" onclick="navigate('login')">
                                <i class="fas fa-sign-in-alt"></i> Login
                            </button>
                            <button class="btn btn-outline btn-lg" onclick="navigate('register')">
                                <i class="fas fa-user-plus"></i> Create Account
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        `;
        return;
    }

    var hadPrefill = !!(state.aiAdvisorPrefill);
    if (hadPrefill) {
        aiAdvisorState = { currentStep: 0, answers: {}, recommendations: null };
        applyAIAdvisorPrefill(state.aiAdvisorPrefill);
        state.aiAdvisorPrefill = null;
    }
    if (!hadPrefill && aiAdvisorState.currentStep === 0 && Object.keys(aiAdvisorState.answers).length === 0) {
        aiAdvisorState = { currentStep: 0, answers: {}, recommendations: null };
    }

    const currentQuestion = aiQuestions[aiAdvisorState.currentStep];
    const progress = ((aiAdvisorState.currentStep + 1) / aiQuestions.length) * 100;

    if (aiAdvisorState.recommendations) {
        renderAIRecommendations();
        return;
    }

    mainContent.innerHTML = `
        <section class="contact-page" style="padding: 60px 0;">
            <div class="container">
                <div style="max-width: 800px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 48px;">
                        <div style="font-size: 64px; color: var(--primary); margin-bottom: 16px;">
                            <i class="fas fa-robot"></i>
                        </div>
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 8px;">AI Glove Advisor</h1>
                        <p style="font-size: 16px; color: var(--gray-600);">Answer a few questions to get personalized glove recommendations</p>
                    </div>

                    <div style="background: var(--white); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 40px; margin-bottom: 24px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
                            <div>
                                <div style="font-size: 14px; color: var(--gray-600); margin-bottom: 4px;">Question ${aiAdvisorState.currentStep + 1} of ${aiQuestions.length}</div>
                                <div style="width: 300px; height: 8px; background: var(--gray-200); border-radius: 4px; overflow: hidden;">
                                    <div style="width: ${progress}%; height: 100%; background: var(--primary); transition: width 0.3s;"></div>
                                </div>
                            </div>
                        </div>

                        <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 32px; color: var(--secondary);">${currentQuestion.question}</h2>

                        <div id="aiQuestionOptions" style="display: grid; gap: 16px;">
                            ${renderQuestionOptions(currentQuestion)}
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between;">
                        <button class="btn btn-outline" onclick="aiAdvisorPrevious()" ${aiAdvisorState.currentStep === 0 ? 'disabled style="opacity: 0.5;"' : ''}>
                            <i class="fas fa-arrow-left"></i> Previous
                        </button>
                        <div style="font-size: 14px; color: var(--gray-600); display: flex; align-items: center;">
                            <i class="fas fa-shield-alt" style="color: var(--primary); margin-right: 8px;"></i>
                            Your answers are private and secure
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderQuestionOptions(question) {
    if (question.type === 'select') {
        return question.options.map(opt => `
            <button class="ai-option-btn" onclick="selectAIAnswer('${question.id}', '${opt.value}')" style="
                width: 100%;
                padding: 20px;
                text-align: left;
                background: var(--gray-100);
                border: 2px solid transparent;
                border-radius: var(--radius);
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 16px;
            " onmouseover="this.style.borderColor='var(--primary)'; this.style.background='var(--white)';" onmouseout="this.style.borderColor='transparent'; this.style.background='var(--gray-100)';">
                <div style="font-size: 32px; color: var(--primary); width: 48px; text-align: center;">
                    <i class="fas ${opt.icon}"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 16px; color: var(--secondary);">${opt.label}</div>
                    ${opt.desc ? `<div style="font-size: 13px; color: var(--gray-500); margin-top: 4px;">${opt.desc}</div>` : ''}
                </div>
                <i class="fas fa-chevron-right" style="color: var(--gray-400);"></i>
            </button>
        `).join('');
    } else if (question.type === 'multi-select') {
        return question.options.map(opt => `
            <label style="
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 20px;
                background: var(--gray-100);
                border: 2px solid transparent;
                border-radius: var(--radius);
                cursor: pointer;
                transition: all 0.2s;
            " onmouseover="this.style.borderColor='var(--primary)'; this.style.background='var(--white)';" onmouseout="this.style.borderColor='transparent'; this.style.background='var(--gray-100)';">
                <input type="checkbox" value="${opt.value}" style="width: 20px; height: 20px; cursor: pointer;" onchange="updateMultiSelect('${question.id}', this)">
                <div style="font-size: 24px; color: var(--primary); width: 32px; text-align: center;">
                    <i class="fas ${opt.icon}"></i>
                </div>
                <div style="flex: 1; font-weight: 600; font-size: 16px; color: var(--secondary);">${opt.label}</div>
            </label>
        `).join('') + `
            <div style="margin-top: 16px;">
                <button class="btn btn-primary" onclick="proceedMultiSelect('${question.id}')" style="width: 100%;" id="proceedBtn" disabled>
                    Continue
                </button>
            </div>
        `;
    }
    return '';
}

function selectAIAnswer(questionId, value) {
    aiAdvisorState.answers[questionId] = value;
    aiAdvisorState.currentStep++;
    
    if (aiAdvisorState.currentStep >= aiQuestions.length) {
        generateRecommendations();
    } else {
        renderAIAdvisor();
    }
}

function updateMultiSelect(questionId, checkbox) {
    if (!aiAdvisorState.answers[questionId]) {
        aiAdvisorState.answers[questionId] = [];
    }
    if (checkbox.checked) {
        if (!aiAdvisorState.answers[questionId].includes(checkbox.value)) {
            aiAdvisorState.answers[questionId].push(checkbox.value);
        }
    } else {
        aiAdvisorState.answers[questionId] = aiAdvisorState.answers[questionId].filter(v => v !== checkbox.value);
    }
    
    // Enable/disable proceed button
    const proceedBtn = document.getElementById('proceedBtn');
    if (proceedBtn) {
        proceedBtn.disabled = aiAdvisorState.answers[questionId].length === 0;
        if (aiAdvisorState.answers[questionId].length > 0) {
            proceedBtn.style.opacity = '1';
        } else {
            proceedBtn.style.opacity = '0.5';
        }
    }
}

function proceedMultiSelect(questionId) {
    if (aiAdvisorState.answers[questionId] && aiAdvisorState.answers[questionId].length > 0) {
        aiAdvisorState.currentStep++;
        if (aiAdvisorState.currentStep >= aiQuestions.length) {
            generateRecommendations();
        } else {
            renderAIAdvisor();
        }
    }
}

function aiAdvisorPrevious() {
    if (aiAdvisorState.currentStep > 0) {
        aiAdvisorState.currentStep--;
        renderAIAdvisor();
    }
}

async function generateRecommendations() {
    try {
        // Get all products
        const products = await api.get('/api/products');
        
        if (!products || !Array.isArray(products) || products.length === 0) {
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <section class="contact-page" style="padding: 60px 0;">
                    <div class="container">
                        <div style="max-width: 600px; margin: 0 auto; text-align: center;">
                            <div style="font-size: 64px; color: var(--danger); margin-bottom: 24px;">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 16px;">Unable to Load Products</h1>
                            <p style="font-size: 18px; color: var(--gray-600); margin-bottom: 32px;">There was an error loading products. Please try again.</p>
                            <button class="btn btn-primary btn-lg" onclick="aiAdvisorState = {currentStep: 0, answers: {}, recommendations: null}; renderAIAdvisor();">
                                <i class="fas fa-redo"></i> Try Again
                            </button>
                        </div>
                    </div>
                </section>
            `;
            return;
        }
        
        // Rule-based recommendation engine
        const recommendations = [];
        const warnings = [];
        let explanation = '';

    const gloveType = aiAdvisorState.answers.gloveType;
    const industry = aiAdvisorState.answers.industry;
    const environment = Array.isArray(aiAdvisorState.answers.environment) ? aiAdvisorState.answers.environment : (aiAdvisorState.answers.environment ? [aiAdvisorState.answers.environment] : []);
    const allergies = aiAdvisorState.answers.allergies;
    const compliance = Array.isArray(aiAdvisorState.answers.compliance) ? aiAdvisorState.answers.compliance : (aiAdvisorState.answers.compliance ? [aiAdvisorState.answers.compliance] : []);
    const texture = aiAdvisorState.answers.texture;
    const budget = aiAdvisorState.answers.budget;

    // Filter products based on answers - use scoring instead of strict filtering
    let filteredProducts = products.map(product => {
        const nameDesc = (product.name + ' ' + (product.description || '') + ' ' + (product.useCase || '')).toLowerCase();
        const certs = (product.certifications || '').toLowerCase();
        let score = 0;
        
        // Industry match - check useCase, description, or category
        if (industry === 'healthcare') {
            const isHealthcare = nameDesc.includes('healthcare') || nameDesc.includes('medical') || 
                                nameDesc.includes('exam') || nameDesc.includes('hospital') ||
                                (product.useCase && product.useCase.toLowerCase().includes('healthcare'));
            if (isHealthcare) score += 10;
            if (product.category === 'Work Gloves' && !isHealthcare) score -= 5;
        }
        if (industry === 'food') {
            const isFood = nameDesc.includes('food') || nameDesc.includes('food service') ||
                          (product.useCase && product.useCase.toLowerCase().includes('food'));
            if (isFood) score += 10;
            if (product.category === 'Work Gloves' && !isFood) score -= 5;
        }
        if (industry === 'manufacturing') {
            const isManufacturing = nameDesc.includes('manufacturing') || nameDesc.includes('industrial') ||
                                   (product.useCase && product.useCase.toLowerCase().includes('manufacturing'));
            if (isManufacturing) score += 10;
            if (product.category === 'Disposable Gloves' && !nameDesc.includes('industrial') && !isManufacturing) score -= 3;
        }
        if (industry === 'automotive') {
            const isAutomotive = nameDesc.includes('automotive') || nameDesc.includes('auto') ||
                                (product.useCase && product.useCase.toLowerCase().includes('automotive'));
            if (isAutomotive) score += 10;
            if (product.category === 'Work Gloves' && !isAutomotive) score -= 3;
        }
        if (industry === 'janitorial') {
            const isJanitorial = nameDesc.includes('janitorial') || nameDesc.includes('cleaning') ||
                               (product.useCase && product.useCase.toLowerCase().includes('janitorial'));
            if (isJanitorial) score += 10;
            if (product.category === 'Work Gloves' && !isJanitorial) score -= 3;
        }
        
        // Allergy check - strict filter
        if (allergies === 'yes' && product.material === 'Latex') return null;
        if (allergies === 'unknown' && product.material === 'Latex') {
            if (!warnings.includes('⚠️ Latex detected. Consider nitrile if allergies are a concern.')) {
                warnings.push('⚠️ Latex detected. Consider nitrile if allergies are a concern.');
            }
        }

        // Compliance check - be more lenient, check description too
        if (compliance.includes('fda')) {
            const hasFDA = certs.includes('fda') || nameDesc.includes('fda') || nameDesc.includes('medical grade') || 
                          nameDesc.includes('exam grade') || product.grade?.toLowerCase().includes('medical');
            if (hasFDA) score += 5;
            if (!hasFDA && product.category === 'Disposable Gloves') score -= 3;
        }
        if (compliance.includes('food')) {
            const hasFoodCompliance = certs.includes('food') || nameDesc.includes('food safe') || 
                                     nameDesc.includes('food service') || nameDesc.includes('fda');
            if (hasFoodCompliance) score += 5;
            if (!hasFoodCompliance && industry === 'food') score -= 3;
        }
        if (compliance.includes('ansi')) {
            const hasANSI = certs.includes('ansi') || nameDesc.includes('ansi') || nameDesc.includes('cut resistant') ||
                           nameDesc.includes('cut-resistant');
            if (hasANSI) score += 5;
            if (!hasANSI && product.category === 'Work Gloves') score -= 3;
        }

        // Environment checks - strict filters for safety
        if (environment.includes('oils') && product.material === 'Vinyl') {
            if (!warnings.includes('⚠️ Vinyl gloves will tear with oils. Use nitrile instead.')) {
                warnings.push('⚠️ Vinyl gloves will tear with oils. Use nitrile instead.');
            }
            return null; // Exclude vinyl for oils
        }
        if (environment.includes('chemicals') && product.material === 'Vinyl') return null;
        if (environment.includes('food') && product.material === 'Latex' && allergies !== 'no') return null;

        // Texture preference
        if (texture === 'yes') {
            if (nameDesc.includes('textured') || nameDesc.includes('grip')) score += 5;
        }

        return { product, score };
    }).filter(item => item !== null); // Remove null items (filtered out)

    // Extract products and add budget/material scoring
    filteredProducts = filteredProducts.map(({ product, score }) => {
        // Budget priority
        if (budget === 'cost') {
            score -= product.price; // Lower price = higher score
        } else if (budget === 'quality') {
            score += product.price; // Higher price = higher score
        }

        // Material preference
        if (industry === 'healthcare' || environment.includes('blood')) {
            if (product.material === 'Nitrile') score += 10;
        }
        if (industry === 'food' && product.material === 'Nitrile') score += 5;
        if (industry === 'automotive' && product.material === 'Nitrile') score += 5;

        return { product, score };
    });

    // Sort by score (highest first)
    filteredProducts.sort((a, b) => b.score - a.score);
    
    // Extract just the products
    filteredProducts = filteredProducts.map(({ product }) => product);

    // Generate explanation (glove type + industry/application)
    const typeLabel = gloveType === 'disposable' ? 'disposable' : gloveType === 'work' ? 'work' : 'disposable and work';
    if (industry === 'food' && environment.includes('oils')) {
        explanation = 'For ' + typeLabel + ' gloves in food processing with oils → 6-mil nitrile, textured fingers, FDA compliant. Vinyl will tear and fail audits.';
    } else if (industry === 'healthcare') {
        explanation = 'For ' + typeLabel + ' gloves in healthcare, nitrile provides the best balance of protection, durability, and latex-free safety.';
    } else if (industry === 'manufacturing' || industry === 'automotive') {
        explanation = 'Based on your industry and application, these ' + typeLabel + ' options match your needs for durability and performance.';
    } else if (budget === 'cost') {
        explanation = 'For cost-effective ' + typeLabel + ' gloves, consider vinyl for light-duty or thinner nitrile for better value.';
    } else {
        explanation = 'Based on your glove type, industry, and application, these options are the best match for your needs.';
    }

    // Add warnings
    if (environment.includes('food') && !compliance.includes('food')) {
        warnings.push('⚠️ Food contact requires FDA Food Contact approval. Make sure your selected gloves are compliant.');
    }

    // If no products match, show top products from the chosen glove type (or all)
    if (filteredProducts.length === 0) {
        warnings.push('⚠️ No products matched all your criteria exactly. Showing best alternatives below.');
        const candidateProducts = (gloveType === 'work' ? products.filter(p => p.category === 'Work Gloves') : gloveType === 'disposable' ? products.filter(p => p.category === 'Disposable Gloves') : products);
        filteredProducts = candidateProducts.slice(0, 10);
        if (filteredProducts.length === 0) filteredProducts = products.slice(0, 10);
    }

        aiAdvisorState.recommendations = {
            products: filteredProducts.slice(0, 5),
            explanation,
            warnings
        };

        renderAIRecommendations();
    } catch (error) {
        console.error('Error generating recommendations:', error);
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <section class="contact-page" style="padding: 60px 0;">
                <div class="container">
                    <div style="max-width: 600px; margin: 0 auto; text-align: center;">
                        <div style="font-size: 64px; color: var(--danger); margin-bottom: 24px;">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 16px;">Error Loading Recommendations</h1>
                        <p style="font-size: 18px; color: var(--gray-600); margin-bottom: 32px;">${error.message || 'An error occurred while generating recommendations.'}</p>
                        <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-lg" onclick="aiAdvisorState = {currentStep: 0, answers: {}, recommendations: null}; renderAIAdvisor();">
                                <i class="fas fa-redo"></i> Try Again
                            </button>
                            <button class="btn btn-outline btn-lg" onclick="navigate('products')">
                                <i class="fas fa-shopping-bag"></i> Browse Products
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }
}

function renderAIRecommendations() {
    const mainContent = document.getElementById('mainContent');
    const rec = aiAdvisorState.recommendations;

    mainContent.innerHTML = `
        <section class="contact-page" style="padding: 60px 0;">
            <div class="container">
                <div style="max-width: 1000px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 48px;">
                        <div style="font-size: 64px; color: var(--success); margin-bottom: 16px;">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 8px;">Your Personalized Recommendations</h1>
                        <p style="font-size: 16px; color: var(--gray-600);">Based on your answers, here are the best glove options for your needs</p>
                    </div>

                    ${rec.warnings.length > 0 ? `
                        <div style="background: var(--warning); color: var(--white); padding: 20px; border-radius: var(--radius-lg); margin-bottom: 32px;">
                            <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">
                                <i class="fas fa-exclamation-triangle"></i> Important Warnings
                            </h3>
                            <ul style="margin: 0; padding-left: 24px;">
                                ${rec.warnings.map(w => `<li style="margin-bottom: 8px;">${w}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    <div style="background: var(--primary); color: var(--white); padding: 32px; border-radius: var(--radius-lg); margin-bottom: 32px;">
                        <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">
                            <i class="fas fa-lightbulb"></i> Why These Gloves?
                        </h3>
                        <p style="font-size: 16px; line-height: 1.7; opacity: 0.95;">${rec.explanation}</p>
                    </div>

                    <div style="margin-bottom: 32px;">
                        <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 24px;">Recommended Products</h2>
                        ${rec.products && rec.products.length > 0 ? `
                            <div class="products-grid">
                                ${rec.products.map(product => {
                                    try {
                                        return renderProductCard(product);
                                    } catch (error) {
                                        console.error('Error rendering product card:', error, product);
                                        return `<div class="product-card" style="padding: 20px; text-align: center;">
                                            <h3>${product.name || 'Product'}</h3>
                                            <p>SKU: ${product.sku || 'N/A'}</p>
                                            <p>$${product.price || 0}</p>
                                        </div>`;
                                    }
                                }).join('')}
                            </div>
                        ` : `
                            <div style="text-align: center; padding: 40px; background: var(--gray-100); border-radius: var(--radius-lg);">
                                <p style="font-size: 18px; color: var(--gray-600); margin-bottom: 16px;">No products matched your exact criteria.</p>
                                <button class="btn btn-primary" onclick="navigate('products')">
                                    <i class="fas fa-shopping-bag"></i> Browse All Products
                                </button>
                            </div>
                        `}
                    </div>

                    <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-primary btn-lg" onclick="aiAdvisorState = {currentStep: 0, answers: {}, recommendations: null}; renderAIAdvisor();">
                            <i class="fas fa-redo"></i> Start Over
                        </button>
                        <button class="btn btn-outline btn-lg" onclick="navigate('products')">
                            <i class="fas fa-shopping-bag"></i> View All Products
                        </button>
                    </div>
                </div>
            </div>
        </section>
    `;
}

// ============================================
// COST TRANSPARENCY & SPEND CONTROL
// ============================================

async function renderCostAnalysis() {
    const mainContent = document.getElementById('mainContent');
    const isLoggedIn = state.user;
    
    if (!isLoggedIn) {
        mainContent.innerHTML = `
            <section class="contact-page" style="padding: 60px 0;">
                <div class="container">
                    <div style="max-width: 600px; margin: 0 auto; text-align: center;">
                        <div style="font-size: 64px; color: var(--primary); margin-bottom: 24px;">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 16px;">Cost Analysis & Spend Control</h1>
                        <p style="font-size: 18px; color: var(--gray-600); margin-bottom: 32px;">Analyze your glove spending and discover optimization opportunities. Login to access your cost analysis.</p>
                        <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-lg" onclick="navigate('login')">
                                <i class="fas fa-sign-in-alt"></i> Login
                            </button>
                            <button class="btn btn-outline btn-lg" onclick="navigate('register')">
                                <i class="fas fa-user-plus"></i> Create Account
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        `;
        return;
    }

    // Get order history and uploaded invoices
    let orders = [];
    let invoices = [];
    try {
        orders = await api.get('/api/orders');
    } catch (e) {
        // No orders yet
    }
    try {
        invoices = await api.get('/api/invoices');
    } catch (e) {
        // No invoices yet
    }

    // Calculate analytics (orders + uploaded invoices)
    const analytics = calculateSpendAnalytics(orders, invoices);
    const optimizations = generateOptimizations(orders);

    mainContent.innerHTML = `
        <section class="contact-page" style="padding: 60px 0;">
            <div class="container">
                <div style="max-width: 1200px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 48px;">
                        <div style="font-size: 64px; color: var(--primary); margin-bottom: 16px;">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 8px;">Cost Analysis & Spend Control</h1>
                        <p style="font-size: 16px; color: var(--gray-600);">Analyze your glove spending and discover optimization opportunities</p>
                    </div>

                    <!-- Upload Invoice -->
                    <div style="background: var(--white); padding: 24px; border-radius: var(--radius-lg); box-shadow: var(--shadow); margin-bottom: 32px;">
                        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;"><i class="fas fa-file-invoice"></i> Add Invoice (for spend tracking)</h2>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 12px; align-items: end; flex-wrap: wrap;">
                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px;">Vendor</label>
                                <input type="text" id="invoiceVendor" placeholder="Vendor name" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px;">Date</label>
                                <input type="date" id="invoiceDate" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px;">Total amount ($)</label>
                                <input type="number" id="invoiceTotal" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px;">
                            </div>
                            <button type="button" class="btn btn-primary" onclick="submitCostAnalysisInvoice()" style="padding: 10px 20px;">
                                <i class="fas fa-plus"></i> Add
                            </button>
                        </div>
                        ${invoices.length > 0 ? `
                            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                                <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Uploaded invoices</div>
                                <ul style="list-style: none; padding: 0; margin: 0;">
                                    ${invoices.map(inv => `
                                        <li style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                            <span>${(inv.vendor || 'Unknown').replace(/</g, '&lt;')} – ${inv.invoice_date || ''} – $${Number(inv.total_amount).toLocaleString()}</span>
                                            <button type="button" onclick="deleteCostAnalysisInvoice(${inv.id}); return false;" style="background: none; border: none; color: #dc2626; cursor: pointer; padding: 4px 8px;" title="Remove"><i class="fas fa-trash-alt"></i></button>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>

                    ${orders.length === 0 && invoices.length === 0 ? `
                        <div style="background: var(--gray-100); padding: 60px; border-radius: var(--radius-lg); text-align: center;">
                            <div style="font-size: 48px; color: var(--gray-400); margin-bottom: 16px;">
                                <i class="fas fa-chart-bar"></i>
                            </div>
                            <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 12px; color: var(--secondary);">No Order or Invoice History Yet</h2>
                            <p style="color: var(--gray-600); margin-bottom: 24px;">Place orders or add invoices above to see your spend analysis and optimization tips.</p>
                            <button class="btn btn-primary" onclick="navigate('products')">
                                <i class="fas fa-shopping-bag"></i> Start Shopping
                            </button>
                        </div>
                    ` : `
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-bottom: 32px;">
                            <div style="background: var(--white); padding: 24px; border-radius: var(--radius-lg); box-shadow: var(--shadow); text-align: center; border-top: 4px solid var(--primary);">
                                <div style="font-size: 32px; font-weight: 700; color: var(--secondary); margin-bottom: 8px;">$${analytics.totalSpend.toLocaleString()}</div>
                                <div style="font-size: 14px; color: var(--gray-600);">Total Spend</div>
                            </div>
                            <div style="background: var(--white); padding: 24px; border-radius: var(--radius-lg); box-shadow: var(--shadow); text-align: center; border-top: 4px solid var(--success);">
                                <div style="font-size: 32px; font-weight: 700; color: var(--secondary); margin-bottom: 8px;">${analytics.totalGloves.toLocaleString()}</div>
                                <div style="font-size: 14px; color: var(--gray-600);">Total Gloves</div>
                            </div>
                            <div style="background: var(--white); padding: 24px; border-radius: var(--radius-lg); box-shadow: var(--shadow); text-align: center; border-top: 4px solid var(--info);">
                                <div style="font-size: 32px; font-weight: 700; color: var(--secondary); margin-bottom: 8px;">$${analytics.avgCostPerGlove.toFixed(3)}</div>
                                <div style="font-size: 14px; color: var(--gray-600);">Avg Cost/Glove</div>
                            </div>
                            <div style="background: var(--white); padding: 24px; border-radius: var(--radius-lg); box-shadow: var(--shadow); text-align: center; border-top: 4px solid var(--warning);">
                                <div style="font-size: 32px; font-weight: 700; color: var(--secondary); margin-bottom: 8px;">$${analytics.potentialSavings.toLocaleString()}</div>
                                <div style="font-size: 14px; color: var(--gray-600);">Potential Savings</div>
                            </div>
                        </div>

                        ${optimizations.length > 0 ? `
                            <div style="background: var(--success); color: var(--white); padding: 32px; border-radius: var(--radius-lg); margin-bottom: 32px;">
                                <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">
                                    <i class="fas fa-lightbulb"></i> Optimization Opportunities
                                </h2>
                                <div style="display: grid; gap: 16px;">
                                    ${optimizations.map(opt => `
                                        <div style="background: rgba(255,255,255,0.15); padding: 20px; border-radius: var(--radius); backdrop-filter: blur(10px);">
                                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                                                <h3 style="font-size: 18px; font-weight: 600;">${opt.title}</h3>
                                                <div style="font-size: 24px; font-weight: 700; color: var(--white);">$${opt.savings.toLocaleString()}/year</div>
                                            </div>
                                            <p style="opacity: 0.95; line-height: 1.6; margin-bottom: 12px;">${opt.description}</p>
                                            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                                                ${opt.actions.map(action => `
                                                    <button class="btn btn-secondary" onclick="${action.onclick}" style="background: var(--white); color: var(--success); font-size: 14px; padding: 8px 16px;">
                                                        ${action.label}
                                                    </button>
                                                `).join('')}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <div style="background: var(--white); padding: 32px; border-radius: var(--radius-lg); box-shadow: var(--shadow);">
                            <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 24px;">Spend Breakdown by Category</h2>
                            <div style="display: grid; gap: 16px;">
                                ${analytics.categoryBreakdown.map(cat => `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--gray-100); border-radius: var(--radius);">
                                        <div>
                                            <div style="font-weight: 600; color: var(--secondary); margin-bottom: 4px;">${cat.category}</div>
                                            <div style="font-size: 14px; color: var(--gray-600);">${cat.count} orders • ${cat.gloves} gloves</div>
                                        </div>
                                        <div style="text-align: right;">
                                            <div style="font-size: 20px; font-weight: 700; color: var(--primary);">$${cat.total.toLocaleString()}</div>
                                            <div style="font-size: 12px; color: var(--gray-600);">$${cat.avgPerGlove.toFixed(3)}/glove</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `}
                </div>
            </div>
        </section>
    `;
}

function calculateSpendAnalytics(orders, invoices = []) {
    let totalSpend = 0;
    let totalGloves = 0;
    const categoryBreakdown = {};

    (orders || []).forEach(order => {
        (order.items || []).forEach(item => {
            totalSpend += item.price * item.quantity;
            totalGloves += item.quantity;
            const category = item.category || 'Other';
            if (!categoryBreakdown[category]) {
                categoryBreakdown[category] = { total: 0, count: 0, gloves: 0 };
            }
            categoryBreakdown[category].total += item.price * item.quantity;
            categoryBreakdown[category].count += 1;
            categoryBreakdown[category].gloves += item.quantity;
        });
    });

    let invoiceTotal = 0;
    (invoices || []).forEach(inv => {
        invoiceTotal += Number(inv.total_amount) || 0;
    });
    totalSpend += invoiceTotal;
    if (invoiceTotal > 0) {
        categoryBreakdown['Uploaded invoices'] = { total: invoiceTotal, count: invoices.length, gloves: 0 };
    }

    const breakdown = Object.entries(categoryBreakdown).map(([category, data]) => ({
        category,
        total: data.total,
        count: data.count,
        gloves: data.gloves,
        avgPerGlove: data.gloves > 0 ? data.total / data.gloves : 0
    })).sort((a, b) => b.total - a.total);

    return {
        totalSpend,
        totalGloves,
        avgCostPerGlove: totalGloves > 0 ? totalSpend / totalGloves : 0,
        categoryBreakdown: breakdown,
        potentialSavings: totalSpend * 0.15
    };
}

async function submitCostAnalysisInvoice() {
    const vendor = document.getElementById('invoiceVendor')?.value?.trim() || '';
    const invoiceDate = document.getElementById('invoiceDate')?.value || new Date().toISOString().split('T')[0];
    const total = document.getElementById('invoiceTotal')?.value;
    if (!total || isNaN(parseFloat(total)) || parseFloat(total) <= 0) {
        showToast('Please enter a valid total amount.', 'error');
        return;
    }
    try {
        await api.post('/api/invoices', { vendor: vendor || 'Unknown', invoice_date: invoiceDate, total_amount: parseFloat(total) });
        showToast('Invoice added.');
        renderCostAnalysis();
    } catch (e) {
        showToast(e.message || 'Failed to add invoice.', 'error');
    }
}

async function deleteCostAnalysisInvoice(id) {
    try {
        await api.delete('/api/invoices/' + id);
        showToast('Invoice removed.');
        renderCostAnalysis();
    } catch (e) {
        showToast(e.message || 'Failed to remove.', 'error');
    }
}

function generateOptimizations(orders) {
    const optimizations = [];
    
    // Analyze for over-spec'ing
    const highEndUsage = orders.flatMap(o => o.items).filter(item => 
        item.material === 'Nitrile' && item.price > 0.15
    );
    
    if (highEndUsage.length > 0) {
        optimizations.push({
            title: 'Over-Spec\'ing on Premium Gloves',
            description: `You're using 8-mil premium nitrile gloves for ${highEndUsage.length} tasks. A 5-mil nitrile meets the same requirements and saves 22% per glove.`,
            savings: Math.round(highEndUsage.reduce((sum, item) => sum + (item.price * item.quantity * 0.22), 0)),
            actions: [
                { label: 'View Alternatives', onclick: "filterByMaterial('Nitrile'); navigate('products');" }
            ]
        });
    }

    // Check for janitorial tasks using expensive gloves
    const janitorialExpensive = orders.flatMap(o => o.items).filter(item =>
        item.category === 'Janitorial' && item.price > 0.10
    );

    if (janitorialExpensive.length > 0) {
        optimizations.push({
            title: 'Switch Janitorial Tasks to Economy Options',
            description: 'You\'re using premium gloves for janitorial tasks. Vinyl or thinner nitrile options can reduce costs by 30-40% without sacrificing performance.',
            savings: Math.round(janitorialExpensive.reduce((sum, item) => sum + (item.price * item.quantity * 0.35), 0)),
            actions: [
                { label: 'View Economy Options', onclick: "filterByCategory('Disposable Gloves'); navigate('products');" }
            ]
        });
    }

    return optimizations;
}

// ============================================
// ADMIN PANEL
// ============================================

function renderAdminPanel(activeTab = 'orders') {
    const mainContent = document.getElementById('mainContent');
    const isLoggedIn = state.user?.is_approved;
    
    if (!isLoggedIn) {
        mainContent.innerHTML = `
            <section class="contact-page" style="padding: 60px 0;">
                <div class="container">
                    <div style="max-width: 600px; margin: 0 auto; text-align: center;">
                        <div style="font-size: 64px; color: #FF7A00; margin-bottom: 24px;">
                            <i class="fas fa-lock"></i>
                        </div>
                        <h1 style="font-size: 36px; font-weight: 700; margin-bottom: 16px;">Admin Access Required</h1>
                        <p style="font-size: 18px; color: #4B5563; margin-bottom: 32px;">Please login with an approved account to access the admin panel.</p>
                        <button class="btn btn-primary btn-lg" onclick="navigate('login')" style="background: #FF7A00; border: none; padding: 14px 32px; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-sign-in-alt"></i> Login
                        </button>
                    </div>
                </div>
            </section>
        `;
        return;
    }
    
    // Store active tab in state
    state.adminTab = activeTab;
    
    mainContent.innerHTML = `
        <section style="padding: 40px 0; background: #f5f5f5; min-height: calc(100vh - 200px);">
            <div class="container">
                <div style="max-width: 1400px; margin: 0 auto;">
                    <div style="background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #FF7A00 0%, rgba(255,122,0,0.85) 100%); padding: 32px; color: #ffffff;">
                            <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">
                                <i class="fas fa-shield-alt" style="margin-right: 12px;"></i>Admin Dashboard
                            </h1>
                            <p style="opacity: 0.9; font-size: 15px;">Manage orders, RFQs, users, and products</p>
                        </div>
                        
                        <!-- Tabs -->
                        <div style="display: flex; border-bottom: 2px solid #e0e0e0; background: #fafafa;">
                            <button onclick="renderAdminPanel('orders')" class="admin-tab ${activeTab === 'orders' ? 'active' : ''}" style="flex: 1; padding: 20px; background: ${activeTab === 'orders' ? '#ffffff' : 'transparent'}; border: none; border-bottom: 3px solid ${activeTab === 'orders' ? '#FF7A00' : 'transparent'}; cursor: pointer; font-size: 15px; font-weight: 600; color: ${activeTab === 'orders' ? '#FF7A00' : '#6B7280'}; transition: all 0.3s ease;">
                                <i class="fas fa-shopping-cart" style="margin-right: 8px;"></i>Orders
                            </button>
                            <button onclick="renderAdminPanel('rfqs')" class="admin-tab ${activeTab === 'rfqs' ? 'active' : ''}" style="flex: 1; padding: 20px; background: ${activeTab === 'rfqs' ? '#ffffff' : 'transparent'}; border: none; border-bottom: 3px solid ${activeTab === 'rfqs' ? '#FF7A00' : 'transparent'}; cursor: pointer; font-size: 15px; font-weight: 600; color: ${activeTab === 'rfqs' ? '#FF7A00' : '#6B7280'}; transition: all 0.3s ease;">
                                <i class="fas fa-file-invoice-dollar" style="margin-right: 8px;"></i>RFQs
                            </button>
                            <button onclick="renderAdminPanel('users')" class="admin-tab ${activeTab === 'users' ? 'active' : ''}" style="flex: 1; padding: 20px; background: ${activeTab === 'users' ? '#ffffff' : 'transparent'}; border: none; border-bottom: 3px solid ${activeTab === 'users' ? '#FF7A00' : 'transparent'}; cursor: pointer; font-size: 15px; font-weight: 600; color: ${activeTab === 'users' ? '#FF7A00' : '#6B7280'}; transition: all 0.3s ease;">
                                <i class="fas fa-users" style="margin-right: 8px;"></i>Users
                            </button>
                            <button onclick="renderAdminPanel('products')" class="admin-tab ${activeTab === 'products' ? 'active' : ''}" style="flex: 1; padding: 20px; background: ${activeTab === 'products' ? '#ffffff' : 'transparent'}; border: none; border-bottom: 3px solid ${activeTab === 'products' ? '#FF7A00' : 'transparent'}; cursor: pointer; font-size: 15px; font-weight: 600; color: ${activeTab === 'products' ? '#FF7A00' : '#6B7280'}; transition: all 0.3s ease;">
                                <i class="fas fa-box" style="margin-right: 8px;"></i>Products
                            </button>
                            <button onclick="renderAdminPanel('messages')" class="admin-tab ${activeTab === 'messages' ? 'active' : ''}" style="flex: 1; padding: 20px; background: ${activeTab === 'messages' ? '#ffffff' : 'transparent'}; border: none; border-bottom: 3px solid ${activeTab === 'messages' ? '#FF7A00' : 'transparent'}; cursor: pointer; font-size: 15px; font-weight: 600; color: ${activeTab === 'messages' ? '#FF7A00' : '#6B7280'}; transition: all 0.3s ease;">
                                <i class="fas fa-envelope" style="margin-right: 8px;"></i>Messages
                            </button>
                            <button onclick="renderAdminPanel('customers')" class="admin-tab ${activeTab === 'customers' ? 'active' : ''}" style="flex: 1; padding: 20px; background: ${activeTab === 'customers' ? '#ffffff' : 'transparent'}; border: none; border-bottom: 3px solid ${activeTab === 'customers' ? '#FF7A00' : 'transparent'}; cursor: pointer; font-size: 15px; font-weight: 600; color: ${activeTab === 'customers' ? '#FF7A00' : '#6B7280'}; transition: all 0.3s ease;">
                                <i class="fas fa-building" style="margin-right: 8px;"></i>Customers
                            </button>
                        </div>
                        
                        <!-- Tab Content -->
                        <div id="adminTabContent" style="padding: 32px;">
                            ${activeTab === 'orders' ? '<div id="adminOrdersContent">Loading orders...</div>' : ''}
                            ${activeTab === 'rfqs' ? '<div id="adminRFQsContent">Loading RFQs...</div>' : ''}
                            ${activeTab === 'users' ? '<div id="adminUsersContent">Loading users...</div>' : ''}
                            ${activeTab === 'products' ? '<div id="adminProductsContent">Loading products...</div>' : ''}
                            ${activeTab === 'messages' ? '<div id="adminMessagesContent">Loading messages...</div>' : ''}
                            ${activeTab === 'customers' ? '<div id="adminCustomersContent">Loading customers...</div>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
    
    // Load data for active tab
    if (activeTab === 'orders') {
        loadAdminOrders();
    } else if (activeTab === 'rfqs') {
        loadAdminRFQs();
    } else if (activeTab === 'users') {
        loadAdminUsers();
    } else if (activeTab === 'products') {
        loadAdminProducts();
    } else if (activeTab === 'messages') {
        loadAdminContactMessages();
    } else if (activeTab === 'customers') {
        if (state.adminCustomerId) loadAdminCustomerDetail(state.adminCustomerId);
        else loadAdminCustomersList();
    }
}

async function loadAdminContactMessages() {
    const el = document.getElementById('adminMessagesContent');
    if (!el) return;
    try {
        const messages = await api.get('/api/admin/contact-messages');
        if (messages.length === 0) {
            el.innerHTML = '<p style="color: #6B7280;">No contact form submissions yet.</p>';
            return;
        }
        el.innerHTML = `
            <div style="display: grid; gap: 20px;">
                ${messages.map(m => `
                    <div style="background: #f9fafb; padding: 20px; border-radius: 12px; border-left: 4px solid #FF7A00;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div>
                                <strong>${(m.name || '').replace(/</g, '&lt;')}</strong>
                                ${m.company ? ' · ' + (m.company || '').replace(/</g, '&lt;') : ''}
                            </div>
                            <span style="font-size: 13px; color: #6B7280;">${(m.created_at || '').replace('T', ' ').slice(0, 19)}</span>
                        </div>
                        <div style="font-size: 14px; color: #374151;"><a href="mailto:${(m.email || '').replace(/"/g, '&quot;')}">${(m.email || '').replace(/</g, '&lt;')}</a></div>
                        <p style="margin: 12px 0 0; white-space: pre-wrap; color: #4B5563;">${(m.message || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        el.innerHTML = '<p style="color: #dc2626;">Failed to load messages. ' + (e.message || '') + '</p>';
    }
}

async function loadAdminCustomersList() {
    const el = document.getElementById('adminCustomersContent');
    if (!el) return;
    state.adminCustomerId = null;
    try {
        const companies = await api.get('/api/admin/companies');
        if (!companies.length) {
            el.innerHTML = '<p style="color: #6B7280;">No companies yet. Companies are seeded from user company names.</p>';
            return;
        }
        el.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 20px; font-weight: 600; color: #111; margin-bottom: 16px;">Customer pricing</h2>
                <p style="color: #6B7280; font-size: 14px;">Click a company to set default margin and manufacturer-specific overrides. Sell price = cost / (1 − margin/100).</p>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e7eb;">
                            <th style="text-align: left; padding: 12px; font-weight: 600;">Company</th>
                            <th style="text-align: left; padding: 12px; font-weight: 600;">Default margin %</th>
                            <th style="text-align: left; padding: 12px; font-weight: 600;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${companies.map(function(c) {
                            const margin = c.default_gross_margin_percent != null ? c.default_gross_margin_percent : '—';
                            const name = (c.name || '').replace(/</g, '&lt;');
                            return '<tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 12px;">' + name + '</td><td style="padding: 12px;">' + margin + '</td><td style="padding: 12px;"><button type="button" class="btn btn-primary" style="padding: 8px 16px; font-size: 13px;" onclick="state.adminCustomerId = ' + c.id + '; loadAdminCustomerDetail(' + c.id + ');">Edit pricing</button></td></tr>';
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        el.innerHTML = '<p style="color: #dc2626;">Failed to load companies. ' + (e.message || '') + '</p>';
    }
}

async function loadAdminCustomerDetail(companyId) {
    const el = document.getElementById('adminCustomersContent');
    if (!el) return;
    state.adminCustomerId = companyId;
    try {
        const [company, manufacturers] = await Promise.all([
            api.get('/api/admin/companies/' + companyId),
            api.get('/api/admin/manufacturers')
        ]);
        const name = (company.name || '').replace(/</g, '&lt;');
        const defaultMargin = company.default_gross_margin_percent != null ? company.default_gross_margin_percent : 30;
        const overrides = company.overrides || [];
        el.innerHTML = `
            <div style="margin-bottom: 24px;">
                <button type="button" class="btn btn-secondary" style="margin-bottom: 16px;" onclick="state.adminCustomerId = null; loadAdminCustomersList();"><i class="fas fa-arrow-left" style="margin-right: 6px;"></i>Back to list</button>
                <h2 style="font-size: 22px; font-weight: 700; color: #111;">${name}</h2>
            </div>
            <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Default gross margin %</h3>
                <p style="color: #6B7280; font-size: 13px; margin-bottom: 12px;">Used when no manufacturer override exists. 0 ≤ margin &lt; 100. Sell = cost / (1 − margin/100).</p>
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <input type="number" id="adminDefaultMargin" min="0" max="99.99" step="0.01" value="${defaultMargin}" style="width: 100px; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
                    <button type="button" class="btn btn-primary" onclick="saveAdminDefaultMargin(${companyId})">Save default margin</button>
                </div>
            </div>
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Manufacturer overrides</h3>
                <p style="color: #6B7280; font-size: 13px; margin-bottom: 12px;">Per-manufacturer margin overrides for this customer.</p>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #e5e7eb;">
                                <th style="text-align: left; padding: 12px; font-weight: 600;">Manufacturer</th>
                                <th style="text-align: left; padding: 12px; font-weight: 600;">Margin %</th>
                                <th style="text-align: left; padding: 12px; font-weight: 600;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="adminCustomerOverridesBody">
                            ${overrides.length ? overrides.map(function(o) {
                                const mname = (o.manufacturer_name || '').replace(/</g, '&lt;');
                                const marginVal = (o.gross_margin_percent != null ? o.gross_margin_percent : o.margin_percent) != null ? (o.gross_margin_percent != null ? o.gross_margin_percent : o.margin_percent) : '';
                                return '<tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 12px;">' + mname + '</td><td style="padding: 12px;"><input type="number" id="overrideMargin_' + companyId + '_' + (o.manufacturer_id != null ? o.manufacturer_id : '') + '" min="0" max="99.99" step="0.01" value="' + marginVal + '" style="width: 80px; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px;"></td><td style="padding: 12px;"><button type="button" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="saveAdminOverride(' + companyId + ',' + (o.manufacturer_id != null ? o.manufacturer_id : 'null') + ')">Save</button> <button type="button" class="btn" style="background: #dc2626; color: #fff; padding: 6px 12px; font-size: 12px; border: none; border-radius: 6px; cursor: pointer;" onclick="deleteAdminOverride(' + companyId + ',' + o.id + ')">Delete</button></td></tr>';
                            }).join('') : '<tr><td colspan="3" style="padding: 16px; color: #6B7280;">No overrides. Add one below.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
            <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; border: 1px solid #bae6fd;">
                <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Add override</h3>
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <select id="adminOverrideManufacturer" style="min-width: 180px; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
                        <option value="">— Select manufacturer —</option>
                        ${(manufacturers || []).filter(function(m) { return !(overrides || []).some(function(o) { return o.manufacturer_id === m.id; }); }).map(function(m) {
                            return '<option value="' + m.id + '">' + (m.name || '').replace(/</g, '&lt;') + '</option>';
                        }).join('')}
                    </select>
                    <input type="number" id="adminOverrideMargin" min="0" max="99.99" step="0.01" placeholder="Margin %" style="width: 100px; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
                    <button type="button" class="btn btn-primary" onclick="addAdminOverride(${companyId})">Add override</button>
                </div>
            </div>
        `;
    } catch (e) {
        el.innerHTML = '<p style="color: #dc2626;">Failed to load company. ' + (e.message || '') + '</p><button type="button" class="btn btn-secondary" onclick="state.adminCustomerId = null; loadAdminCustomersList();">Back to list</button>';
    }
}

async function saveAdminDefaultMargin(companyId) {
    const input = document.getElementById('adminDefaultMargin');
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0 || val >= 100) {
        showToast('Margin must be 0 ≤ value < 100', 'error');
        return;
    }
    try {
        await api.post('/api/admin/companies/' + companyId + '/default-margin', { default_gross_margin_percent: val });
        showToast('Default margin saved.', 'success');
    } catch (e) {
        showToast(e.message || 'Save failed', 'error');
    }
}

async function addAdminOverride(companyId) {
    const sel = document.getElementById('adminOverrideManufacturer');
    const input = document.getElementById('adminOverrideMargin');
    if (!sel || !input) return;
    const manufacturerId = sel.value ? parseInt(sel.value, 10) : null;
    const margin = parseFloat(input.value);
    if (!manufacturerId || isNaN(margin) || margin < 0 || margin >= 100) {
        showToast('Select a manufacturer and enter margin 0–99.99', 'error');
        return;
    }
    try {
        await api.post('/api/admin/companies/' + companyId + '/overrides', { manufacturer_id: manufacturerId, gross_margin_percent: margin });
        showToast('Override added.', 'success');
        loadAdminCustomerDetail(companyId);
    } catch (e) {
        showToast(e.message || 'Add failed', 'error');
    }
}

async function saveAdminOverride(companyId, manufacturerId) {
    const input = document.getElementById('overrideMargin_' + companyId + '_' + manufacturerId);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0 || val >= 100) {
        showToast('Margin must be 0 ≤ value < 100', 'error');
        return;
    }
    try {
        await api.post('/api/admin/companies/' + companyId + '/overrides', { manufacturer_id: manufacturerId, gross_margin_percent: val });
        showToast('Override saved.', 'success');
        loadAdminCustomerDetail(companyId);
    } catch (e) {
        showToast(e.message || 'Save failed', 'error');
    }
}

async function deleteAdminOverride(companyId, overrideId) {
    if (!confirm('Remove this manufacturer override?')) return;
    try {
        await api.delete('/api/admin/companies/' + companyId + '/overrides/' + overrideId);
        showToast('Override removed.', 'success');
        loadAdminCustomerDetail(companyId);
    } catch (e) {
        showToast(e.message || 'Delete failed', 'error');
    }
}

async function syncFishbowlInventory() {
    const btn = document.getElementById('fishbowlSyncBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing…'; }
    try {
        const result = await api.post('/api/fishbowl/sync-inventory', {});
        showToast(result.message || 'Fishbowl sync completed (GLV- products only).', 'success');
        if (result.updated !== undefined) loadAdminProducts();
    } catch (err) {
        const msg = err.message || (err.error || 'Sync failed');
        showToast(msg, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync from Fishbowl'; }
    }
}

async function exportFishbowlCustomers() {
    const btn = document.getElementById('fishbowlExportCustomersBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting…'; }
    try {
        const response = await fetch(api.baseUrl + '/api/fishbowl/export-customers.csv', { headers: api.getHeaders() });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err || 'Export failed');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fishbowl-customers.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Customer export downloaded. Import into Fishbowl to create customers.', 'success');
    } catch (err) {
        showToast(err.message || 'Export failed', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-users"></i> Export Customers for Fishbowl'; }
    }
}

const ADMIN_PRODUCTS_PAGE_SIZE = 50;

function getAdminProductCardHTML(product) {
    const esc = (s) => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const name = esc(product.name);
    const sku = esc(product.sku);
    const id = product.id != null ? Number(product.id) : 0;
    const imgUrl = (product.image_url || '').trim();
    const imgHtml = imgUrl
        ? '<img src="' + esc(imgUrl) + '" alt="' + name + '" style="width: 64px; height: 64px; object-fit: cover; border-radius: 8px; display: block; background: #eee;" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" /><div style="display: none; width: 64px; height: 64px; background: #E5E7EB; border-radius: 8px; align-items: center; justify-content: center; color: #9CA3AF;"><i class="fas fa-hand-paper" style="font-size: 24px;"></i></div>'
        : '<div style="width: 64px; height: 64px; background: #E5E7EB; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9CA3AF;"><i class="fas fa-hand-paper" style="font-size: 24px;"></i></div>';
    const price = (product.price != null && !isNaN(product.price)) ? Number(product.price).toFixed(2) : '0.00';
    const bulkPrice = (product.bulk_price != null && !isNaN(product.bulk_price)) ? Number(product.bulk_price).toFixed(2) : '0.00';
    const category = esc(getCategoryDisplayName(product.category) || '');
    const material = esc(product.material || 'N/A');
    return '<div class="admin-product-card" style="background: #f9f9f9; padding: 24px; border-radius: 12px; border-left: 4px solid #FF7A00;">' +
        '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">' +
        '<div style="display: flex; gap: 16px; flex: 1; min-width: 0;">' +
        '<div style="flex-shrink: 0; display: flex; align-items: center;"><label style="cursor: pointer; margin: 0;"><input type="checkbox" class="admin-product-select" data-product-id="' + id + '" style="width: 18px; height: 18px; accent-color: #DC2626;" onclick="event.stopPropagation();" onchange="adminProductsUpdateBatchBar()"></label></div>' +
        '<div style="flex-shrink: 0; position: relative;">' + imgHtml + '</div>' +
        '<div style="min-width: 0;">' +
        '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">' + name + '</h3>' +
        '<p style="color: #4B5563; font-size: 14px; margin-bottom: 4px;">SKU: ' + sku + ' • ' + esc(product.brand || '') + '</p>' +
        '<p style="color: #4B5563; font-size: 13px;">' + category + ' • ' + material + '</p>' +
        '</div></div>' +
        '<div style="text-align: right; margin-left: 24px; flex-shrink: 0;">' +
        '<div style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px;">$' + price + ' <span style="font-size: 14px; color: #4B5563; font-weight: 400;">/ $' + bulkPrice + ' B2B</span></div>' +
        '<div style="display: flex; gap: 8px; margin-top: 12px;">' +
        '<button onclick="editProduct(' + id + ')" type="button" style="background: #28a745; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-edit"></i> Edit</button>' +
        '<button onclick="deleteProduct(' + id + ')" type="button" style="background: #dc3545; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-trash"></i> Delete</button>' +
        '</div></div></div></div>';
}

function getAdminListFilters() {
    const searchEl = document.getElementById('adminFilterSearch');
    const brandEl = document.getElementById('adminFilterBrand');
    const categoryEl = document.getElementById('adminFilterCategory');
    const materialEl = document.getElementById('adminFilterMaterial');
    const colorEl = document.getElementById('adminFilterColor');
    const colors = colorEl ? Array.from(colorEl.selectedOptions).map(function(o) { return o.value; }).filter(function(v) { return v; }) : [];
    return {
        search: (searchEl && searchEl.value) ? (searchEl.value || '').trim() : '',
        brand: (brandEl && brandEl.value) || '',
        category: (categoryEl && categoryEl.value) || '',
        material: (materialEl && materialEl.value) || '',
        colors: colors
    };
}

function applyAdminListFilters(products, filters) {
    if (!products || !Array.isArray(products)) return [];
    let list = products;
    if (filters.search) {
        const q = filters.search.toLowerCase();
        list = list.filter(function(p) {
            const sku = (p.sku || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            const brand = (p.brand || '').toLowerCase();
            const material = (p.material || '').toLowerCase();
            return sku.indexOf(q) !== -1 || name.indexOf(q) !== -1 || brand.indexOf(q) !== -1 || material.indexOf(q) !== -1;
        });
    }
    if (filters.brand) list = list.filter(function(p) { return (p.brand || '').trim().toLowerCase() === (filters.brand || '').trim().toLowerCase(); });
    if (filters.category) list = list.filter(function(p) { return (p.category || '').trim() === filters.category; });
    if (filters.material) list = list.filter(function(p) { return (p.material || '').trim() === filters.material; });
    if (filters.colors && filters.colors.length > 0) {
        const colorSet = new Set(filters.colors.map(function(c) { return (c || '').toLowerCase(); }));
        list = list.filter(function(p) {
            const productColors = (p.color || '').split(/[\s,;]+/).map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
            return productColors.some(function(c) { return colorSet.has(c); }) || colorSet.has((p.color || '').trim().toLowerCase());
        });
    }
    return list;
}

function getAdminFilteredProducts() {
    const all = window.adminProductsCache;
    if (!all || !Array.isArray(all)) return [];
    const filters = getAdminListFilters();
    const hasFilter = filters.search || filters.brand || filters.category || filters.material || (filters.colors && filters.colors.length > 0);
    return hasFilter ? applyAdminListFilters(all, filters) : all;
}

function adminProductsOnFilterChange() {
    window.adminProductsPage = 1;
    adminProductsRenderPage();
    adminProductsUpdateFilterSummary();
}

function adminProductsClearFilters() {
    const searchEl = document.getElementById('adminFilterSearch');
    const brandEl = document.getElementById('adminFilterBrand');
    const categoryEl = document.getElementById('adminFilterCategory');
    const materialEl = document.getElementById('adminFilterMaterial');
    const colorEl = document.getElementById('adminFilterColor');
    if (searchEl) searchEl.value = '';
    if (brandEl) brandEl.value = '';
    if (categoryEl) categoryEl.value = '';
    if (materialEl) materialEl.value = '';
    if (colorEl) Array.from(colorEl.options).forEach(function(o) { o.selected = false; });
    window.adminProductsPage = 1;
    adminProductsRenderPage();
    adminProductsUpdateFilterSummary();
}

function adminProductsUpdateFilterSummary() {
    const el = document.getElementById('adminProductsFilterSummary');
    if (!el) return;
    const all = window.adminProductsCache;
    const total = (all && all.length) ? all.length : 0;
    const filtered = getAdminFilteredProducts();
    const count = filtered.length;
    if (count < total && total > 0) {
        el.textContent = 'Showing ' + count + ' of ' + total + ' products.';
    } else {
        el.textContent = total ? (total + ' product' + (total === 1 ? '' : 's') + ' total.') : '';
    }
}

function populateAdminListFilters(products) {
    if (!products || !Array.isArray(products)) return;
    const brands = [...new Set(products.map(function(p) { return (p.brand || '').trim(); }).filter(Boolean))].sort();
    const materials = [...new Set(products.map(function(p) { return (p.material || '').trim(); }).filter(Boolean))].sort();
    const colors = [...new Set(products.map(function(p) { return (p.color || '').trim(); }).filter(Boolean))].sort();
    const brandEl = document.getElementById('adminFilterBrand');
    const materialEl = document.getElementById('adminFilterMaterial');
    const colorEl = document.getElementById('adminFilterColor');
    if (brandEl) {
        const current = brandEl.value;
        brandEl.innerHTML = '<option value="">All</option>' + brands.map(function(b) { return '<option value="' + (b || '').replace(/"/g, '&quot;') + '">' + (b || '').replace(/</g, '&lt;') + '</option>'; }).join('');
        if (current && brands.indexOf(current) !== -1) brandEl.value = current;
    }
    if (materialEl) {
        const current = materialEl.value;
        materialEl.innerHTML = '<option value="">All</option>' + materials.map(function(m) { return '<option value="' + (m || '').replace(/"/g, '&quot;') + '">' + (m || '').replace(/</g, '&lt;') + '</option>'; }).join('');
        if (current && materials.indexOf(current) !== -1) materialEl.value = current;
    }
    if (colorEl) {
        const selected = Array.from(colorEl.selectedOptions).map(function(o) { return o.value; });
        colorEl.innerHTML = colors.map(function(c) { return '<option value="' + (c || '').replace(/"/g, '&quot;') + '">' + (c || '').replace(/</g, '&lt;') + '</option>'; }).join('');
        Array.from(colorEl.options).forEach(function(o) { o.selected = selected.indexOf(o.value) !== -1; });
    }
}

function adminProductsRenderPage() {
    const products = getAdminFilteredProducts();
    const page = window.adminProductsPage || 1;
    if (!products || !Array.isArray(products)) return;
    const size = ADMIN_PRODUCTS_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(products.length / size));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    window.adminProductsPage = currentPage;
    const start = (currentPage - 1) * size;
    const pageProducts = products.slice(start, start + size);
    const grid = document.getElementById('adminProductsGrid');
    const paginationEl = document.getElementById('adminProductsPagination');
    const countEl = document.getElementById('adminProductsCountText');
    if (countEl) {
        const totalAll = (window.adminProductsCache && window.adminProductsCache.length) || 0;
        if (products.length < totalAll) {
            countEl.textContent = 'Showing ' + products.length + ' of ' + totalAll + ' products';
        } else {
            countEl.textContent = 'Total: ' + products.length + ' products';
        }
    }
    if (grid) grid.innerHTML = pageProducts.map(function(p) { return getAdminProductCardHTML(p); }).join('');
    const selectAllCb = document.getElementById('adminProductsSelectAll');
    if (selectAllCb) selectAllCb.checked = false;
    adminProductsUpdateBatchBar();
    if (paginationEl) {
        paginationEl.innerHTML = '<div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 16px; padding: 16px; background: #f9f9f9; border-radius: 8px;">' +
            '<span style="color: #4B5563; font-size: 14px;">Page ' + currentPage + ' of ' + totalPages + ' (showing ' + pageProducts.length + ' of ' + products.length + ' products)</span>' +
            '<div style="display: flex; gap: 8px;">' +
            '<button type="button" onclick="adminProductsPrevPage()" ' + (currentPage <= 1 ? 'disabled' : '') + ' style="background: ' + (currentPage <= 1 ? '#E5E7EB' : '#111111') + '; color: ' + (currentPage <= 1 ? '#9CA3AF' : '#ffffff') + '; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: ' + (currentPage <= 1 ? 'not-allowed' : 'pointer') + ';"><i class="fas fa-chevron-left"></i> Previous</button>' +
            '<button type="button" onclick="adminProductsNextPage()" ' + (currentPage >= totalPages ? 'disabled' : '') + ' style="background: ' + (currentPage >= totalPages ? '#E5E7EB' : '#FF7A00') + '; color: ' + (currentPage >= totalPages ? '#9CA3AF' : '#ffffff') + '; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: ' + (currentPage >= totalPages ? 'not-allowed' : 'pointer') + ';">Next <i class="fas fa-chevron-right"></i></button>' +
            '</div></div>';
    }
}

function adminProductsPrevPage() {
    if (!window.adminProductsCache || (window.adminProductsPage || 1) <= 1) return;
    window.adminProductsPage = (window.adminProductsPage || 1) - 1;
    adminProductsRenderPage();
}

function adminProductsNextPage() {
    if (!window.adminProductsCache) return;
    const totalPages = Math.ceil(window.adminProductsCache.length / ADMIN_PRODUCTS_PAGE_SIZE);
    if ((window.adminProductsPage || 1) >= totalPages) return;
    window.adminProductsPage = (window.adminProductsPage || 1) + 1;
    adminProductsRenderPage();
}

function getSelectedProductIds() {
    const grid = document.getElementById('adminProductsGrid');
    if (!grid) return [];
    const checkboxes = grid.querySelectorAll('.admin-product-select:checked');
    return Array.from(checkboxes).map(function(cb) { return parseInt(cb.getAttribute('data-product-id'), 10); }).filter(function(id) { return !isNaN(id); });
}

function adminProductsUpdateBatchBar() {
    const ids = getSelectedProductIds();
    const btn = document.getElementById('adminProductsBatchDeleteBtn');
    const countEl = document.getElementById('adminProductsSelectedCount');
    const selectAllCb = document.getElementById('adminProductsSelectAll');
    if (btn) {
        btn.disabled = ids.length === 0;
        btn.style.cursor = ids.length === 0 ? 'not-allowed' : 'pointer';
        btn.style.background = ids.length === 0 ? '#9CA3AF' : '#DC2626';
    }
    if (countEl) countEl.textContent = ids.length > 0 ? ids.length + ' selected' : '';
    if (selectAllCb) {
        const grid = document.getElementById('adminProductsGrid');
        const all = grid ? grid.querySelectorAll('.admin-product-select') : [];
        const checked = grid ? grid.querySelectorAll('.admin-product-select:checked') : [];
        selectAllCb.checked = all.length > 0 && all.length === checked.length;
    }
}

function adminProductsToggleSelectAll() {
    const selectAllCb = document.getElementById('adminProductsSelectAll');
    const grid = document.getElementById('adminProductsGrid');
    if (!grid || !selectAllCb) return;
    grid.querySelectorAll('.admin-product-select').forEach(function(cb) { cb.checked = selectAllCb.checked; });
    adminProductsUpdateBatchBar();
}

async function batchDeleteProducts() {
    const ids = getSelectedProductIds();
    if (ids.length === 0) {
        showToast('Select one or more products to delete.', 'error');
        return;
    }
    if (!confirm('Delete ' + ids.length + ' product(s)? This cannot be undone.')) return;
    try {
        const result = await api.post('/api/products/batch-delete', { ids: ids });
        const deleted = result.deleted != null ? result.deleted : ids.length;
        showToast(deleted + ' product(s) deleted.', 'success');
        loadAdminProducts(true);
    } catch (error) {
        showToast('Error deleting products: ' + (error.message || 'Unknown error'), 'error');
    }
}

function showAdminNewFromUrlView() {
    state.adminProductsView = 'new-from-url';
    state.adminNewFromUrlPayload = null;
    state.adminNewFromUrlParseResult = null;
    state.adminNewFromUrlUrl = '';
    if (window.history && window.history.pushState) window.history.pushState(null, '', '/admin/products/new-from-url');
    loadAdminProducts();
}

function hideAdminNewFromUrlView() {
    state.adminProductsView = null;
    state.adminNewFromUrlPayload = null;
    state.adminNewFromUrlParseResult = null;
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', '/admin');
    loadAdminProducts();
}

function renderAdminNewFromUrl() {
    const content = document.getElementById('adminProductsContent');
    if (!content) return;
    const draft = state.adminNewFromUrlPayload || {};
    const imageUrls = Array.isArray(draft.image_urls) ? draft.image_urls : [];
    var assetImg = (state.adminNewFromUrlAssetResult && state.adminNewFromUrlAssetResult.hints && (state.adminNewFromUrlAssetResult.hints.image_urls || state.adminNewFromUrlAssetResult.hints.images)) ? (state.adminNewFromUrlAssetResult.hints.image_urls || state.adminNewFromUrlAssetResult.hints.images)[0] : '';
    const primaryImage = imageUrls[0] || '';
    const additionalImages = imageUrls.length > 1 ? imageUrls.slice(1).join('\n') : '';
    content.innerHTML = `
        <div style="margin-bottom: 24px;">
            <button type="button" class="btn btn-secondary" onclick="hideAdminNewFromUrlView()"><i class="fas fa-arrow-left" style="margin-right: 6px;"></i>Back to Products</button>
            <h2 style="font-size: 22px; font-weight: 700; margin: 16px 0 8px;">Add Product by URL (AI-assisted)</h2>
            <p style="color: #6B7280; font-size: 14px;">Paste a product page URL (e.g. hospecobrands.com), fetch preview, then review and save to Supabase.</p>
        </div>
        <div style="background: #F9FAFB; padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #E5E7EB;">
            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px;">URL (product page or image/PDF)</label>
            <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                <input type="url" id="newFromUrlInput" value="${(state.adminNewFromUrlUrl || '').replace(/"/g, '&quot;')}" placeholder="https://globalglove.com/801 or https://.../image.png" style="flex: 1; min-width: 280px; padding: 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                <button type="button" id="newFromUrlFetchBtn" class="btn btn-primary" onclick="fetchAdminNewFromUrlPreview()"><i class="fas fa-download"></i> Fetch Preview</button>
            </div>
            <div id="newFromUrlStatus" style="margin-top: 12px; font-size: 13px; min-height: 24px;"></div>
            <div id="newFromUrlAssetSection" style="display: ${state.adminNewFromUrlAssetResult ? 'block' : 'none'}; margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
                <p style="color: #B45309; font-size: 13px; margin-bottom: 12px;"><strong>This is a media file URL, not a product page.</strong> We saved it as the product image. Paste the product page URL below to auto-fill SKU and details.</p>
                <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                    <input type="url" id="newFromUrlProductPageInput" placeholder="https://www.globalglove.com/801" style="flex: 1; min-width: 260px; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                    <button type="button" id="newFromUrlFetchDetailsBtn" class="btn btn-primary" onclick="fetchAdminNewFromUrlProductPageDetails()"><i class="fas fa-link"></i> Fetch details</button>
                </div>
                ${assetImg ? '<div style="margin-top: 12px;"><img src="' + (assetImg.replace(/"/g, '&quot;')) + '" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 8px; border: 1px solid #E5E7EB;" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'"></div>' : ''}
            </div>
        </div>
        <div id="newFromUrlFormSection" style="display: ${state.adminNewFromUrlPayload != null ? 'block' : 'none'}; background: #fff; padding: 24px; border-radius: 12px; border: 1px solid #E5E7EB; margin-bottom: 24px;">
            <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">Product draft — edit and save</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">SKU / Item number *</label>
                    <input type="text" id="newFromUrlSku" value="${(draft.sku || '').replace(/"/g, '&quot;')}" placeholder="e.g. 500G" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Name / Title *</label>
                    <input type="text" id="newFromUrlName" value="${(draft.name || '').replace(/"/g, '&quot;')}" placeholder="Product name" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Brand / Manufacturer</label>
                    <input type="text" id="newFromUrlBrand" value="${(draft.brand || '').replace(/"/g, '&quot;')}" placeholder="e.g. Hospeco" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Category</label>
                    <select id="newFromUrlCategory" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                        <option value="">— Select —</option>
                        <option value="Disposable Gloves" ${(draft.category || '') === 'Disposable Gloves' ? 'selected' : ''}>Disposable Gloves</option>
                        <option value="Work Gloves" ${(draft.category || '') === 'Work Gloves' || (draft.category || '') === 'Reusable Work Gloves' ? 'selected' : ''}>Reusable Work Gloves</option>
                    </select>
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Description</label>
                    <textarea id="newFromUrlDescription" rows="4" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">${(draft.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Primary image URL</label>
                    <input type="url" id="newFromUrlImagePrimary" value="${(primaryImage || '').replace(/"/g, '&quot;')}" placeholder="https://..." style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Additional image URLs (one per line)</label>
                    <textarea id="newFromUrlImagesExtra" rows="2" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">${(additionalImages || '').replace(/</g, '&lt;')}</textarea>
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Color</label>
                    <input type="text" id="newFromUrlColor" value="${(draft.color || '').replace(/"/g, '&quot;')}" placeholder="e.g. Blue" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Thickness (mil)</label>
                    <input type="text" id="newFromUrlThickness" value="${(draft.thickness || draft.thickness_mil || '').replace(/"/g, '&quot;')}" placeholder="e.g. 4 mil" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Material</label>
                    <input type="text" id="newFromUrlMaterial" value="${(draft.material || '').replace(/"/g, '&quot;')}" placeholder="e.g. Nitrile" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Sizes</label>
                    <input type="text" id="newFromUrlSizes" value="${(draft.sizes || '').replace(/"/g, '&quot;')}" placeholder="e.g. S, M, L, XL" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Pack qty</label>
                    <input type="number" id="newFromUrlPackQty" min="0" step="1" value="${draft.pack_qty != null ? draft.pack_qty : ''}" placeholder="e.g. 100" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Case qty</label>
                    <input type="number" id="newFromUrlCaseQty" min="0" step="1" value="${draft.case_qty != null ? draft.case_qty : ''}" placeholder="e.g. 1000" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Subcategory</label>
                    <input type="text" id="newFromUrlSubcategory" value="${(draft.subcategory || '').replace(/"/g, '&quot;')}" placeholder="e.g. Exam Gloves" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px;">
                </div>
            </div>
            <div id="newFromUrlSaveError" style="margin-top: 12px; color: #DC2626; font-size: 13px;"></div>
            <div style="margin-top: 20px;">
                <button type="button" class="btn btn-primary" onclick="saveAdminNewFromUrlProduct()"><i class="fas fa-save"></i> Save Product</button>
            </div>
        </div>
    `;
}

async function fetchAdminNewFromUrlPreview() {
    const input = document.getElementById('newFromUrlInput');
    const btn = document.getElementById('newFromUrlFetchBtn');
    const statusEl = document.getElementById('newFromUrlStatus');
    const url = (input && input.value) ? input.value.trim() : '';
    if (!url) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #B45309;">Enter a product page URL.</span>';
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">URL must start with http:// or https://</span>';
        return;
    }
    state.adminNewFromUrlUrl = url;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...'; }
    if (statusEl) statusEl.innerHTML = 'Fetching page...';
    try {
        let res = await fetch(api.baseUrl + '/api/admin/products/parse-url', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify({ url: url }) });
        let data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (data.error || res.statusText || 'Fetch failed') + '</span>';
            return;
        }
        if (data.kind === 'asset') {
            var assetUrls = (data.hints && (data.hints.image_urls || data.hints.images)) ? (data.hints.image_urls || data.hints.images) : (data.asset && data.asset.finalUrl ? [data.asset.finalUrl] : [data.url]);
            state.adminNewFromUrlAssetResult = data;
            state.adminNewFromUrlPayload = { name: '', sku: '', image_urls: assetUrls };
            if (statusEl) statusEl.innerHTML = '<span style="color: #B45309;">Media file detected. Use the product page URL below to fetch SKU/details, or edit the form and save.</span>';
            renderAdminNewFromUrl();
            return;
        }
        state.adminNewFromUrlAssetResult = null;
        if (data.kind !== 'page' || !data.extracted) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">Could not parse as product page.</span>';
            return;
        }
        state.adminNewFromUrlParseResult = data;
        if (statusEl) statusEl.innerHTML = 'Running AI normalization...';
        var aiBody = { kind: 'page', url: url, extracted: data.extracted, hints: data.hints || {}, logParse: true };
        res = await fetch(api.baseUrl + '/api/admin/products/ai-normalize', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify(aiBody) });
        data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (data.error || 'AI normalization failed') + '</span>';
            return;
        }
        let normalized = data.normalized || {};
        var extracted = state.adminNewFromUrlParseResult.extracted || {};
        if (extracted.sku) normalized.sku = extracted.sku;
        if (extracted.image_urls && extracted.image_urls.length > 0) {
            normalized.image_urls = extracted.image_urls;
        } else if (normalized.image_urls && normalized.image_urls.length > 0) {
            if (statusEl) statusEl.innerHTML = 'Validating image URLs...';
            res = await fetch(api.baseUrl + '/api/admin/products/validate-images', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify({ image_urls: normalized.image_urls }) });
            var valData = await res.json().catch(function() { return {}; });
            if (valData.valid_urls && valData.valid_urls.length >= 0) normalized.image_urls = valData.valid_urls || [];
        }
        state.adminNewFromUrlPayload = normalized;
        if (statusEl) statusEl.innerHTML = '<span style="color: #059669;">Preview ready. Edit fields below and click Save Product.</span>' + (data.fromFallback ? ' <span style="color: #B45309;">(OPENAI_API_KEY not set; basic extraction only. Add key in .env for AI.)</span>' : '');
        renderAdminNewFromUrl();
    } catch (err) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (err.message || 'Request failed') + '</span>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Fetch Preview'; }
    }
}

async function fetchAdminNewFromUrlProductPageDetails() {
    var pageInput = document.getElementById('newFromUrlProductPageInput');
    var btn = document.getElementById('newFromUrlFetchDetailsBtn');
    var statusEl = document.getElementById('newFromUrlStatus');
    var pageUrl = (pageInput && pageInput.value) ? pageInput.value.trim() : '';
    if (!pageUrl || !pageUrl.startsWith('http')) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #B45309;">Enter a product page URL (e.g. https://www.globalglove.com/801).</span>';
        return;
    }
    var assetResult = state.adminNewFromUrlAssetResult;
    if (!assetResult || !assetResult.hints) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">Paste an image/asset URL first, then enter the product page URL.</span>';
        return;
    }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...'; }
    if (statusEl) statusEl.innerHTML = 'Fetching product page...';
    try {
        var res = await fetch(api.baseUrl + '/api/admin/products/parse-url', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify({ url: pageUrl }) });
        var data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (data.error || 'Fetch failed') + '</span>';
            return;
        }
        if (data.kind !== 'page' || !data.extracted) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">Not a product page. Use a URL that returns HTML (e.g. https://www.globalglove.com/801).</span>';
            return;
        }
        state.adminNewFromUrlParseResult = data;
        if (statusEl) statusEl.innerHTML = 'Running AI normalization...';
        var hints = assetResult.hints || {};
        var aiBody = { kind: 'page', url: pageUrl, extracted: data.extracted, hints: hints, logParse: true };
        res = await fetch(api.baseUrl + '/api/admin/products/ai-normalize', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify(aiBody) });
        data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (data.error || 'AI normalization failed') + '</span>';
            return;
        }
        var normalized = data.normalized || {};
        var extracted = state.adminNewFromUrlParseResult.extracted || {};
        if (extracted.sku) normalized.sku = extracted.sku;
        var assetUrls = hints.image_urls || hints.images || [];
        var primaryAsset = assetUrls[0];
        var mergedImages = primaryAsset ? [primaryAsset] : [];
        (normalized.image_urls || []).forEach(function(u) { if (u && mergedImages.indexOf(u) === -1) mergedImages.push(u); });
        normalized.image_urls = mergedImages.length ? mergedImages : (primaryAsset ? [primaryAsset] : []);
        state.adminNewFromUrlPayload = normalized;
        state.adminNewFromUrlAssetResult = null;
        if (statusEl) statusEl.innerHTML = '<span style="color: #059669;">Details filled from product page. Edit and save.</span>';
        renderAdminNewFromUrl();
    } catch (err) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (err.message || 'Request failed') + '</span>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-link"></i> Fetch details'; }
    }
}

async function saveAdminNewFromUrlProduct() {
    const errEl = document.getElementById('newFromUrlSaveError');
    if (errEl) errEl.textContent = '';
    const sku = (document.getElementById('newFromUrlSku') && document.getElementById('newFromUrlSku').value) ? document.getElementById('newFromUrlSku').value.trim() : '';
    const name = (document.getElementById('newFromUrlName') && document.getElementById('newFromUrlName').value) ? document.getElementById('newFromUrlName').value.trim() : '';
    if (!sku || !name) {
        if (errEl) errEl.textContent = 'SKU and Name are required. Please fill them in.';
        showToast('SKU and Name are required.', 'error');
        return;
    }
    const primary = (document.getElementById('newFromUrlImagePrimary') && document.getElementById('newFromUrlImagePrimary').value) ? document.getElementById('newFromUrlImagePrimary').value.trim() : '';
    const extraText = (document.getElementById('newFromUrlImagesExtra') && document.getElementById('newFromUrlImagesExtra').value) ? document.getElementById('newFromUrlImagesExtra').value : '';
    const extraUrls = extraText.split(/[\r\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    const image_urls = primary ? [primary].concat(extraUrls) : extraUrls;
    const payload = {
        sku: sku,
        name: name,
        brand: (document.getElementById('newFromUrlBrand') && document.getElementById('newFromUrlBrand').value) ? document.getElementById('newFromUrlBrand').value.trim() : '',
        description: (document.getElementById('newFromUrlDescription') && document.getElementById('newFromUrlDescription').value) ? document.getElementById('newFromUrlDescription').value.trim() : '',
        image_urls: image_urls,
        color: (document.getElementById('newFromUrlColor') && document.getElementById('newFromUrlColor').value) ? document.getElementById('newFromUrlColor').value.trim() : '',
        thickness: (document.getElementById('newFromUrlThickness') && document.getElementById('newFromUrlThickness').value) ? document.getElementById('newFromUrlThickness').value.trim() : '',
        material: (document.getElementById('newFromUrlMaterial') && document.getElementById('newFromUrlMaterial').value) ? document.getElementById('newFromUrlMaterial').value.trim() : '',
        sizes: (document.getElementById('newFromUrlSizes') && document.getElementById('newFromUrlSizes').value) ? document.getElementById('newFromUrlSizes').value.trim() : '',
        pack_qty: (document.getElementById('newFromUrlPackQty') && document.getElementById('newFromUrlPackQty').value) ? parseInt(document.getElementById('newFromUrlPackQty').value, 10) : null,
        case_qty: (document.getElementById('newFromUrlCaseQty') && document.getElementById('newFromUrlCaseQty').value) ? parseInt(document.getElementById('newFromUrlCaseQty').value, 10) : null,
        category: (document.getElementById('newFromUrlCategory') && document.getElementById('newFromUrlCategory').value) ? document.getElementById('newFromUrlCategory').value.trim() : '',
        subcategory: (document.getElementById('newFromUrlSubcategory') && document.getElementById('newFromUrlSubcategory').value) ? document.getElementById('newFromUrlSubcategory').value.trim() : ''
    };
    if (payload.pack_qty !== null && isNaN(payload.pack_qty)) payload.pack_qty = null;
    if (payload.case_qty !== null && isNaN(payload.case_qty)) payload.case_qty = null;
    try {
        const res = await fetch(api.baseUrl + '/api/admin/products/save', { method: 'POST', headers: api.getHeaders(), body: JSON.stringify(payload) });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
            if (errEl) errEl.textContent = data.error || 'Save failed';
            showToast(data.error || 'Save failed', 'error');
            return;
        }
        showToast('Product saved: ' + (data.action || 'saved') + ' — ' + payload.sku, 'success');
        state.adminNewFromUrlPayload = null;
        state.adminNewFromUrlUrl = '';
        renderAdminNewFromUrl();
    } catch (err) {
        if (errEl) errEl.textContent = err.message || 'Request failed';
        showToast(err.message || 'Request failed', 'error');
    }
}

async function loadAdminProducts(keepPage) {
    const content = document.getElementById('adminProductsContent');
    if (!content) return;

    if (state.adminProductsView === 'new-from-url') {
        renderAdminNewFromUrl();
        return;
    }

    try {
        const products = await api.get('/api/products');
        window.adminProductsCache = products;
        const size = ADMIN_PRODUCTS_PAGE_SIZE;
        const totalPages = Math.max(1, Math.ceil(products.length / size));
        if (keepPage) {
            const current = Math.min(window.adminProductsPage || 1, totalPages);
            window.adminProductsPage = current;
        } else {
            window.adminProductsPage = 1;
        }
        const currentPage = window.adminProductsPage || 1;
        const start = (currentPage - 1) * size;
        const pageProducts = products.slice(start, start + size);
        const gridHTML = pageProducts.map(function(p) { return getAdminProductCardHTML(p); }).join('');
        const prevDisabled = currentPage <= 1;
        const nextDisabled = currentPage >= totalPages;
        const paginationHTML = '<div id="adminProductsPagination" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 16px; padding: 16px; background: #f9f9f9; border-radius: 8px;">' +
            '<span style="color: #4B5563; font-size: 14px;">Page ' + currentPage + ' of ' + totalPages + ' (showing ' + pageProducts.length + ' of ' + products.length + ' products)</span>' +
            '<div style="display: flex; gap: 8px;">' +
            '<button type="button" onclick="adminProductsPrevPage()" ' + (prevDisabled ? 'disabled' : '') + ' style="background: ' + (prevDisabled ? '#E5E7EB' : '#111111') + '; color: ' + (prevDisabled ? '#9CA3AF' : '#ffffff') + '; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: ' + (prevDisabled ? 'not-allowed' : 'pointer') + ';"><i class="fas fa-chevron-left"></i> Previous</button>' +
            '<button type="button" onclick="adminProductsNextPage()" ' + (nextDisabled ? 'disabled' : '') + ' style="background: ' + (nextDisabled ? '#E5E7EB' : '#FF7A00') + '; color: ' + (nextDisabled ? '#9CA3AF' : '#ffffff') + '; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: ' + (nextDisabled ? 'not-allowed' : 'pointer') + ';">Next <i class="fas fa-chevron-right"></i></button>' +
            '</div></div>';
        
        content.innerHTML = `
            <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                <div>
                    <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Product Management</h2>
                    <p id="adminProductsCountText" style="color: #4B5563;">Total: ${products.length} products</p>
                </div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <button onclick="exportProductsToCSV()" style="background: #6B7280; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#4B5563';" onmouseout="this.style.background='#6B7280';">
                        <i class="fas fa-download"></i> Export CSV
                    </button>
                    <button onclick="showCSVImportSection()" style="background: #111111; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#1F2933';" onmouseout="this.style.background='#111111';">
                        <i class="fas fa-file-csv"></i> Import CSV
                    </button>
                    <button onclick="showAdminNewFromUrlView()" style="background: #7C3AED; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#6D28D9';" onmouseout="this.style.background='#7C3AED';">
                        <i class="fas fa-link"></i> Add Product by URL
                    </button>
                    <button onclick="showAddProductForm()" style="background: #FF7A00; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='rgba(255,122,0,0.85)';" onmouseout="this.style.background='#FF7A00';">
                        <i class="fas fa-plus"></i> Add New Product
                    </button>
                    <button onclick="syncFishbowlInventory()" id="fishbowlSyncBtn" style="background: #0ea5e9; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#0284c7';" onmouseout="this.style.background='#0ea5e9';">
                        <i class="fas fa-sync-alt"></i> Sync from Fishbowl
                    </button>
                    <button onclick="exportFishbowlCustomers()" id="fishbowlExportCustomersBtn" style="background: #059669; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#047857';" onmouseout="this.style.background='#059669';">
                        <i class="fas fa-users"></i> Export Customers for Fishbowl
                    </button>
                </div>
            </div>
            <p style="font-size: 13px; color: #4B5563; margin-top: -8px; margin-bottom: 16px;"><strong>Sync from Fishbowl:</strong> Updates inventory (in_stock, quantity) for products whose SKU starts with <code>GLV-</code> only. <strong>Export Customers:</strong> Download CSV of customers who have placed orders so Fishbowl can create customers and fulfill orders.</p>
            
            <!-- Export by filters -->
            <div id="adminExportBySection" style="background: #F9FAFB; padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #E5E7EB;">
                <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #111111;"><i class="fas fa-filter" style="color: #FF7A00; margin-right: 8px;"></i>Export by</h3>
                <p style="font-size: 13px; color: #4B5563; margin-bottom: 16px;">Choose filters below, then click Export CSV to download only matching products. Leave all as "All" to export everything.</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; align-items: start;">
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Manufacturer</label>
                        <select id="exportFilterBrand" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;">
                            <option value="">All manufacturers</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Category</label>
                        <select id="exportFilterCategory" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;">
                            <option value="">All categories</option>
                            <option value="Disposable Gloves">Disposable Gloves</option>
                            <option value="Work Gloves">Reusable Work Gloves</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Color(s)</label>
                        <select id="exportFilterColors" multiple style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff; min-height: 80px;">
                            <option value="Blue">Blue</option>
                            <option value="Black">Black</option>
                            <option value="White">White</option>
                            <option value="Clear">Clear</option>
                            <option value="Orange">Orange</option>
                            <option value="Purple">Purple</option>
                            <option value="Green">Green</option>
                            <option value="Natural">Natural</option>
                            <option value="Gray">Gray</option>
                            <option value="Tan">Tan</option>
                            <option value="Yellow">Yellow</option>
                        </select>
                        <span style="font-size: 11px; color: #4B5563;">Hold Ctrl/Cmd to select multiple</span>
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Material(s)</label>
                        <select id="exportFilterMaterials" multiple style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff; min-height: 80px;">
                            <option value="Nitrile">Nitrile</option>
                            <option value="Latex">Latex</option>
                            <option value="Vinyl">Vinyl</option>
                            <option value="Polyethylene (PE)">Polyethylene (PE)</option>
                        </select>
                        <span style="font-size: 11px; color: #4B5563;">Hold Ctrl/Cmd to select multiple</span>
                    </div>
                </div>
            </div>
            
            <!-- Filter products (for list) -->
            <div id="adminProductsFilterSection" style="background: #F0F9FF; padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #BAE6FD;">
                <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #111111;"><i class="fas fa-search" style="color: #0ea5e9; margin-right: 8px;"></i>Filter products</h3>
                <p style="font-size: 13px; color: #4B5563; margin-bottom: 16px;">Narrow the list below by manufacturer, category, material, or color to find products to edit.</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; align-items: end; flex-wrap: wrap;">
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Search (SKU or name)</label>
                        <input type="text" id="adminFilterSearch" placeholder="e.g. GLV- or Nitrile" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;" oninput="adminProductsOnFilterChange()">
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Manufacturer</label>
                        <select id="adminFilterBrand" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;" onchange="adminProductsOnFilterChange()">
                            <option value="">All</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Category</label>
                        <select id="adminFilterCategory" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;" onchange="adminProductsOnFilterChange()">
                            <option value="">All</option>
                            <option value="Disposable Gloves">Disposable Gloves</option>
                            <option value="Work Gloves">Reusable Work Gloves</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Material</label>
                        <select id="adminFilterMaterial" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;" onchange="adminProductsOnFilterChange()">
                            <option value="">All</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Color(s)</label>
                        <select id="adminFilterColor" multiple style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff; min-height: 80px;" onchange="adminProductsOnFilterChange()">
                            <option value="">All</option>
                        </select>
                        <span style="font-size: 11px; color: #4B5563;">Hold Ctrl/Cmd to select multiple</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <button type="button" onclick="adminProductsClearFilters()" style="background: #E5E7EB; color: #374151; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;" onmouseover="this.style.background='#D1D5DB';" onmouseout="this.style.background='#E5E7EB';">
                            <i class="fas fa-times-circle" style="margin-right: 6px;"></i>Clear filters
                        </button>
                    </div>
                </div>
                <p id="adminProductsFilterSummary" style="font-size: 13px; color: #4B5563; margin-top: 12px; margin-bottom: 0;"></p>
            </div>
            
            <!-- CSV Import Section -->
            <div id="csvImportSection" style="display: none; background: linear-gradient(135deg, #fff5f0 0%, #ffffff 100%); padding: 32px; border-radius: 12px; margin-bottom: 24px; border: 2px solid #FF7A00;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px;">
                    <div>
                        <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #111111;">
                            <i class="fas fa-file-csv" style="color: #FF7A00; margin-right: 8px;"></i>
                            Import Products from CSV
                        </h3>
                        <p style="color: #4B5563; font-size: 14px;">Upload a CSV file to bulk import products. Different column names work: e.g. <strong>manufacturer</strong> (for brand), <strong>sizing</strong> or <strong>size</strong>, <strong>colour</strong>, <strong>product name</strong>. Duplicates by SKU are never created—same SKU updates the existing product.</p>
                    </div>
                    <button onclick="hideCSVImportSection()" style="background: none; border: none; font-size: 24px; color: #4B5563; cursor: pointer; padding: 4px 8px;" onmouseover="this.style.color='#111111';" onmouseout="this.style.color='#6B7280';">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div id="csvDropZone" class="csv-drop-zone" style="background: #ffffff; padding: 48px 32px; border-radius: 12px; border: 2px dashed #E5E7EB; margin-bottom: 20px; min-height: 240px; display: flex; align-items: center; justify-content: center; transition: border-color 0.2s ease, background 0.2s ease;" onclick="if(event.target.closest('button') || event.target.closest('label')) return; document.getElementById('csvFileInput').click();">
                    <input type="file" id="csvFileInput" accept=".csv" style="display: none;" onchange="handleCSVFileSelect(event)">
                    <div style="text-align: center; width: 100%;">
                        <div style="width: 96px; height: 96px; background: #fff5f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 48px; color: #FF7A00;"></i>
                        </div>
                        <p style="font-size: 18px; font-weight: 600; color: #111111; margin-bottom: 8px;">Drag and drop your CSV file here</p>
                        <p style="font-size: 14px; color: #4B5563; margin-bottom: 20px;">or click the button below to browse</p>
                        <button type="button" onclick="document.getElementById('csvFileInput').click()" style="background: #FF7A00; color: #ffffff; border: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;" onmouseover="this.style.background='rgba(255,122,0,0.85)';" onmouseout="this.style.background='#FF7A00';">
                            <i class="fas fa-folder-open" style="margin-right: 8px;"></i>Choose CSV File
                        </button>
                        <p id="csvFileName" style="color: #4B5563; font-size: 14px; margin-top: 16px; font-style: italic;">No file selected</p>
                        <label style="display: inline-flex; align-items: center; gap: 8px; margin-top: 16px; cursor: pointer; font-size: 14px; color: #1a1a1a;">
                            <input type="checkbox" id="csvUpdateImagesOnly" style="width: 18px; height: 18px; accent-color: #FF7A00;" onchange="toggleDeleteNotInImportOption()">
                            <span><strong>Update images only</strong> — CSV with just <code>sku</code> and <code>image_url</code> columns (matches by SKU, updates only image)</span>
                        </label>
                        <label id="csvDeleteNotInImportLabel" style="display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; margin-left: 0; cursor: pointer; font-size: 14px; color: #1a1a1a;">
                            <input type="checkbox" id="csvDeleteNotInImport" style="width: 18px; height: 18px; accent-color: #DC2626;">
                            <span><strong>Delete products not in this import</strong> — Remove any existing products whose SKU is not in the CSV (full catalog replace)</span>
                        </label>
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <button onclick="importCSV()" id="csvImportBtn" disabled style="background: #111111; color: #ffffff; border: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: not-allowed; opacity: 0.5; display: flex; align-items: center; gap: 8px;" onmouseover="if(!this.disabled) this.style.background='#1F2933';" onmouseout="if(!this.disabled) this.style.background='#111111';">
                        <i class="fas fa-upload"></i> Import Products
                    </button>
                    <button onclick="exportProductsToCSV()" style="background: #6B7280; color: #ffffff; border: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#4B5563';" onmouseout="this.style.background='#6B7280';">
                        <i class="fas fa-download"></i> Export Current Products
                    </button>
                    <a href="/products-template.csv" download style="background: #F9FAFB; color: #111111; border: 2px solid #E5E7EB; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#F3F4F6'; this.style.borderColor='#D1D5DB';" onmouseout="this.style.background='#F9FAFB'; this.style.borderColor='#E5E7EB';">
                        <i class="fas fa-file-alt"></i> Download Template
                    </a>
                    <div id="csvImportStatus" style="flex: 1; min-width: 200px;"></div>
                </div>
                
                <div style="margin-top: 24px; padding: 16px; background: #F9FAFB; border-radius: 8px; border-left: 4px solid #FF7A00;">
                    <h4 style="font-size: 14px; font-weight: 600; color: #111111; margin-bottom: 8px;">CSV Format Requirements:</h4>
                    <ul style="color: #4B5563; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px; margin-bottom: 12px;">
                        <li><strong>Flexible columns:</strong> Many header names accepted (e.g. manufacturer/brand, sizing/sizes/size, colour/color, product name/name)</li>
                        <li><strong>Required:</strong> One column for SKU, one for name, one for brand (or manufacturer), one for material, one for price</li>
                        <li><strong>No duplicates:</strong> Rows with the same SKU update the existing product; duplicate SKUs in the file are skipped</li>
                        <li><strong>Product images:</strong> Include the <code>image_url</code> column so images show on product cards and detail pages. Use a full URL (e.g. https://example.com/image.jpg or https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Product) or a site-relative path like <code>/images/products/yourfile.jpg</code> (upload image files to your server’s <code>public/images/products/</code> folder first).</li>
                        <li><strong>Basic product info:</strong> subcategory, description, sizes (comma-separated: S,M,L,XL), color, pack_qty, case_qty, bulk_price, image_url, in_stock (1/0), featured (1/0)</li>
                        <li><strong>Filter fields (for better search/filtering):</strong>
                            <ul style="margin-top: 8px; padding-left: 20px;">
                                <li><strong>powder:</strong> Powder-Free or Powdered</li>
                                <li><strong>thickness:</strong> mil value (e.g., 4, 5, 6, 7)</li>
                                <li><strong>grade:</strong> Medical / Exam Grade, Industrial Grade, Food Service Grade</li>
                                <li><strong>useCase:</strong> Comma-separated industries (e.g., Healthcare,Food Service,Automotive)</li>
                                <li><strong>certifications:</strong> Comma-separated (e.g., FDA Approved,ASTM Tested,Food Safe)</li>
                                <li><strong>texture:</strong> Smooth, Fingertip Textured, Fully Textured</li>
                                <li><strong>cuffStyle:</strong> Beaded Cuff, Non-Beaded, Extended Cuff</li>
                                <li><strong>sterility:</strong> Sterile, Non-Sterile</li>
                            </ul>
                        </li>
                        <li>First row must be headers (exactly as shown in export)</li>
                        <li>Values with commas should be wrapped in quotes</li>
                        <li>Boolean values: Use 1 for true, 0 for false (in_stock, featured)</li>
                    </ul>
                    <p style="color: #4B5563; font-size: 12px; margin-top: 8px; font-style: italic;">
                        💡 <strong>Pro Tip:</strong> Export your current products first to see the exact format, then use that as a template for adding new products!
                    </p>
                </div>
            </div>
            
            <div id="addProductSection" style="display: none; background: #f9f9f9; padding: 32px; border-radius: 12px; margin-bottom: 24px;">
                <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 24px;">
                    <i class="fas fa-plus-circle" style="color: #FF7A00; margin-right: 8px;"></i>
                    Add New Product
                </h3>
                <form id="addProductForm" onsubmit="addProduct(event)">
                    <div class="form-group" style="grid-column: 1 / -1; margin-bottom: 20px;">
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Add Product by URL</label>
                        <p style="font-size: 12px; color: #6B7280; margin-bottom: 8px;">Paste a product page URL to auto-fill details and images, or a direct image/PDF URL to use as the product image.</p>
                        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                            <input type="url" id="addProductByUrlInput" placeholder="https://example.com/product-page or https://.../image.jpg" style="flex: 1; min-width: 200px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                            <button type="button" id="addProductByUrlBtn" onclick="fetchProductByUrl()" style="background: #FF7A00; color: #fff; border: none; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                                <i class="fas fa-link"></i> Fetch
                            </button>
                        </div>
                        <div id="addProductByUrlStatus" style="margin-top: 10px; font-size: 13px; min-height: 20px;"></div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">SKU *</label>
                            <input type="text" id="productSku" required placeholder="GLV-BRAND-001" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Product Name *</label>
                            <input type="text" id="productName" required placeholder="Product Name" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Brand *</label>
                            <input type="text" id="productBrand" required placeholder="Hospeco, Global Glove, etc." style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Category *</label>
                            <select id="productCategory" required style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                                <option value="Disposable Gloves">Disposable Gloves</option>
                                <option value="Work Gloves">Reusable Work Gloves</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Subcategory</label>
                            <div id="addProductSubcategoryChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('subcategories', 'addProductSubcategoryChips')}</div>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Material *</label>
                            <div id="addProductMaterialChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('materials', 'addProductMaterialChips')}</div>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Color</label>
                            <div id="addProductColorChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('colors', 'addProductColorChips')}</div>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Sizes</label>
                            <div id="addProductSizes" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormSizesHTML()}</div>
                            <span style="font-size:11px; color:#6B7280;">Select all sizes for this product. Variant SKUs: MainSKU-Size (e.g. GLV-500G-S).</span>
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Pack Qty (per box)</label>
                            <input type="number" id="productPackQty" value="100" min="1" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Case Qty</label>
                            <input type="number" id="productCaseQty" value="1000" min="1" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Case Weight (lbs)</label>
                            <input type="number" id="productCaseWeight" min="0" step="0.1" placeholder="e.g. 25" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Case Length (in)</label>
                            <input type="number" id="productCaseLength" min="0" step="0.1" placeholder="L" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Case Width (in)</label>
                            <input type="number" id="productCaseWidth" min="0" step="0.1" placeholder="W" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Case Height (in)</label>
                            <input type="number" id="productCaseHeight" min="0" step="0.1" placeholder="H" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Powder</label>
                            <select id="productPowder" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">${buildAddFormSelectOptions('powders')}</select>
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Thickness (mil)</label>
                            <select id="productThickness" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">${buildAddFormSelectOptions('thicknesses')}</select>
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Sterility</label>
                            <select id="productSterility" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">${buildAddFormSelectOptions('sterilities')}</select>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Grade</label>
                            <div id="addProductGradeChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('grades', 'addProductGradeChips')}</div>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Use case / Industries</label>
                            <div id="addProductUseCaseChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('useCases', 'addProductUseCaseChips')}</div>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Certifications</label>
                            <div id="addProductCertificationsChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('certifications', 'addProductCertificationsChips')}</div>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Texture</label>
                            <div id="addProductTextureChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('textures', 'addProductTextureChips')}</div>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Cuff style</label>
                            <div id="addProductCuffStyleChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${buildAddFormChipsHTML('cuffStyles', 'addProductCuffStyleChips')}</div>
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Price (Retail) *</label>
                            <input type="text" id="productPrice" inputmode="decimal" required placeholder="12.99 or 10/.6" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;" onblur="evaluatePriceInput(this)">
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Bulk Price (B2B)</label>
                            <input type="text" id="productBulkPrice" inputmode="decimal" placeholder="9.99 or 10/.6" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;" onblur="evaluatePriceInput(this)">
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Primary Image URL</label>
                            <input type="url" id="productImageUrl" placeholder="https://example.com/image.jpg" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Additional Image URLs (one per line)</label>
                            <textarea id="productAdditionalImages" rows="3" placeholder="https://example.com/image2.jpg&#10;https://example.com/image3.jpg" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; font-family: inherit;"></textarea>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Video URL (YouTube or direct .mp4)</label>
                            <input type="url" id="productVideoUrl" placeholder="https://www.youtube.com/watch?v=... or https://example.com/video.mp4" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1a1a1a;">Description</label>
                            <textarea id="productDescription" rows="6" placeholder="Product description..." style="width: 100%; min-height: 140px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; font-family: inherit;"></textarea>
                        </div>
                    </div>
                    <div style="display: flex; gap: 16px; align-items: center; margin-top: 24px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="productInStock" checked>
                            <span>In Stock</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="productFeatured">
                            <span>Featured Product</span>
                        </label>
                    </div>
                    <div style="margin-top: 32px; display: flex; gap: 16px;">
                        <button type="submit" style="background: #FF7A00; color: #ffffff; border: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-save"></i> Add Product
                        </button>
                        <button type="button" onclick="hideAddProductForm()" style="background: #f5f5f5; color: #1a1a1a; border: 2px solid #e0e0e0; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
            
            <div id="adminProductsBatchBar" style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px; padding: 12px 16px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: #374151;">
                    <input type="checkbox" id="adminProductsSelectAll" style="width: 18px; height: 18px; accent-color: #DC2626;" onchange="adminProductsToggleSelectAll()">
                    <span>Select all on this page</span>
                </label>
                <button type="button" onclick="batchDeleteProducts()" id="adminProductsBatchDeleteBtn" disabled style="background: #9CA3AF; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: not-allowed;">
                    <i class="fas fa-trash-alt" style="margin-right: 6px;"></i>Delete selected
                </button>
                <span id="adminProductsSelectedCount" style="color: #4B5563; font-size: 14px;"></span>
            </div>
            <div id="adminProductsGridWrapper">
                <div id="adminProductsGrid" style="display: grid; gap: 16px;">
                    ${gridHTML}
                </div>
                ${paginationHTML}
            </div>
            
            <div id="editProductModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; overflow:auto; padding:24px;" onclick="if(event.target===this) closeEditProductModal()">
                <div id="editProductModalContent" style="max-width:720px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; margin-bottom:40px; box-shadow:0 20px 60px rgba(0,0,0,0.3);"></div>
            </div>
        `;
        populateExportFilters(products);
        populateAdminListFilters(products);
        adminProductsUpdateFilterSummary();
        initCSVDropZone();
    } catch (error) {
        content.innerHTML = `<div style="color: #d32f2f; padding: 20px; background: #ffebee; border-radius: 8px;">Error loading products: ${error.message}</div>`;
    }
}

function initCSVDropZone() {
    const dropZone = document.getElementById('csvDropZone');
    const fileInput = document.getElementById('csvFileInput');
    if (!dropZone || !fileInput) return;

    function highlight() {
        dropZone.classList.add('csv-drop-zone-active');
        dropZone.style.borderColor = '#FF7A00';
        dropZone.style.background = '#fffaf5';
    }
    function unhighlight() {
        dropZone.classList.remove('csv-drop-zone-active');
        dropZone.style.borderColor = '';
        dropZone.style.background = '';
    }

    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        highlight();
        e.dataTransfer.dropEffect = 'copy';
    });
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        unhighlight();
    });
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        unhighlight();
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!file.name || !file.name.toLowerCase().endsWith('.csv')) {
            showToast('Please drop a CSV file', 'error');
            return;
        }
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// Filter options used on the shop page – same values so product edit multi-selects match filtering
const EDIT_FILTER_OPTIONS = {
    categories: ['Disposable Gloves', 'Work Gloves'],
    subcategories: ['Fentanyl Protected', 'Chemo-Approved', 'Heat Resistant', 'Impact Resistant', 'Puncture Resistant', 'Cut Resistant', 'Coated', 'Insulated', 'Chemical Resistant', 'General Purpose'],
    materials: ['Nitrile', 'Latex', 'Vinyl', 'Polyethylene (PE)'],
    powders: ['Powder-Free', 'Powdered'],
    thicknesses: ['2', '3', '4', '5', '6', '7+'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Blue', 'Black', 'White', 'Clear', 'Orange', 'Purple', 'Green', 'Natural', 'Gray', 'Tan', 'Yellow'],
    grades: ['Medical / Exam Grade', 'Industrial Grade', 'Food Service Grade'],
    useCases: ['Healthcare', 'Food Service', 'Food Processing', 'Janitorial', 'Sanitation', 'Laboratories', 'Pharmaceuticals', 'Beauty & Personal Care', 'Tattoo & Body Art', 'Automotive', 'Education', 'Childcare', 'Cannabis', 'Construction', 'Trades (Electricians, HVAC, Plumbing)', 'Manufacturing', 'Industrial', 'Warehousing', 'Logistics', 'Distribution', 'Transportation', 'Utilities', 'Energy', 'Agriculture', 'Landscaping', 'Mining', 'Heavy Industry', 'Public Works', 'Municipal Services', 'Waste Management', 'Recycling', 'Environmental Services'],
    certifications: [
        'Food Safe',
        'FDA Approved',
        'Complies with FDA CFR Title 21 Part 177 (Indirect Food Additive)',
        'Meets ASTM D6319',
        'Latex Free',
        'EN 455',
        'EN 374',
        'Chemo Rated / Chemo-Therapy',
        'Protection against Fentanyl',
        'Fentanyl Resistant',
        'Cut Resistance A1', 'Cut Resistance A2', 'Cut Resistance A3', 'Cut Resistance A4', 'Cut Resistance A5', 'Cut Resistance A6', 'Cut Resistance A7', 'Cut Resistance A8', 'Cut Resistance A9',
        'Puncture Resistance Level 1', 'Puncture Resistance Level 2', 'Puncture Resistance Level 3', 'Puncture Resistance Level 4', 'Puncture Resistance Level 5',
        'ASTM F2992 (Cut)', 'ASTM F1342 (Puncture)', 'ANSI/ISEA 105 (Cut)'
    ],
    textures: ['Smooth', 'Fingertip Textured', 'Fully Textured'],
    cuffStyles: ['Beaded Cuff', 'Non-Beaded', 'Extended Cuff'],
    sterilities: ['Non-Sterile', 'Sterile']
};

function buildAddFormChipsHTML(optionKey, containerId) {
    const options = EDIT_FILTER_OPTIONS[optionKey];
    if (!Array.isArray(options)) return '';
    const escape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const baseStyle = 'padding:8px 14px; border:2px solid #e0e0e0; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; background:#fff; color:#374151;';
    return options.map(v => `<button type="button" class="edit-product-multi-chip" data-value="${escape(v)}" data-container="${escape(containerId)}" style="${baseStyle}">${escape(v)}</button>`).join('');
}
function buildAddFormSizesHTML() {
    const options = EDIT_FILTER_OPTIONS.sizes;
    if (!Array.isArray(options)) return '';
    const escape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const baseStyle = 'padding:8px 14px; border:2px solid #e0e0e0; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; background:#fff; color:#374151;';
    return options.map(v => `<button type="button" class="edit-product-size-chip" data-size="${escape(v)}" style="${baseStyle}">${escape(v)}</button>`).join('');
}
function buildAddFormSelectOptions(optionKey) {
    const options = EDIT_FILTER_OPTIONS[optionKey];
    if (!Array.isArray(options)) return '';
    const escape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return '<option value="">— Select —</option>' + options.map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join('');
}

function buildEditProductFormHTML(product, brands) {
    const p = product || {};
    const brandsList = Array.isArray(brands) ? brands : [];
    const images = Array.isArray(p.images) ? p.images : [];
    const escape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const opt = (arr, current) => {
        const cur = (current || '').trim();
        const inList = cur && arr.includes(cur);
        return '<option value="">— Select —</option>' + arr.map(v => `<option value="${escape(v)}" ${(cur === v) ? 'selected' : ''}>${escape(v)}</option>`).join('') + (cur && !inList ? `<option value="${escape(cur)}" selected>${escape(cur)}</option>` : '');
    };
    // Parse comma/semicolon/space-separated string to array of trimmed non-empty values
    const parseMulti = (str) => (str || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    const multiChip = (options, currentStr, containerId) => {
        const currentArr = parseMulti(currentStr);
        const baseStyle = 'padding:8px 14px; border:2px solid #e0e0e0; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; background:#fff; color:#374151;';
        const selectedStyle = 'background:#FF7A00; border-color:#FF7A00; color:#fff;';
        const optionChips = options.map(v => {
            const selected = currentArr.includes(v);
            return `<button type="button" class="edit-product-multi-chip edit-product-multi-selected-${containerId}${selected ? ' edit-product-multi-selected' : ''}" data-value="${escape(v)}" data-container="${escape(containerId)}" style="${baseStyle}${selected ? selectedStyle : ''}">${escape(v)}</button>`;
        }).join('');
        const extra = currentArr.filter(v => !options.includes(v));
        const extraChips = extra.map(v => `<button type="button" class="edit-product-multi-chip edit-product-multi-selected-${containerId} edit-product-multi-selected" data-value="${escape(v)}" data-container="${escape(containerId)}" style="${baseStyle}${selectedStyle}">${escape(v)}</button>`).join('');
        return optionChips + extraChips;
    };
    const sizeArr = parseMulti(p.sizes);
    const sizesChips = EDIT_FILTER_OPTIONS.sizes.map(v => {
        const selected = sizeArr.includes(v);
        const baseStyle = 'padding:8px 14px; border:2px solid #e0e0e0; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; background:#fff; color:#374151;';
        const selectedStyle = 'background:#FF7A00; border-color:#FF7A00; color:#fff;';
        return `<button type="button" class="edit-product-size-chip${selected ? ' edit-product-size-selected' : ''}" data-size="${escape(v)}" style="${baseStyle}${selected ? selectedStyle : ''}">${escape(v)}</button>`;
    }).join('');
    const thicknessVal = p.thickness != null ? (String(p.thickness) === '7' || p.thickness >= 7 ? '7+' : String(p.thickness)) : '';
    const imagesRows = images.map((url, i) => `
        <div class="edit-image-row" draggable="true" data-index="${i}" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="cursor:grab; color:#9CA3AF;" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>
            <input type="url" value="${escape(url)}" placeholder="Image URL" style="flex:1; padding:8px 12px; border:1px solid #e0e0e0; border-radius:6px;">
            <button type="button" onclick="moveEditImageRow(this,-1)" title="Move up"><i class="fas fa-chevron-up"></i></button>
            <button type="button" onclick="moveEditImageRow(this,1)" title="Move down"><i class="fas fa-chevron-down"></i></button>
            <button type="button" onclick="removeEditImageRow(this)" title="Remove"><i class="fas fa-times" style="color:#dc3545;"></i></button>
        </div>
    `).join('');
    return `
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h2 style="font-size: 22px; font-weight: 700; margin: 0;">Edit Product</h2>
            <button type="button" onclick="closeEditProductModal()" style="background:none; border:none; font-size: 24px; color: #4B5563; cursor: pointer; padding: 4px;">&times;</button>
        </div>
        <form id="editProductForm" onsubmit="saveProductEdit(event)">
            <input type="hidden" id="editProductId" value="${p.id || ''}">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Main SKU</label><input type="text" id="editProductSku" value="${escape(p.sku)}" required placeholder="e.g. GLV-500G" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;" oninput="updateEditVariantSkuPreview()" onchange="updateEditVariantSkuPreview()"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Product Name</label><input type="text" id="editProductName" value="${escape(p.name)}" required style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Brand</label><select id="editProductBrand" required style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"><option value="">— Select —</option>${brandsList.map(b => `<option value="${escape(b)}" ${(p.brand || '') === b ? 'selected' : ''}>${escape(b)}</option>`).join('')}${p.brand && !brandsList.includes(p.brand) ? `<option value="${escape(p.brand)}" selected>${escape(p.brand)}</option>` : ''}</select></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Category</label><select id="editProductCategory" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"><option value="">— Select —</option><option value="Disposable Gloves" ${(p.category || '') === 'Disposable Gloves' ? 'selected' : ''}>Disposable Gloves</option><option value="Work Gloves" ${(p.category || '') === 'Work Gloves' ? 'selected' : ''}>Reusable Work Gloves</option></select></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Subcategory</label><div id="editProductSubcategoryChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.subcategories, p.subcategory, 'editProductSubcategoryChips')}</div></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Material</label><div id="editProductMaterialChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.materials, p.material, 'editProductMaterialChips')}</div></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Color</label><div id="editProductColorChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.colors, p.color, 'editProductColorChips')}</div></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Sizes</label><div id="editProductSizes" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:6px;">${sizesChips}</div><span style="font-size:11px; color:#6B7280;">Select all sizes you want to show. Each size gets a variant SKU: MainSKU-Size (e.g. GLV-500G-S).</span><div id="editVariantSkuPreview" style="margin-top:8px; font-size:12px; color:#6B7280; min-height:20px;"></div></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Pack Qty (per box)</label><input type="number" id="editProductPackQty" value="${p.pack_qty ?? 100}" min="1" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Case Qty</label><input type="number" id="editProductCaseQty" value="${p.case_qty ?? 1000}" min="1" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Case Weight (lbs)</label><input type="number" id="editProductCaseWeight" value="${p.case_weight ?? ''}" min="0" step="0.1" placeholder="e.g. 25" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Case L (in)</label><input type="number" id="editProductCaseLength" value="${p.case_length ?? ''}" min="0" step="0.1" placeholder="Length" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Case W (in)</label><input type="number" id="editProductCaseWidth" value="${p.case_width ?? ''}" min="0" step="0.1" placeholder="Width" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Case H (in)</label><input type="number" id="editProductCaseHeight" value="${p.case_height ?? ''}" min="0" step="0.1" placeholder="Height" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Price (Retail)</label><input type="text" id="editProductPrice" value="${p.price ?? 0}" inputmode="decimal" placeholder="e.g. 12.99 or 10/.6" required style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;" onblur="evaluatePriceInput(this)"></div>
                <div><label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Bulk / B2B Price</label><input type="text" id="editProductBulkPrice" value="${p.bulk_price ?? 0}" inputmode="decimal" placeholder="e.g. 9.99 or 10/.6" style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;" onblur="evaluatePriceInput(this)"></div>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Description</label>
                <textarea id="editProductDescription" rows="8" style="width:100%; min-height: 180px; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px; font-family:inherit;">${escape(p.description)}</textarea>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Primary Image URL</label>
                <input type="url" id="editProductImageUrl" value="${escape(p.image_url)}" placeholder="https://..." style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;">
                <div id="editProductImagePreviewWrap" style="margin-top:12px; min-height:80px;">
                    <img id="editProductImagePreview" src="${escape(p.image_url || '')}" alt="Product" style="max-width:200px; max-height:200px; object-fit:contain; border:1px solid #e0e0e0; border-radius:8px; display:${(p.image_url || '').trim() ? 'block' : 'none'};" onerror="this.style.display='none'; document.getElementById('editProductImagePreviewPlaceholder').style.display='block';" onload="this.style.display='block'; var ph=document.getElementById('editProductImagePreviewPlaceholder'); if(ph) ph.style.display='none';">
                    <span id="editProductImagePreviewPlaceholder" style="display:${(p.image_url || '').trim() ? 'none' : 'block'}; font-size:13px; color:#6B7280;">Enter a URL above to see a preview.</span>
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 8px;">Additional Images <span style="font-weight:400; color:#6B7280;">(drag to reorder)</span></label>
                <div id="editProductImagesList">${imagesRows}</div>
                <button type="button" onclick="addEditImageRow()" style="margin-top:8px; padding:8px 16px; border:2px dashed #e0e0e0; border-radius:8px; background:#f9f9f9; cursor:pointer; font-size: 13px;"><i class="fas fa-plus"></i> Add image URL</button>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Video URL (YouTube or .mp4)</label>
                <input type="url" id="editProductVideoUrl" value="${escape(p.video_url)}" placeholder="https://..." style="width:100%; padding:10px 12px; border:2px solid #e0e0e0; border-radius:8px;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 8px;">Stock &amp; filters</label>
                <div style="display:flex; flex-wrap:wrap; gap: 16px; align-items: center;">
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="editProductInStock" ${p.in_stock ? 'checked' : ''}> In stock</label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="editProductFeatured" ${p.featured ? 'checked' : ''}> Featured</label>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div><label style="display:block; font-size: 12px; margin-bottom: 2px;">Powder</label><select id="editProductPowder" style="width:100%; padding:8px 10px; border:1px solid #e0e0e0; border-radius:6px;">${opt(EDIT_FILTER_OPTIONS.powders, p.powder)}</select></div>
                    <div><label style="display:block; font-size: 12px; margin-bottom: 2px;">Thickness (mil)</label><select id="editProductThickness" style="width:100%; padding:8px 10px; border:1px solid #e0e0e0; border-radius:6px;">${opt(EDIT_FILTER_OPTIONS.thicknesses, thicknessVal)}</select></div>
                    <div><label style="display:block; font-size: 12px; margin-bottom: 2px;">Sterility</label><select id="editProductSterility" style="width:100%; padding:8px 10px; border:1px solid #e0e0e0; border-radius:6px;">${opt(EDIT_FILTER_OPTIONS.sterilities, p.sterility)}</select></div>
                </div>
                <div style="margin-top: 12px;">
                    <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight: 600; margin-bottom: 6px;">Grade</label><div id="editProductGradeChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.grades, p.grade, 'editProductGradeChips')}</div></div>
                    <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight: 600; margin-bottom: 6px;">Use case / Industries</label><div id="editProductUseCaseChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.useCases, p.useCase, 'editProductUseCaseChips')}</div></div>
                    <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight: 600; margin-bottom: 6px;">Certifications</label><div id="editProductCertificationsChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.certifications, p.certifications, 'editProductCertificationsChips')}</div></div>
                    <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight: 600; margin-bottom: 6px;">Texture</label><div id="editProductTextureChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.textures, p.texture, 'editProductTextureChips')}</div></div>
                    <div><label style="display:block; font-size: 12px; font-weight: 600; margin-bottom: 6px;">Cuff style</label><div id="editProductCuffStyleChips" class="edit-product-multi-chips" style="display:flex; flex-wrap:wrap; gap:8px;">${multiChip(EDIT_FILTER_OPTIONS.cuffStyles, p.cuffStyle, 'editProductCuffStyleChips')}</div></div>
                </div>
            </div>
            <div style="display:flex; gap: 12px; margin-top: 24px;">
                <button type="submit" style="background: #FF7A00; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;"><i class="fas fa-save"></i> Save changes</button>
                <button type="button" onclick="closeEditProductModal()" style="background: #f5f5f5; color: #1a1a1a; border: 2px solid #e0e0e0; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;">Cancel</button>
            </div>
        </form>
    `;
}

function updateEditProductImagePreview() {
    const urlInput = document.getElementById('editProductImageUrl');
    const imgEl = document.getElementById('editProductImagePreview');
    const placeholderEl = document.getElementById('editProductImagePreviewPlaceholder');
    if (!urlInput || !imgEl || !placeholderEl) return;
    const url = (urlInput.value || '').trim();
    if (!url) {
        imgEl.style.display = 'none';
        imgEl.removeAttribute('src');
        placeholderEl.style.display = 'block';
        return;
    }
    imgEl.src = url;
    imgEl.style.display = 'block';
    placeholderEl.style.display = 'none';
}

function toggleEditProductSize(btn) {
    if (!btn || !btn.classList) return;
    btn.classList.toggle('edit-product-size-selected');
    updateEditVariantSkuPreview();
}

function getSelectedSizesFromContainer(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('.edit-product-size-chip.edit-product-size-selected')).map(el => el.getAttribute('data-size')).filter(Boolean);
}
function getSelectedEditProductSizes() {
    return getSelectedSizesFromContainer('editProductSizes');
}

function toggleEditProductMultiChip(btn) {
    if (!btn || !btn.classList) return;
    btn.classList.toggle('edit-product-multi-selected');
}
// Delegated click handler so Add Product chips work (they have no inline onclick)
function initChipClickDelegation() {
    document.body.addEventListener('click', function chipClickHandler(e) {
        const multi = e.target && e.target.closest && e.target.closest('.edit-product-multi-chip');
        if (multi) {
            multi.classList.toggle('edit-product-multi-selected');
            e.preventDefault();
            return;
        }
        const size = e.target && e.target.closest && e.target.closest('.edit-product-size-chip');
        if (size) {
            size.classList.toggle('edit-product-size-selected');
            if (typeof updateEditVariantSkuPreview === 'function') updateEditVariantSkuPreview();
            e.preventDefault();
        }
    });
}
if (typeof document !== 'undefined' && document.body) {
    initChipClickDelegation();
} else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initChipClickDelegation);
}

function getSelectedEditProductMulti(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('.edit-product-multi-chip.edit-product-multi-selected')).map(el => el.getAttribute('data-value')).filter(Boolean);
}

function updateEditVariantSkuPreview() {
    const mainSkuEl = document.getElementById('editProductSku');
    const previewEl = document.getElementById('editVariantSkuPreview');
    if (!mainSkuEl || !previewEl) return;
    const mainSku = (mainSkuEl.value || '').trim();
    const selectedSizes = getSelectedEditProductSizes();
    if (!mainSku) { previewEl.innerHTML = ''; return; }
    if (selectedSizes.length === 0) { previewEl.innerHTML = 'Select sizes above to see variant SKUs.'; return; }
    const variants = selectedSizes.map(s => `${s} → <strong>${mainSku}-${s}</strong>`).join(' &nbsp; ');
    previewEl.innerHTML = 'Variant SKUs: ' + variants;
}

function addEditImageRow() {
    const list = document.getElementById('editProductImagesList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'edit-image-row';
    row.draggable = true;
    row.setAttribute('data-index', String(list.children.length));
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:8px;';
    row.innerHTML = '<span style="cursor:grab; color:#9CA3AF;" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span><input type="url" placeholder="Image URL" style="flex:1; padding:8px 12px; border:1px solid #e0e0e0; border-radius:6px;"><button type="button" onclick="moveEditImageRow(this,-1)" title="Move up"><i class="fas fa-chevron-up"></i></button><button type="button" onclick="moveEditImageRow(this,1)" title="Move down"><i class="fas fa-chevron-down"></i></button><button type="button" onclick="removeEditImageRow(this)" title="Remove"><i class="fas fa-times" style="color:#dc3545;"></i></button>';
    row.ondragstart = (e) => { e.dataTransfer.setData('text/plain', row.dataset.index); e.dataTransfer.effectAllowed = 'move'; };
    row.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('edit-image-drag-over'); };
    row.ondragleave = () => row.classList.remove('edit-image-drag-over');
    row.ondrop = (e) => { e.preventDefault(); row.classList.remove('edit-image-drag-over'); const from = document.querySelector('.edit-image-row[data-index="' + e.dataTransfer.getData('text/plain') + '"]'); if (from && from !== row) list.insertBefore(from, row); };
    list.appendChild(row);
}

function removeEditImageRow(btn) {
    const row = btn.closest('.edit-image-row');
    if (row) row.remove();
}

function moveEditImageRow(btn, dir) {
    const row = btn.closest('.edit-image-row');
    const list = document.getElementById('editProductImagesList');
    if (!row || !list) return;
    const idx = Array.from(list.children).indexOf(row);
    const next = dir === -1 ? list.children[idx - 1] : list.children[idx + 1];
    if (next) list.insertBefore(row, dir === -1 ? next : next.nextSibling);
}

/** Safe eval for price fields: e.g. "10/.6" -> 16.67. Only numbers and + - * / ( ) allowed. */
function evaluatePriceExpression(str) {
    var s = (str || '').trim().replace(/\s+/g, '');
    if (!s) return null;
    if (!/^[\d.+\-*/()]+$/.test(s)) return null;
    try {
        var result = Function('"use strict"; return (' + s + ')')();
        return typeof result === 'number' ? result : null;
    } catch (e) { return null; }
}

/** On blur: if value looks like a math expression, replace with result (2 decimals). */
function evaluatePriceInput(inputEl) {
    if (!inputEl || !inputEl.value) return;
    var s = inputEl.value.trim();
    if (!s) return;
    if (/^[\d.]+$/.test(s)) return;
    var num = evaluatePriceExpression(s);
    if (num !== null && !isNaN(num) && isFinite(num) && num >= 0) {
        inputEl.value = Number(num).toFixed(2);
    }
}

function closeEditProductModal() {
    const modal = document.getElementById('editProductModal');
    if (modal) modal.style.display = 'none';
}

function showAddProductForm() {
    const section = document.getElementById('addProductSection');
    if (section) section.style.display = 'block';
    hideCSVImportSection();
    const statusEl = document.getElementById('addProductByUrlStatus');
    if (statusEl) statusEl.innerHTML = '';
    window.addProductParseResult = null;
}

function hideAddProductForm() {
    const section = document.getElementById('addProductSection');
    if (section) {
        section.style.display = 'none';
        document.getElementById('addProductForm')?.reset();
        const statusEl = document.getElementById('addProductByUrlStatus');
        if (statusEl) statusEl.innerHTML = '';
    }
    window.addProductParseResult = null;
}

function populateExportFilters(products) {
    const brandEl = document.getElementById('exportFilterBrand');
    if (!brandEl || !products || !Array.isArray(products)) return;
    const brands = [...new Set(products.map(p => (p.brand || '').trim()).filter(Boolean))].sort();
    brandEl.innerHTML = '<option value="">All manufacturers</option>' + brands.map(b => '<option value="' + (b || '').replace(/"/g, '&quot;') + '">' + (b || '').replace(/</g, '&lt;') + '</option>').join('');
}

function getExportFilters() {
    const brandEl = document.getElementById('exportFilterBrand');
    const categoryEl = document.getElementById('exportFilterCategory');
    const colorsEl = document.getElementById('exportFilterColors');
    const materialsEl = document.getElementById('exportFilterMaterials');
    return {
        brand: (brandEl && brandEl.value) || '',
        category: (categoryEl && categoryEl.value) || '',
        colors: colorsEl ? Array.from(colorsEl.selectedOptions).map(o => o.value) : [],
        materials: materialsEl ? Array.from(materialsEl.selectedOptions).map(o => o.value) : []
    };
}

function applyExportFilters(products, filters) {
    if (!products || !Array.isArray(products)) return [];
    let list = products;
    if (filters.brand) {
        list = list.filter(p => (p.brand || '').trim() === filters.brand);
    }
    if (filters.category) {
        list = list.filter(p => (p.category || '').trim() === filters.category);
    }
    if (filters.colors && filters.colors.length > 0) {
        const colorSet = new Set(filters.colors.map(c => (c || '').toLowerCase()));
        list = list.filter(p => {
            const productColors = (p.color || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
            return productColors.some(c => colorSet.has(c)) || (productColors.length === 0 && colorSet.has((p.color || '').trim().toLowerCase()));
        });
    }
    if (filters.materials && filters.materials.length > 0) {
        const matSet = new Set(filters.materials.map(m => (m || '').toLowerCase()));
        list = list.filter(p => {
            const productMaterials = (p.material || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
            return productMaterials.some(m => matSet.has(m)) || (productMaterials.length === 0 && matSet.has((p.material || '').trim().toLowerCase()));
        });
    }
    return list;
}

async function exportProductsToCSV() {
    try {
        showToast('Creating CSV export...', 'info');
        const filters = getExportFilters();
        const params = new URLSearchParams();
        if (filters.brand) params.set('brand', filters.brand);
        if (filters.category) params.set('category', filters.category);
        if (filters.colors && filters.colors.length) params.set('colors', filters.colors.join(','));
        if (filters.materials && filters.materials.length) params.set('materials', filters.materials.join(','));
        const qs = params.toString();
        const url = api.baseUrl + '/api/products/export.csv' + (qs ? '?' + qs : '');
        const response = await fetch(url, { headers: api.getHeaders() });
        if (!response.ok) {
            const text = await response.text();
            let errMsg = text;
            try { const j = JSON.parse(text); if (j.error) errMsg = j.error; } catch (_) {}
            if (response.status === 403) errMsg = 'Please log in as an admin to export CSV.';
            throw new Error(errMsg || 'Export failed');
        }
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || `glovecubs-products-export-${new Date().toISOString().split('T')[0]}.csv`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        showToast('Products CSV created and downloaded.', 'success');
    } catch (error) {
        console.error('Export error:', error);
        if (state.user && state.user.is_approved) {
            try {
                showToast('Server export failed. Building CSV in browser...', 'info');
                const filters = getExportFilters();
                let url = '/api/products';
                const q = [];
                if (filters.brand) q.push('brand=' + encodeURIComponent(filters.brand));
                if (filters.category) q.push('category=' + encodeURIComponent(filters.category));
                if (filters.colors && filters.colors.length) q.push('colors=' + encodeURIComponent(filters.colors.join(',')));
                if (filters.materials && filters.materials.length) q.push('materials=' + encodeURIComponent(filters.materials.join(',')));
                if (q.length) url += '?' + q.join('&');
                const products = await api.get(url);
                const list = Array.isArray(products) ? products : (products && products.products) || [];
                if (list.length === 0) {
                    showToast('No products match the current filters.', 'error');
                    return;
                }
                downloadCSV(list, 'glovecubs-products');
                showToast('Products CSV created and downloaded.', 'success');
                return;
            } catch (fallbackErr) {
                console.error('Fallback export error:', fallbackErr);
            }
        }
        const msg = error.message || 'Export failed';
        showToast(msg.startsWith('Please log in') ? msg : 'Error exporting CSV: ' + msg, 'error');
    }
}

function downloadCSV(products, exportName) {
    const date = new Date().toISOString().split('T')[0];
    const safeName = (exportName || 'glovecubs-products').replace(/[\s\/\\:*?"<>|]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'glovecubs-products';
    const filename = `${safeName}-export-${date}.csv`;

    // Headers match server export and importer mapping (round-trip safe). No internal id; manufacturer_id allowed.
    const headers = [
        'sku', 'name', 'brand', 'cost', 'image_url', 'manufacturer_id', 'manufacturer_name',
        'category', 'subcategory', 'description', 'material', 'powder', 'thickness', 'sizes', 'color',
        'grade', 'useCase', 'certifications', 'texture', 'cuffStyle', 'sterility',
        'pack_qty', 'case_qty', 'bulk_price', 'in_stock', 'featured', 'industry'
    ];

    const csvRows = [headers.join(',')];

    products.forEach(function (product) {
        const cost = product.cost != null && product.cost !== '' ? Number(product.cost) : (product.price != null ? Number(product.price) : 0);
        const row = [
            escapeCSV(product.sku || ''),
            escapeCSV(product.name || ''),
            escapeCSV(product.brand || ''),
            cost,
            escapeCSV(product.image_url || ''),
            product.manufacturer_id != null && product.manufacturer_id !== '' ? product.manufacturer_id : '',
            escapeCSV(product.manufacturer_name || ''),
            escapeCSV(product.category || ''),
            escapeCSV(product.subcategory || ''),
            escapeCSV(product.description || ''),
            escapeCSV(product.material || ''),
            escapeCSV(product.powder || ''),
            product.thickness ?? '',
            escapeCSV(product.sizes || ''),
            escapeCSV(product.color || ''),
            escapeCSV(product.grade || ''),
            escapeCSV(product.useCase || ''),
            escapeCSV(product.certifications || ''),
            escapeCSV(product.texture || ''),
            escapeCSV(product.cuffStyle || ''),
            escapeCSV(product.sterility || ''),
            product.pack_qty ?? 100,
            product.case_qty ?? 1000,
            product.bulk_price ?? 0,
            product.in_stock ? 1 : 0,
            product.featured ? 1 : 0,
            escapeCSV(product.industry || '')
        ];
        csvRows.push(row.join(','));
    });
    
    // Create CSV content
    const csvContent = csvRows.join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast(`Successfully exported ${products.length} products to CSV!`, 'success');
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
    }
    return stringValue;
}

function showCSVImportSection() {
    const section = document.getElementById('csvImportSection');
    if (section) section.style.display = 'block';
    hideAddProductForm();
    toggleDeleteNotInImportOption();
}

function hideCSVImportSection() {
    const section = document.getElementById('csvImportSection');
    if (section) {
        section.style.display = 'none';
        // Reset file input
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) {
            fileInput.value = '';
            const fileName = document.getElementById('csvFileName');
            const importBtn = document.getElementById('csvImportBtn');
            if (fileName) fileName.textContent = 'No file selected';
            if (importBtn) {
                importBtn.disabled = true;
                importBtn.style.opacity = '0.5';
                importBtn.style.cursor = 'not-allowed';
            }
        }
    }
}

function toggleDeleteNotInImportOption() {
    const imagesOnly = document.getElementById('csvUpdateImagesOnly');
    const deleteCb = document.getElementById('csvDeleteNotInImport');
    const deleteLabel = document.getElementById('csvDeleteNotInImportLabel');
    if (!imagesOnly || !deleteCb) return;
    if (imagesOnly.checked) {
        deleteCb.checked = false;
        deleteCb.disabled = true;
        if (deleteLabel) deleteLabel.style.opacity = '0.5';
    } else {
        deleteCb.disabled = false;
        if (deleteLabel) deleteLabel.style.opacity = '1';
    }
}

function handleCSVFileSelect(event) {
    const file = event.target.files[0];
    const fileName = document.getElementById('csvFileName');
    const importBtn = document.getElementById('csvImportBtn');
    
    if (file) {
        if (file.name.toLowerCase().endsWith('.csv')) {
            if (fileName) {
                fileName.textContent = `Selected: ${file.name}`;
                fileName.style.color = '#111111';
                fileName.style.fontWeight = '600';
            }
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.style.opacity = '1';
                importBtn.style.cursor = 'pointer';
            }
        } else {
            if (fileName) {
                fileName.textContent = 'Please select a CSV file';
                fileName.style.color = '#d32f2f';
            }
            if (importBtn) {
                importBtn.disabled = true;
                importBtn.style.opacity = '0.5';
                importBtn.style.cursor = 'not-allowed';
            }
            showToast('Please select a CSV file', 'error');
        }
    }
}

async function importCSV() {
    const fileInput = document.getElementById('csvFileInput');
    const statusDiv = document.getElementById('csvImportStatus');
    const importBtn = document.getElementById('csvImportBtn');
    
    if (!fileInput || !fileInput.files[0]) {
        showToast('Please select a CSV file first', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    
    // Show loading state
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
    }
    if (statusDiv) {
        statusDiv.innerHTML = '<span style="color: #4B5563;"><i class="fas fa-spinner fa-spin"></i> Processing CSV file...</span>';
    }
    
    try {
        // Read file as text
        const fileText = await file.text();
        const updateImagesOnly = document.getElementById('csvUpdateImagesOnly')?.checked;
        
        // Send to backend API (full import or images-only update)
        const endpoint = updateImagesOnly ? '/api/products/update-images-csv' : '/api/products/import-csv';
        const deleteNotInImport = !updateImagesOnly && (document.getElementById('csvDeleteNotInImport')?.checked === true);
        const body = updateImagesOnly ? { csvContent: fileText } : { csvContent: fileText, deleteNotInImport };
        const response = await api.post(endpoint, body);
        
        // Show success (and debug if no changes)
        if (updateImagesOnly) {
            const msg = response.message || `Updated images for ${response.updated || 0} product(s).`;
            let html = `<span style="color: #28a745;"><i class="fas fa-check-circle"></i> ${msg}</span>`;
            if (response.debug) {
                const d = response.debug;
                html += `<div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; font-size: 12px; color: #0c4a6e; text-align: left;">`;
                html += `<strong>Why no updates?</strong><br>Headers seen: ${(d.headers || d.headersLower || []).join(', ')}<br>`;
                html += `First row SKU: "${d.firstRowSku || ''}" | Image URL (first 60 chars): ${(d.firstRowImageUrl || '') || '(empty)'}<br>`;
                if (d.dbSkuSample) html += `Your DB SKUs (sample): ${d.dbSkuSample.join(', ')}`;
                html += `</div>`;
            }
            if (statusDiv) statusDiv.innerHTML = html;
            showToast(msg, 'success');
        } else {
            window.lastImportResult = response;
            const parsedRows = response.parsedRows != null ? response.parsedRows : (response.dataRowCount != null ? response.dataRowCount : 0);
            const created = response.created != null ? response.created : 0;
            const updated = response.updated != null ? response.updated : 0;
            const skipped = response.skipped != null ? response.skipped : 0;
            const failed = response.failed != null ? response.failed : 0;
            const deleted = response.deleted != null ? response.deleted : 0;
            const withImage = response.withImage != null ? response.withImage : null;
            const errorSamples = response.errorSamples || [];
            const hasErrors = failed > 0;
            const msg = response.message || 'Import finished.';
            if (statusDiv) {
                const iconColor = hasErrors ? '#d97706' : '#28a745';
                const iconClass = hasErrors ? 'fa-exclamation-triangle' : 'fa-check-circle';
                let html = `<span style="color: ${iconColor};"><i class="fas ${iconClass}"></i> ${msg}</span>`;
                html += ` <button type="button" onclick="showImportResultsModal()" style="margin-left: 12px; padding: 6px 14px; background: #111; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Import Results</button>`;
                if (withImage !== null && withImage !== undefined) {
                    html += `<div style="margin-top: 8px; font-size: 13px; color: #6B7280;">${withImage ? withImage + ' row(s) had image URLs.' : 'No image_url values in CSV.'}</div>`;
                }
                if (response.debug) {
                    const d = response.debug;
                    html += `<div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; font-size: 12px; color: #0c4a6e; text-align: left;">`;
                    html += `<strong>Why no changes?</strong><br>Headers (${d.headerCount || 0}): ${(d.headers || []).join(', ')}<br>`;
                    html += `First row SKU: "${d.firstRowSku || ''}" | Name: "${d.firstRowName || ''}"<br>`;
                    html += `Delimiter: ${d.delimiterUsed || 'comma'}`;
                    html += `</div>`;
                }
                statusDiv.innerHTML = html;
            }
            if (hasErrors) {
                showToast(msg + ' Open Import Results for details.', 'error');
            } else {
                showToast(msg, 'success');
            }
        }
        
        // Reset form
        fileInput.value = '';
        const fileName = document.getElementById('csvFileName');
        if (fileName) fileName.textContent = 'No file selected';
        if (importBtn) {
            importBtn.innerHTML = '<i class="fas fa-upload"></i> Import Products';
            importBtn.disabled = true;
            importBtn.style.opacity = '0.5';
            importBtn.style.cursor = 'not-allowed';
        }
        
        // Reload products list
        setTimeout(() => {
            loadAdminProducts();
        }, 1000);
        
    } catch (error) {
        console.error('CSV import error:', error);
        if (statusDiv) {
            statusDiv.innerHTML = `<span style="color: #d32f2f;"><i class="fas fa-exclamation-circle"></i> Error: ${error.message || 'Failed to import CSV'}</span>`;
        }
        showToast('Error importing CSV: ' + (error.message || 'Please check the file format'), 'error');
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = '<i class="fas fa-upload"></i> Import Products';
        }
    }
}

function showImportResultsModal() {
    const r = window.lastImportResult;
    const existing = document.getElementById('importResultsModalOverlay');
    if (existing) existing.remove();
    if (!r) {
        showToast('No import result available. Run an import first.', 'error');
        return;
    }
    const parsedRows = (r && r.parsedRows != null) ? r.parsedRows : (r && r.dataRowCount != null ? r.dataRowCount : 0);
    const created = (r && r.created != null) ? r.created : 0;
    const updated = (r && r.updated != null) ? r.updated : 0;
    const failed = (r && r.failed != null) ? r.failed : 0;
    const skipped = (r && r.skipped != null) ? r.skipped : 0;
    const deleted = (r && r.deleted != null) ? r.deleted : 0;
    const errorSamples = (r && r.errorSamples) ? r.errorSamples : [];
    const hasErrors = failed > 0;
    const rows = errorSamples.map(function (e) {
        const sku = (e.sku || '').toString().replace(/</g, '&lt;');
        const msg = (e.message || '').replace(/</g, '&lt;');
        return '<tr><td>' + (e.row || '') + '</td><td>' + sku + '</td><td>' + msg + '</td></tr>';
    }).join('');
    const overlay = document.createElement('div');
    overlay.id = 'importResultsModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;';
    overlay.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<div style="padding:24px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">' +
        '<h2 style="margin:0;font-size:20px;font-weight:700;color:#111;">Import Results</h2>' +
        '<button type="button" onclick="document.getElementById(\'importResultsModalOverlay\').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#6B7280;">&times;</button></div>' +
        '<div style="padding:24px;">' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">' +
        '<div style="padding:12px;background:#f3f4f6;border-radius:8px;"><div style="font-size:12px;color:#6B7280;">Parsed rows</div><div style="font-size:20px;font-weight:700;">' + parsedRows + '</div></div>' +
        '<div style="padding:12px;background:#d1fae5;border-radius:8px;"><div style="font-size:12px;color:#065f46;">Created</div><div style="font-size:20px;font-weight:700;color:#059669;">' + created + '</div></div>' +
        '<div style="padding:12px;background:#dbeafe;border-radius:8px;"><div style="font-size:12px;color:#1e40af;">Updated</div><div style="font-size:20px;font-weight:700;color:#2563eb;">' + updated + '</div></div>' +
        '<div style="padding:12px;background:' + (hasErrors ? '#fee2e2' : '#f3f4f6') + ';border-radius:8px;"><div style="font-size:12px;color:' + (hasErrors ? '#991b1b' : '#6B7280') + ';">Failed</div><div style="font-size:20px;font-weight:700;color:' + (hasErrors ? '#dc2626' : '#374151') + ';">' + failed + '</div></div>' +
        '<div style="padding:12px;background:#f3f4f6;border-radius:8px;"><div style="font-size:12px;color:#6B7280;">Skipped</div><div style="font-size:20px;font-weight:700;">' + skipped + '</div></div>' +
        '<div style="padding:12px;background:#f3f4f6;border-radius:8px;"><div style="font-size:12px;color:#6B7280;">Deleted</div><div style="font-size:20px;font-weight:700;">' + deleted + '</div></div>' +
        '</div>' +
        (rows ? '<h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Error samples (max 20)</h3><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="border-bottom:2px solid #e5e7eb;"><th style="text-align:left;padding:8px;">Row</th><th style="text-align:left;padding:8px;">SKU</th><th style="text-align:left;padding:8px;">Message</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p style="color:#6B7280;font-size:14px;">No error samples.</p>') +
        '</div></div>';
    overlay.onclick = function (ev) { if (ev.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

async function loadAdminOrders() {
    const content = document.getElementById('adminOrdersContent');
    if (!content) return;
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        content.innerHTML = `
            <div style="color: #d32f2f; padding: 20px; background: #ffebee; border-radius: 8px;">
                <h3 style="margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Authentication Required</h3>
                <p style="margin-bottom: 12px;">Please log in to access admin features.</p>
                <button onclick="navigate('login')" style="background: #FF7A00; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Go to Login</button>
            </div>
        `;
        return;
    }
    
    content.innerHTML = '<div style="text-align: center; padding: 40px; color: #4B5563;"><i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px;"></i><p>Loading orders...</p></div>';
    
    try {
        const orders = await api.get('/api/admin/orders');
        
        if (!Array.isArray(orders)) {
            throw new Error('Invalid response format');
        }
        
        if (orders.length === 0) {
            content.innerHTML = '<div style="text-align: center; padding: 60px 20px; color: #4B5563;"><i class="fas fa-shopping-cart" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i><p>No orders yet</p></div>';
            return;
        }
        
        content.innerHTML = `
            <div style="margin-bottom: 24px;">
                <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">All Orders</h2>
                <p style="color: #4B5563;">Total: ${orders.length} orders</p>
            </div>
            <div style="display: grid; gap: 16px;">
                ${orders.map(order => `
                    <div style="background: #f9f9f9; padding: 24px; border-radius: 12px; border-left: 4px solid #FF7A00;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                            <div>
                                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">Order ${order.order_number || order.id || 'N/A'}</h3>
                                <p style="color: #4B5563; font-size: 14px;">${order.user?.company_name || 'Unknown'} • ${order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div style="text-align: right;">
                                <div style="background: ${order.status === 'pending' ? '#fff3cd' : order.status === 'completed' ? '#d4edda' : '#f8d7da'}; color: ${order.status === 'pending' ? '#856404' : order.status === 'completed' ? '#155724' : '#721c24'}; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; display: inline-block; margin-bottom: 8px;">
                                    ${order.status || 'pending'}
                                </div>
                                <div style="font-size: 20px; font-weight: 700; color: #1a1a1a;">$${(order.total || 0).toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
                            <p style="font-size: 13px; color: #4B5563; margin-bottom: 12px;"><strong>Items:</strong> ${(order.items && order.items.length) || 0} products</p>
                            <div style="display: grid; gap: 8px; margin-top: 12px;">
                                ${order.items.map(item => {
                                    const variantSku = item.variant_sku || (item.size ? `${item.sku}-${item.size.toUpperCase().replace(/\s+/g, '')}` : item.sku);
                                    return `
                                    <div style="background: #ffffff; padding: 12px; border-radius: 8px; border-left: 3px solid #FF7A00;">
                                        <div style="display: flex; justify-content: space-between; align-items: start;">
                                            <div style="flex: 1;">
                                                <div style="font-weight: 600; color: #111111; margin-bottom: 4px;">${item.name}</div>
                                                <div style="font-size: 12px; color: #4B5563; margin-bottom: 4px;">
                                                    <span style="font-weight: 600;">Base SKU:</span> ${item.sku}
                                                    ${variantSku !== item.sku ? `<span style="margin-left: 12px;"><span style="color: #FF7A00; font-weight: 700;">Variant SKU:</span> <span style="font-weight: 700; color: #FF7A00; background: #fff5f0; padding: 2px 6px; border-radius: 4px;">${variantSku}</span></span>` : ''}
                                                </div>
                                                ${item.size ? `<div style="font-size: 12px; color: #111111; margin-top: 4px;"><span style="font-weight: 600;">Size:</span> <span style="background: #FF7A00; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: 600; margin-left: 4px;">${item.size}</span></div>` : ''}
                                            </div>
                                            <div style="text-align: right; margin-left: 16px;">
                                                <div style="font-size: 13px; color: #4B5563;">Qty: <strong style="color: #111111;">${item.quantity}</strong></div>
                                                <div style="font-size: 13px; color: #4B5563; margin-top: 4px;">$${((item.price || 0) * (item.quantity || 0)).toFixed(2)}</div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                                }).join('')}
                            </div>
                            <div style="font-size: 13px; color: #4B5563; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
                                <strong>Contact:</strong> ${order.user?.contact_name || 'N/A'} • ${order.user?.email || 'N/A'}
                            </div>
                            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
                                <strong>Tracking:</strong> ${order.tracking_number || '—'} ${order.tracking_url ? '<a href="' + order.tracking_url + '" target="_blank" rel="noopener">Track</a>' : ''}
                                <button type="button" onclick="openAdminOrderTrackingModal(${order.id}, this.getAttribute('data-tracking'))" data-tracking="${encodeURIComponent(JSON.stringify({ tracking_number: order.tracking_number || '', tracking_url: order.tracking_url || '', status: order.status || 'pending' }))}" style="margin-left: 12px; background: #FF7A00; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">Set tracking</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading orders:', error);
        const errorMsg = error.message || 'Unknown error';
        content.innerHTML = `
            <div style="color: #d32f2f; padding: 20px; background: #ffebee; border-radius: 8px;">
                <h3 style="margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Error loading orders</h3>
                <p style="margin-bottom: 12px;">${errorMsg}</p>
                ${errorMsg.includes('403') || errorMsg.includes('Admin access') ? '<p style="font-size: 13px; color: #4B5563;">Make sure you are logged in as an approved admin user.</p>' : ''}
                <button onclick="loadAdminOrders()" style="margin-top: 12px; background: #FF7A00; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Retry</button>
            </div>
        `;
    }
}

function openAdminOrderTrackingModal(orderId, dataAttr) {
    let trackingNumber = '', trackingUrl = '', status = 'pending';
    try {
        const data = dataAttr ? JSON.parse(decodeURIComponent(dataAttr)) : {};
        trackingNumber = data.tracking_number || '';
        trackingUrl = data.tracking_url || '';
        status = data.status || 'pending';
    } catch (e) {}
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'adminOrderTrackingOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;';
    overlay.innerHTML = '<div class="modal-content" style="background:#fff; padding:24px; border-radius:12px; max-width:420px; width:100%;">' +
        '<h3 style="margin-bottom:16px;">Order tracking</h3>' +
        '<label>Tracking number</label>' +
        '<input type="text" id="adminTrackingNumber" value="' + (trackingNumber || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" placeholder="1Z999..." style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:12px;">' +
        '<label>Tracking URL</label>' +
        '<input type="url" id="adminTrackingUrl" value="' + (trackingUrl || '').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" placeholder="https://..." style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:12px;">' +
        '<label>Status</label>' +
        '<select id="adminOrderStatus" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:8px; margin-bottom:16px;">' +
        '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>Pending</option>' +
        '<option value="processing"' + (status === 'processing' ? ' selected' : '') + '>Processing</option>' +
        '<option value="shipped"' + (status === 'shipped' ? ' selected' : '') + '>Shipped</option>' +
        '<option value="completed"' + (status === 'completed' ? ' selected' : '') + '>Completed</option>' +
        '</select>' +
        '<div style="display:flex; gap:10px;">' +
        '<button type="button" class="btn btn-primary" onclick="saveAdminOrderTracking(' + orderId + '); return false;">Save</button>' +
        '<button type="button" class="btn btn-outline" onclick="document.getElementById(\'adminOrderTrackingOverlay\').remove();">Cancel</button>' +
        '</div></div>';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}
async function saveAdminOrderTracking(orderId) {
    const trackingNumber = document.getElementById('adminTrackingNumber') && document.getElementById('adminTrackingNumber').value.trim();
    const trackingUrl = document.getElementById('adminTrackingUrl') && document.getElementById('adminTrackingUrl').value.trim();
    const status = document.getElementById('adminOrderStatus') && document.getElementById('adminOrderStatus').value;
    try {
        await api.put('/api/admin/orders/' + orderId, { tracking_number: trackingNumber, tracking_url: trackingUrl, status });
        showToast('Order updated', 'success');
        document.getElementById('adminOrderTrackingOverlay') && document.getElementById('adminOrderTrackingOverlay').remove();
        loadAdminOrders();
    } catch (e) {
        showToast(e.message || 'Failed to update', 'error');
    }
}

async function loadAdminRFQs() {
    const content = document.getElementById('adminRFQsContent');
    if (!content) return;
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        content.innerHTML = `
            <div style="color: #d32f2f; padding: 20px; background: #ffebee; border-radius: 8px;">
                <h3 style="margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Authentication Required</h3>
                <p style="margin-bottom: 12px;">Please log in to access admin features.</p>
                <button onclick="navigate('login')" style="background: #FF7A00; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Go to Login</button>
            </div>
        `;
        return;
    }
    
    content.innerHTML = '<div style="text-align: center; padding: 40px; color: #4B5563;"><i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px;"></i><p>Loading RFQs...</p></div>';
    
    try {
        const rfqs = await api.get('/api/rfqs');
        
        if (!Array.isArray(rfqs)) {
            throw new Error('Invalid response format');
        }
        
        if (rfqs.length === 0) {
            content.innerHTML = '<div style="text-align: center; padding: 60px 20px; color: #4B5563;"><i class="fas fa-file-invoice-dollar" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i><p>No RFQs yet</p></div>';
            return;
        }
        
        content.innerHTML = `
            <div style="margin-bottom: 24px;">
                <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Request for Quotes</h2>
                <p style="color: #4B5563;">Total: ${rfqs.length} RFQs</p>
            </div>
            <div style="display: grid; gap: 16px;">
                ${rfqs.map(rfq => `
                    <div style="background: #f9f9f9; padding: 24px; border-radius: 12px; border-left: 4px solid #FF7A00;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                            <div>
                                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">${rfq.company_name || 'Unknown Company'}</h3>
                                <p style="color: #4B5563; font-size: 14px;">${rfq.contact_name || 'N/A'} • ${rfq.email || 'N/A'} • ${rfq.phone || 'N/A'}</p>
                                <p style="color: #4B5563; font-size: 13px; margin-top: 4px;">Submitted: ${rfq.created_at ? new Date(rfq.created_at).toLocaleString() : 'N/A'}</p>
                            </div>
                            <div style="text-align: right;">
                                <div style="background: ${rfq.status === 'pending' ? '#fff3cd' : rfq.status === 'contacted' ? '#d4edda' : '#f8d7da'}; color: ${rfq.status === 'pending' ? '#856404' : rfq.status === 'contacted' ? '#155724' : '#721c24'}; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; display: inline-block;">
                                    ${rfq.status || 'pending'}
                                </div>
                            </div>
                        </div>
                        <div style="background: #ffffff; padding: 16px; border-radius: 8px; margin-top: 16px;">
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 12px;">
                                <div>
                                    <div style="font-size: 12px; color: #4B5563; margin-bottom: 4px;">Quantity</div>
                                    <div style="font-weight: 600; color: #1a1a1a;">${rfq.quantity || 'N/A'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: #4B5563; margin-bottom: 4px;">Type</div>
                                    <div style="font-weight: 600; color: #1a1a1a;">${rfq.type || 'N/A'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: #4B5563; margin-bottom: 4px;">Use Case</div>
                                    <div style="font-weight: 600; color: #1a1a1a;">${rfq.use_case || 'N/A'}</div>
                                </div>
                            </div>
                            ${rfq.notes ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;"><div style="font-size: 12px; color: #4B5563; margin-bottom: 4px;">Notes</div><div style="color: #1a1a1a;">${rfq.notes}</div></div>` : ''}
                        </div>
                        <div style="margin-top: 16px; display: flex; gap: 8px;">
                            <button onclick="updateRFQStatus(${rfq.id}, 'contacted')" style="background: #28a745; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                                Mark as Contacted
                            </button>
                            <button onclick="updateRFQStatus(${rfq.id}, 'closed')" style="background: #6c757d; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                                Close
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading RFQs:', error);
        const errorMsg = error.message || 'Unknown error';
        content.innerHTML = `
            <div style="color: #d32f2f; padding: 20px; background: #ffebee; border-radius: 8px;">
                <h3 style="margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Error loading RFQs</h3>
                <p style="margin-bottom: 12px;">${errorMsg}</p>
                ${errorMsg.includes('403') || errorMsg.includes('Admin access') ? '<p style="font-size: 13px; color: #4B5563;">Make sure you are logged in as an approved admin user.</p>' : ''}
                <button onclick="loadAdminRFQs()" style="margin-top: 12px; background: #FF7A00; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Retry</button>
            </div>
        `;
    }
}

async function loadAdminUsers() {
    const content = document.getElementById('adminUsersContent');
    if (!content) return;
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        content.innerHTML = `
            <div style="color: #d32f2f; padding: 20px; background: #ffebee; border-radius: 8px;">
                <h3 style="margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Authentication Required</h3>
                <p style="margin-bottom: 12px;">Please log in to access admin features.</p>
                <button onclick="navigate('login')" style="background: #FF7A00; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Go to Login</button>
            </div>
        `;
        return;
    }
    
    content.innerHTML = '<div style="text-align: center; padding: 40px; color: #4B5563;"><i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px;"></i><p>Loading users...</p></div>';
    
    try {
        const users = await api.get('/api/admin/users');
        
        if (!Array.isArray(users)) {
            throw new Error('Invalid response format');
        }
        
        if (users.length === 0) {
            content.innerHTML = '<div style="text-align: center; padding: 60px 20px; color: #4B5563;"><i class="fas fa-users" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i><p>No users yet</p></div>';
            return;
        }
        
        content.innerHTML = `
            <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                <div>
                    <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">All Users</h2>
                    <p style="color: #4B5563;">Total: ${users.length} users</p>
                </div>
                <button type="button" onclick="showAddCustomerModal()" style="background: #FF7A00; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-user-plus"></i> Add Customer
                </button>
            </div>
            <div id="addCustomerModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; overflow: auto; padding: 24px;" onclick="if(event.target===this) hideAddCustomerModal()">
                <div style="max-width: 560px; margin: 24px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.2);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h3 style="font-size: 20px; font-weight: 700;">Add New Customer</h3>
                        <button type="button" onclick="hideAddCustomerModal()" style="background: none; border: none; font-size: 24px; color: #6B7280; cursor: pointer;">&times;</button>
                    </div>
                    <div id="addCustomerError" style="display: none; margin-bottom: 16px; padding: 12px; background: #ffebee; border-radius: 8px; color: #c62828;"></div>
                    <form id="addCustomerForm" onsubmit="submitAddCustomer(event)">
                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group">
                                <label>Company Name *</label>
                                <input type="text" id="newCustomerCompany" required placeholder="Company name">
                            </div>
                            <div class="form-group">
                                <label>Contact Name *</label>
                                <input type="text" id="newCustomerContact" required placeholder="Full name">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Email *</label>
                            <input type="email" id="newCustomerEmail" required placeholder="email@company.com">
                        </div>
                        <div class="form-group">
                            <label>Password *</label>
                            <input type="password" id="newCustomerPassword" required placeholder="Min 6 characters" minlength="6">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" id="newCustomerPhone" placeholder="(555) 123-4567">
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <input type="text" id="newCustomerAddress" placeholder="Street address">
                        </div>
                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr 80px; gap: 12px;">
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" id="newCustomerCity" placeholder="City">
                            </div>
                            <div class="form-group">
                                <label>State</label>
                                <input type="text" id="newCustomerState" placeholder="State">
                            </div>
                            <div class="form-group">
                                <label>ZIP</label>
                                <input type="text" id="newCustomerZip" placeholder="ZIP">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Payment terms *</label>
                            <select id="newCustomerPaymentTerms" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px;">
                                <option value="credit_card">Credit Card</option>
                                <option value="net30">Net 30</option>
                            </select>
                        </div>
                        <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                            <input type="checkbox" id="newCustomerAllowFreeUpgrades" style="width: 18px; height: 18px; accent-color: #FF7A00;">
                            <label for="newCustomerAllowFreeUpgrades" style="margin: 0;">Allow free upgrades (substitute if out of stock)</label>
                        </div>
                        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #E5E7EB;">
                            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Quicklist (optional)</h4>
                            <p style="font-size: 13px; color: #4B5563; margin-bottom: 12px;">Add a saved list so this customer can reorder quickly.</p>
                            <div class="form-group">
                                <label>Quicklist name</label>
                                <input type="text" id="newCustomerQuicklistName" placeholder="e.g. Monthly restock">
                            </div>
                            <div style="margin-bottom: 12px;">
                                <label style="font-size: 13px;">Add product</label>
                                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                                    <select id="newCustomerQuicklistProduct" style="flex: 1; min-width: 180px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px;">
                                        <option value="">Select product</option>
                                    </select>
                                    <input type="text" id="newCustomerQuicklistSize" placeholder="Size" style="width: 80px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px;">
                                    <input type="number" id="newCustomerQuicklistQty" placeholder="Qty" value="1" min="1" style="width: 70px; padding: 10px; border: 2px solid #e0e0e0; border-radius: 8px;">
                                    <button type="button" onclick="addQuicklistRow()" style="background: #111; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">Add</button>
                                </div>
                            </div>
                            <ul id="newCustomerQuicklistItems" style="list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto;"></ul>
                        </div>
                        <div style="margin-top: 24px; display: flex; gap: 12px;">
                            <button type="submit" style="background: #FF7A00; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Create Customer</button>
                            <button type="button" onclick="hideAddCustomerModal()" style="background: #E5E7EB; color: #374151; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
            <div style="display: grid; gap: 16px;">
                ${users.map(user => `
                    <div style="background: #f9f9f9; padding: 24px; border-radius: 12px; border-left: 4px solid ${user.is_approved ? '#28a745' : '#FF7A00'};">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                            <div>
                                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">${user.company_name || 'Unknown Company'}</h3>
                                <p style="color: #4B5563; font-size: 14px;">${user.contact_name || 'N/A'} • ${user.email || 'N/A'}</p>
                                <p style="color: #4B5563; font-size: 13px; margin-top: 4px;">Joined: ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
                                ${user.allow_free_upgrades ? '<p style="color: #059669; font-size: 12px; margin-top: 4px;"><i class="fas fa-arrow-up"></i> Free upgrades enabled</p>' : ''}
                            </div>
                            <div style="text-align: right;">
                                <div style="background: ${user.is_approved ? '#d4edda' : '#fff3cd'}; color: ${user.is_approved ? '#155724' : '#856404'}; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; display: inline-block; margin-bottom: 8px;">
                                    ${user.is_approved ? 'Approved' : 'Pending'}
                                </div>
                                <div style="font-size: 13px; color: #4B5563; text-transform: capitalize;">${user.discount_tier || 'standard'} tier</div>
                                <div style="font-size: 12px; color: #4B5563; margin-top: 4px;">${(user.payment_terms || 'credit_card') === 'net30' ? 'Net 30' : 'Credit Card'}</div>
                            </div>
                        </div>
                        <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
                            ${!user.is_approved ? `<button onclick="updateUserApproval(${user.id}, true)" style="background: #28a745; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Approve User</button>` : ''}
                            <select onchange="updateUserTier(${user.id}, this.value)" style="padding: 8px 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 13px; cursor: pointer;">
                                <option value="standard" ${user.discount_tier === 'standard' ? 'selected' : ''}>Standard</option>
                                <option value="bronze" ${user.discount_tier === 'bronze' ? 'selected' : ''}>Bronze (5%)</option>
                                <option value="silver" ${user.discount_tier === 'silver' ? 'selected' : ''}>Silver (10%)</option>
                                <option value="gold" ${user.discount_tier === 'gold' ? 'selected' : ''}>Gold (15%)</option>
                                <option value="platinum" ${user.discount_tier === 'platinum' ? 'selected' : ''}>Platinum (20%)</option>
                            </select>
                            <select onchange="updateUserPaymentTerms(${user.id}, this.value)" style="padding: 8px 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 13px; cursor: pointer;">
                                <option value="credit_card" ${(user.payment_terms || 'credit_card') === 'credit_card' ? 'selected' : ''}>Credit Card</option>
                                <option value="net30" ${user.payment_terms === 'net30' ? 'selected' : ''}>Net 30</option>
                            </select>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading users:', error);
        const errorMsg = error.message || 'Unknown error';
        content.innerHTML = `
            <div style="color: #d32f2f; padding: 20px; background: #ffebee; border-radius: 8px;">
                <h3 style="margin-bottom: 8px;"><i class="fas fa-exclamation-triangle"></i> Error loading users</h3>
                <p style="margin-bottom: 12px;">${errorMsg}</p>
                ${errorMsg.includes('403') || errorMsg.includes('Admin access') ? '<p style="font-size: 13px; color: #4B5563;">Make sure you are logged in as an approved admin user.</p>' : ''}
                <button onclick="loadAdminUsers()" style="margin-top: 12px; background: #FF7A00; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Retry</button>
            </div>
        `;
    }
}

async function updateRFQStatus(rfqId, status) {
    try {
        await api.put(`/api/rfqs/${rfqId}`, { status });
        showToast('RFQ status updated', 'success');
        loadAdminRFQs();
    } catch (error) {
        showToast('Error updating RFQ: ' + error.message, 'error');
    }
}

async function updateUserApproval(userId, approved) {
    try {
        await api.put(`/api/admin/users/${userId}`, { is_approved: approved });
        showToast('User approval updated', 'success');
        loadAdminUsers();
    } catch (error) {
        showToast('Error updating user: ' + error.message, 'error');
    }
}

async function updateUserTier(userId, tier) {
    try {
        await api.put(`/api/admin/users/${userId}`, { discount_tier: tier });
        showToast('User tier updated', 'success');
        loadAdminUsers();
    } catch (error) {
        showToast('Error updating tier: ' + error.message, 'error');
    }
}

async function updateUserPaymentTerms(userId, payment_terms) {
    try {
        await api.put(`/api/admin/users/${userId}`, { payment_terms });
        showToast('Payment terms updated', 'success');
        loadAdminUsers();
    } catch (error) {
        showToast('Error updating payment terms: ' + error.message, 'error');
    }
}

window.addCustomerQuicklistItems = [];

async function showAddCustomerModal() {
    const modal = document.getElementById('addCustomerModal');
    if (!modal) return;
    window.addCustomerQuicklistItems = [];
    document.getElementById('addCustomerError').style.display = 'none';
    document.getElementById('addCustomerForm').reset();
    document.getElementById('newCustomerQuicklistQty').value = 1;
    document.getElementById('newCustomerQuicklistItems').innerHTML = '';
    const productSelect = document.getElementById('newCustomerQuicklistProduct');
    if (productSelect) {
        const products = await api.get('/api/products').catch(() => []);
        productSelect.innerHTML = '<option value="">Select product</option>' + (products || []).map(p => '<option value="' + p.id + '">' + (p.sku || '') + ' – ' + (p.name || '').substring(0, 40) + '</option>').join('');
    }
    modal.style.display = 'block';
}

function hideAddCustomerModal() {
    const modal = document.getElementById('addCustomerModal');
    if (modal) modal.style.display = 'none';
}

function addQuicklistRow() {
    const productSelect = document.getElementById('newCustomerQuicklistProduct');
    const sizeInput = document.getElementById('newCustomerQuicklistSize');
    const qtyInput = document.getElementById('newCustomerQuicklistQty');
    if (!productSelect || !productSelect.value) return;
    const productId = parseInt(productSelect.value, 10);
    const opt = productSelect.options[productSelect.selectedIndex];
    const label = opt ? opt.textContent : 'Product ' + productId;
    const size = (sizeInput && sizeInput.value) ? sizeInput.value.trim() : null;
    const quantity = Math.max(1, parseInt((qtyInput && qtyInput.value) ? qtyInput.value : 1, 10));
    window.addCustomerQuicklistItems.push({ product_id: productId, size: size || null, quantity });
    const ul = document.getElementById('newCustomerQuicklistItems');
    if (ul) {
        const li = document.createElement('li');
        li.style.cssText = 'padding: 8px 12px; background: #f3f4f6; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;';
        li.innerHTML = '<span style="font-size: 13px;">' + label.substring(0, 50) + (label.length > 50 ? '…' : '') + ' × ' + quantity + (size ? ' (' + size + ')' : '') + '</span><button type="button" class="remove-quicklist-row" style="background: #dc3545; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">Remove</button>';
    li.querySelector('.remove-quicklist-row').addEventListener('click', function() {
        const idx = Array.from(ul.children).indexOf(li);
        if (idx !== -1) window.addCustomerQuicklistItems.splice(idx, 1);
        li.remove();
    });
        ul.appendChild(li);
    }
    if (qtyInput) qtyInput.value = 1;
}

async function submitAddCustomer(event) {
    event.preventDefault();
    const errEl = document.getElementById('addCustomerError');
    errEl.style.display = 'none';
    const company_name = document.getElementById('newCustomerCompany').value.trim();
    const contact_name = document.getElementById('newCustomerContact').value.trim();
    const email = document.getElementById('newCustomerEmail').value.trim();
    const password = document.getElementById('newCustomerPassword').value;
    if (!company_name || !contact_name || !email || !password) {
        errEl.textContent = 'Company name, contact name, email, and password are required.';
        errEl.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        errEl.style.display = 'block';
        return;
    }
    const payload = {
        company_name,
        contact_name,
        email,
        password,
        phone: (document.getElementById('newCustomerPhone') && document.getElementById('newCustomerPhone').value) || '',
        address: (document.getElementById('newCustomerAddress') && document.getElementById('newCustomerAddress').value) || '',
        city: (document.getElementById('newCustomerCity') && document.getElementById('newCustomerCity').value) || '',
        state: (document.getElementById('newCustomerState') && document.getElementById('newCustomerState').value) || '',
        zip: (document.getElementById('newCustomerZip') && document.getElementById('newCustomerZip').value) || '',
        payment_terms: (document.getElementById('newCustomerPaymentTerms') && document.getElementById('newCustomerPaymentTerms').value) || 'credit_card',
        allow_free_upgrades: !!(document.getElementById('newCustomerAllowFreeUpgrades') && document.getElementById('newCustomerAllowFreeUpgrades').checked)
    };
    const quicklistName = document.getElementById('newCustomerQuicklistName') && document.getElementById('newCustomerQuicklistName').value.trim();
    if (quicklistName && window.addCustomerQuicklistItems && window.addCustomerQuicklistItems.length > 0) {
        payload.quicklist = { name: quicklistName, items: window.addCustomerQuicklistItems };
    }
    try {
        await api.post('/api/admin/users', payload);
        showToast('Customer created. They can sign in and place orders.', 'success');
        hideAddCustomerModal();
        loadAdminUsers();
    } catch (error) {
        errEl.textContent = error.message || 'Failed to create customer.';
        errEl.style.display = 'block';
    }
}

async function editProduct(productId) {
    try {
        const [product, brands] = await Promise.all([
            api.get(`/api/products/${productId}`),
            api.get('/api/brands').catch(() => [])
        ]);
        const content = document.getElementById('editProductModalContent');
        if (!content) return;
        content.innerHTML = buildEditProductFormHTML(product, brands);
        const modal = document.getElementById('editProductModal');
        if (modal) modal.style.display = 'block';
        initEditImageRowsDrag();
        updateEditVariantSkuPreview();
        const urlInput = document.getElementById('editProductImageUrl');
        if (urlInput) urlInput.addEventListener('input', updateEditProductImagePreview);
        updateEditProductImagePreview();
    } catch (error) {
        showToast('❌ Error editing product: ' + error.message, 'error');
    }
}

function initEditImageRowsDrag() {
    const list = document.getElementById('editProductImagesList');
    if (!list) return;
    const rows = list.querySelectorAll('.edit-image-row');
    rows.forEach((row, i) => {
        row.setAttribute('data-index', String(i));
        row.draggable = true;
        row.ondragstart = (e) => { e.dataTransfer.setData('text/plain', row.dataset.index); e.dataTransfer.effectAllowed = 'move'; };
        row.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('edit-image-drag-over'); };
        row.ondragleave = () => row.classList.remove('edit-image-drag-over');
        row.ondrop = (e) => {
            e.preventDefault();
            row.classList.remove('edit-image-drag-over');
            const from = list.querySelector('.edit-image-row[data-index="' + e.dataTransfer.getData('text/plain') + '"]');
            if (from && from !== row) list.insertBefore(from, row);
            // Refresh data-index after reorder
            list.querySelectorAll('.edit-image-row').forEach((r, j) => r.setAttribute('data-index', String(j)));
        };
    });
}

async function saveProductEdit(event) {
    event.preventDefault();
    var priceEl = document.getElementById('editProductPrice');
    var bulkEl = document.getElementById('editProductBulkPrice');
    if (priceEl) evaluatePriceInput(priceEl);
    if (bulkEl) evaluatePriceInput(bulkEl);
    const idEl = document.getElementById('editProductId');
    const productId = idEl && idEl.value;
    if (!productId) {
        showToast('❌ Product ID missing.', 'error');
        return;
    }
    const list = document.getElementById('editProductImagesList');
    const images = list ? Array.from(list.querySelectorAll('.edit-image-row input[type="url"]')).map(inp => (inp.value || '').trim()).filter(Boolean) : [];
    const payload = {
        sku: (document.getElementById('editProductSku') && document.getElementById('editProductSku').value) || '',
        name: (document.getElementById('editProductName') && document.getElementById('editProductName').value) || '',
        brand: (document.getElementById('editProductBrand') && document.getElementById('editProductBrand').value) || '',
        category: (document.getElementById('editProductCategory') && document.getElementById('editProductCategory').value) || '',
        subcategory: getSelectedEditProductMulti('editProductSubcategoryChips').join(', '),
        material: getSelectedEditProductMulti('editProductMaterialChips').join(', '),
        color: getSelectedEditProductMulti('editProductColorChips').join(', '),
        sizes: getSelectedEditProductSizes().join(', '),
        pack_qty: parseInt((document.getElementById('editProductPackQty') && document.getElementById('editProductPackQty').value) || '100', 10) || 100,
        case_qty: parseInt((document.getElementById('editProductCaseQty') && document.getElementById('editProductCaseQty').value) || '1000', 10) || 1000,
        case_weight: parseFloat((document.getElementById('editProductCaseWeight') && document.getElementById('editProductCaseWeight').value) || '') || null,
        case_length: parseFloat((document.getElementById('editProductCaseLength') && document.getElementById('editProductCaseLength').value) || '') || null,
        case_width: parseFloat((document.getElementById('editProductCaseWidth') && document.getElementById('editProductCaseWidth').value) || '') || null,
        case_height: parseFloat((document.getElementById('editProductCaseHeight') && document.getElementById('editProductCaseHeight').value) || '') || null,
        price: parseFloat((document.getElementById('editProductPrice') && document.getElementById('editProductPrice').value) || '0'),
        bulk_price: parseFloat((document.getElementById('editProductBulkPrice') && document.getElementById('editProductBulkPrice').value) || '0'),
        description: (document.getElementById('editProductDescription') && document.getElementById('editProductDescription').value) || '',
        image_url: (document.getElementById('editProductImageUrl') && document.getElementById('editProductImageUrl').value) || '',
        images: images,
        video_url: (document.getElementById('editProductVideoUrl') && document.getElementById('editProductVideoUrl').value) || '',
        in_stock: (document.getElementById('editProductInStock') && document.getElementById('editProductInStock').checked) ? 1 : 0,
        featured: (document.getElementById('editProductFeatured') && document.getElementById('editProductFeatured').checked) ? 1 : 0,
        powder: (document.getElementById('editProductPowder') && document.getElementById('editProductPowder').value) || '',
        thickness: (() => { const el = document.getElementById('editProductThickness'); const v = el && el.value; if (!v) return null; if (v === '7+') return 7; const n = parseFloat(v); return isNaN(n) ? null : n; })(),
        grade: getSelectedEditProductMulti('editProductGradeChips').join(', '),
        useCase: getSelectedEditProductMulti('editProductUseCaseChips').join(', '),
        certifications: getSelectedEditProductMulti('editProductCertificationsChips').join(', '),
        texture: getSelectedEditProductMulti('editProductTextureChips').join(', '),
        cuffStyle: getSelectedEditProductMulti('editProductCuffStyleChips').join(', '),
        sterility: (document.getElementById('editProductSterility') && document.getElementById('editProductSterility').value) || ''
    };
    try {
        await api.put(`/api/products/${productId}`, payload);
        showToast('✅ Product updated successfully!', 'success');
        closeEditProductModal();
        loadAdminProducts();
    } catch (error) {
        showToast('❌ Error saving: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
        return;
    }
    
    try {
        await api.delete(`/api/products/${productId}`);
        showToast('✅ Product deleted successfully!', 'success');
        loadAdminProducts(true);
    } catch (error) {
        showToast('❌ Error deleting product: ' + error.message, 'error');
    }
}

function showAddProductForm() {
    const section = document.getElementById('addProductSection');
    if (section) section.style.display = 'block';
    hideCSVImportSection();
    var statusEl = document.getElementById('addProductByUrlStatus');
    if (statusEl) statusEl.innerHTML = '';
    window.addProductParseResult = null;
}

function hideAddProductForm() {
    const section = document.getElementById('addProductSection');
    if (section) {
        section.style.display = 'none';
        document.getElementById('addProductForm')?.reset();
        var statusEl = document.getElementById('addProductByUrlStatus');
        if (statusEl) statusEl.innerHTML = '';
    }
    window.addProductParseResult = null;
}

async function fetchProductByUrl() {
    var input = document.getElementById('addProductByUrlInput');
    var btn = document.getElementById('addProductByUrlBtn');
    var statusEl = document.getElementById('addProductByUrlStatus');
    var url = (input && input.value) ? input.value.trim() : '';
    if (!url) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #B45309;">Please enter a URL.</span>';
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">URL must start with http:// or https://</span>';
        return;
    }
    var origLabel = btn ? btn.innerHTML : 'Fetch';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching...'; }
    if (statusEl) statusEl.innerHTML = '';
    try {
        var res = await fetch(api.baseUrl + '/api/admin/products/parse-url', {
            method: 'POST',
            headers: api.getHeaders(),
            body: JSON.stringify({ url: url })
        });
        var data = await res.json().catch(function() { return { error: 'Invalid response' }; });
        if (!res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (data.error || res.statusText || 'Request failed') + '</span>';
            return;
        }
        window.addProductParseResult = data;
        if (data.kind === 'asset') {
            var imgUrl = (data.hints && data.hints.images && data.hints.images[0]) ? data.hints.images[0] : (data.asset && data.asset.finalUrl) ? data.asset.finalUrl : url;
            var imgInput = document.getElementById('productImageUrl');
            if (imgInput) imgInput.value = imgUrl;
            if (typeof updateImagePreview === 'function') updateImagePreview(imgUrl);
            if (statusEl) statusEl.innerHTML = '<div style="background: #FEF3C7; border: 1px solid #F59E0B; color: #92400E; padding: 10px 12px; border-radius: 8px;"><strong>This is a media file URL, not a product page.</strong> We saved it as an image. Paste the product page URL to auto-fill SKU/details.</div>';
        } else {
            var extracted = data.extracted || {};
            var hints = data.hints || {};
            var images = hints.images || extracted.images || [];
            if (images.length > 0) {
                var imgInput = document.getElementById('productImageUrl');
                if (imgInput) imgInput.value = images[0];
                var addImg = document.getElementById('productAdditionalImages');
                if (addImg && images.length > 1) addImg.value = images.slice(1).join('\n');
                if (typeof updateImagePreview === 'function') updateImagePreview(images[0]);
            }
            if (extracted.title) {
                var nameInput = document.getElementById('productName');
                if (nameInput) nameInput.value = extracted.title;
            }
            if (extracted.description) {
                var descInput = document.getElementById('productDescription');
                if (descInput) descInput.value = extracted.description;
            }
            if (statusEl) statusEl.innerHTML = '<span style="color: #059669;">Product page parsed. Image and details filled from page.</span>';
        }
    } catch (err) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #DC2626;">' + (err.message || 'Network error') + '</span>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origLabel; }
    }
}

function generateImageUrl() {
    const nameInput = document.getElementById('productName');
    const colorChips = typeof getSelectedEditProductMulti === 'function' ? getSelectedEditProductMulti('addProductColorChips') : [];
    const materialChips = typeof getSelectedEditProductMulti === 'function' ? getSelectedEditProductMulti('addProductMaterialChips') : [];
    const name = nameInput ? nameInput.value : 'Product';
    const color = (colorChips && colorChips[0]) || 'Blue';
    const material = (materialChips && materialChips[0]) || 'Nitrile';
    const colorMap = {
        'Blue': '0066CC',
        'Black': '000000',
        'Orange': 'FF6B00',
        'Green': '00AA00',
        'Gray': '666666',
        'Grey': '666666',
        'White': 'FFFFFF',
        'Red': 'FF0000',
        'Yellow': 'FFCC00',
        'Purple': '6600CC',
        'Pink': 'FF66CC',
        'Tan': 'D2B48C',
        'Clear': 'CCCCCC',
        'Natural': 'D2B48C'
    };
    let colorCode = '0066CC';
    for (const [key, value] of Object.entries(colorMap)) {
        if (color.toLowerCase().includes(key.toLowerCase())) {
            colorCode = value;
            break;
        }
    }
    let text = name.replace(/\s+/g, '+').substring(0, 30);
    if (!text || text === 'Product') {
        text = material + '+' + color;
    }
    const imageUrl = `https://via.placeholder.com/400x400/FFFFFF/${colorCode}?text=${text}`;
    const imageInput = document.getElementById('productImageUrl');
    if (imageInput) {
        imageInput.value = imageUrl;
        updateImagePreview(imageUrl);
        showToast('✅ Image URL generated!');
    }
}

function updateImagePreview(url) {
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    if (url && preview && previewImg) {
        previewImg.src = url;
        preview.style.display = 'block';
    } else if (preview) {
        preview.style.display = 'none';
    }
}

async function addProduct(event) {
    event.preventDefault();
    var priceEl = document.getElementById('productPrice');
    var bulkEl = document.getElementById('productBulkPrice');
    if (priceEl) evaluatePriceInput(priceEl);
    if (bulkEl) evaluatePriceInput(bulkEl);
    const materialSelected = getSelectedEditProductMulti('addProductMaterialChips');
    if (!materialSelected || materialSelected.length === 0) {
        showToast('Please select at least one Material.', 'error');
        return;
    }
    const additionalImagesEl = document.getElementById('productAdditionalImages');
    const images = additionalImagesEl ? (additionalImagesEl.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    const thicknessEl = document.getElementById('productThickness');
    const thicknessVal = thicknessEl && thicknessEl.value;
    const productData = {
        sku: (document.getElementById('productSku') && document.getElementById('productSku').value) || '',
        name: (document.getElementById('productName') && document.getElementById('productName').value) || '',
        brand: (document.getElementById('productBrand') && document.getElementById('productBrand').value) || '',
        category: (document.getElementById('productCategory') && document.getElementById('productCategory').value) || 'Disposable Gloves',
        subcategory: getSelectedEditProductMulti('addProductSubcategoryChips').join(', '),
        description: (document.getElementById('productDescription') && document.getElementById('productDescription').value) || '',
        material: getSelectedEditProductMulti('addProductMaterialChips').join(', '),
        sizes: getSelectedSizesFromContainer('addProductSizes').join(', '),
        color: getSelectedEditProductMulti('addProductColorChips').join(', '),
        pack_qty: parseInt((document.getElementById('productPackQty') && document.getElementById('productPackQty').value) || '100', 10) || 100,
        case_qty: parseInt((document.getElementById('productCaseQty') && document.getElementById('productCaseQty').value) || '1000', 10) || 1000,
        case_weight: parseFloat((document.getElementById('productCaseWeight') && document.getElementById('productCaseWeight').value) || '') || null,
        case_length: parseFloat((document.getElementById('productCaseLength') && document.getElementById('productCaseLength').value) || '') || null,
        case_width: parseFloat((document.getElementById('productCaseWidth') && document.getElementById('productCaseWidth').value) || '') || null,
        case_height: parseFloat((document.getElementById('productCaseHeight') && document.getElementById('productCaseHeight').value) || '') || null,
        price: parseFloat((document.getElementById('productPrice') && document.getElementById('productPrice').value) || '0') || 0,
        bulk_price: parseFloat((document.getElementById('productBulkPrice') && document.getElementById('productBulkPrice').value) || '0') || 0,
        image_url: (document.getElementById('productImageUrl') && document.getElementById('productImageUrl').value) || '',
        images: images,
        video_url: (document.getElementById('productVideoUrl') && document.getElementById('productVideoUrl').value) || '',
        in_stock: (document.getElementById('productInStock') && document.getElementById('productInStock').checked) ? 1 : 0,
        featured: (document.getElementById('productFeatured') && document.getElementById('productFeatured').checked) ? 1 : 0,
        powder: (document.getElementById('productPowder') && document.getElementById('productPowder').value) || '',
        thickness: thicknessVal === '7+' ? 7 : (thicknessVal ? parseFloat(thicknessVal) : null),
        sterility: (document.getElementById('productSterility') && document.getElementById('productSterility').value) || '',
        grade: getSelectedEditProductMulti('addProductGradeChips').join(', '),
        useCase: getSelectedEditProductMulti('addProductUseCaseChips').join(', '),
        certifications: getSelectedEditProductMulti('addProductCertificationsChips').join(', '),
        texture: getSelectedEditProductMulti('addProductTextureChips').join(', '),
        cuffStyle: getSelectedEditProductMulti('addProductCuffStyleChips').join(', ')
    };
    try {
        const response = await api.post('/api/products', productData);
        if (response.success) {
            showToast('✅ Product added successfully!', 'success');
            hideAddProductForm();
            if (state.currentPage === 'admin' && state.adminTab === 'products') {
                loadAdminProducts();
            } else {
                document.getElementById('addProductForm').reset();
            }
        }
    } catch (error) {
        showToast('❌ Error adding product: ' + (error.message || 'Unknown error'), 'error');
        console.error(error);
    }
}

async function submitContact() {
    const name = document.getElementById('contactName')?.value?.trim();
    const email = document.getElementById('contactEmail')?.value?.trim();
    const company = document.getElementById('contactCompany')?.value?.trim() || '';
    const message = document.getElementById('contactMessage')?.value?.trim();
    if (!name || !email || !message) {
        showToast('Please fill in name, email, and message.', 'error');
        return;
    }
    try {
        const res = await api.post('/api/contact', { name, email, company, message });
        showToast(res.message || 'Message sent! We\'ll get back to you soon.');
        document.getElementById('contactName').value = '';
        document.getElementById('contactEmail').value = '';
        document.getElementById('contactCompany').value = '';
        document.getElementById('contactMessage').value = '';
    } catch (e) {
        showToast(e.message || 'Failed to send message. Please try again.', 'error');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeBrandForAttr(s) {
    if (s == null) return '';
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
function escapeBrandHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function loadBrands() {
    const brands = await api.get('/api/brands');
    const dropdown = document.getElementById('brandDropdown');
    if (dropdown) {
        dropdown.innerHTML = brands.map(brand => {
            const safeAttr = escapeBrandForAttr(brand);
            const safeHtml = escapeBrandHtml(brand);
            const logoPath = getBrandLogoPath(brand);
            const logoHtml = logoPath
                ? '<img src="' + logoPath + '" alt="" class="dropdown-brand-logo" onerror="this.style.display=\'none\'">'
                : '';
            return '<li><a href="#" onclick="filterByBrand(\'' + safeAttr + '\'); return false;">' + logoHtml + '<span>' + safeHtml + '</span></a></li>';
        }).join('');
    }
}

function toggleMobileMenu() {
    const nav = document.querySelector('.header-nav-secondary');
    if (nav) {
        nav.classList.toggle('mobile-open');
    }
    // Also toggle old nav if it exists
    const oldNav = document.getElementById('mainNav');
    if (oldNav) {
        oldNav.classList.toggle('open');
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast && toast.querySelector('i');
    
    if (!toast || !toastMessage) {
        console.log('Toast:', message);
        return;
    }
    
    toastMessage.textContent = message;
    
    toast.classList.remove('success', 'error', 'info');
    if (type === 'success' || type === 'error' || type === 'info') {
        toast.classList.add(type);
    }
    if (toastIcon) {
        toastIcon.className = type === 'error' ? 'fas fa-exclamation-circle' : type === 'success' ? 'fas fa-check-circle' : 'fas fa-info-circle';
    }
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('open');
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('open');
}

// ============================================
// THEME (Dark / Light) – backend portals only (dashboard, admin)
// ============================================

function initTheme() {
    document.documentElement.setAttribute('data-theme', 'light');
}

function isPortalPage() {
    return state.currentPage === 'dashboard' || state.currentPage === 'admin';
}

function updateThemeForPage(page) {
    if (page === 'dashboard' || page === 'admin') {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = (saved || (prefersDark ? 'dark' : 'light'));
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
}

function updateImagePreview(url) {
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    if (url && preview && previewImg) {
        previewImg.src = url;
        preview.style.display = 'block';
    } else if (preview) {
        preview.style.display = 'none';
    }
}

async function addProduct(event) {
    event.preventDefault();
    var priceEl = document.getElementById('productPrice');
    var bulkEl = document.getElementById('productBulkPrice');
    if (priceEl) evaluatePriceInput(priceEl);
    if (bulkEl) evaluatePriceInput(bulkEl);
    const materialSelected = getSelectedEditProductMulti('addProductMaterialChips');
    if (!materialSelected || materialSelected.length === 0) {
        showToast('Please select at least one Material.', 'error');
        return;
    }
    const additionalImagesEl = document.getElementById('productAdditionalImages');
    const images = additionalImagesEl ? (additionalImagesEl.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    const thicknessEl = document.getElementById('productThickness');
    const thicknessVal = thicknessEl && thicknessEl.value;
    const productData = {
        sku: (document.getElementById('productSku') && document.getElementById('productSku').value) || '',
        name: (document.getElementById('productName') && document.getElementById('productName').value) || '',
        brand: (document.getElementById('productBrand') && document.getElementById('productBrand').value) || '',
        category: (document.getElementById('productCategory') && document.getElementById('productCategory').value) || 'Disposable Gloves',
        subcategory: getSelectedEditProductMulti('addProductSubcategoryChips').join(', '),
        description: (document.getElementById('productDescription') && document.getElementById('productDescription').value) || '',
        material: getSelectedEditProductMulti('addProductMaterialChips').join(', '),
        sizes: getSelectedSizesFromContainer('addProductSizes').join(', '),
        color: getSelectedEditProductMulti('addProductColorChips').join(', '),
        pack_qty: parseInt((document.getElementById('productPackQty') && document.getElementById('productPackQty').value) || '100', 10) || 100,
        case_qty: parseInt((document.getElementById('productCaseQty') && document.getElementById('productCaseQty').value) || '1000', 10) || 1000,
        case_weight: parseFloat((document.getElementById('productCaseWeight') && document.getElementById('productCaseWeight').value) || '') || null,
        case_length: parseFloat((document.getElementById('productCaseLength') && document.getElementById('productCaseLength').value) || '') || null,
        case_width: parseFloat((document.getElementById('productCaseWidth') && document.getElementById('productCaseWidth').value) || '') || null,
        case_height: parseFloat((document.getElementById('productCaseHeight') && document.getElementById('productCaseHeight').value) || '') || null,
        price: parseFloat((document.getElementById('productPrice') && document.getElementById('productPrice').value) || '0') || 0,
        bulk_price: parseFloat((document.getElementById('productBulkPrice') && document.getElementById('productBulkPrice').value) || '0') || 0,
        image_url: (document.getElementById('productImageUrl') && document.getElementById('productImageUrl').value) || '',
        images: images,
        video_url: (document.getElementById('productVideoUrl') && document.getElementById('productVideoUrl').value) || '',
        in_stock: (document.getElementById('productInStock') && document.getElementById('productInStock').checked) ? 1 : 0,
        featured: (document.getElementById('productFeatured') && document.getElementById('productFeatured').checked) ? 1 : 0,
        powder: (document.getElementById('productPowder') && document.getElementById('productPowder').value) || '',
        thickness: thicknessVal === '7+' ? 7 : (thicknessVal ? parseFloat(thicknessVal) : null),
        sterility: (document.getElementById('productSterility') && document.getElementById('productSterility').value) || '',
        grade: getSelectedEditProductMulti('addProductGradeChips').join(', '),
        useCase: getSelectedEditProductMulti('addProductUseCaseChips').join(', '),
        certifications: getSelectedEditProductMulti('addProductCertificationsChips').join(', '),
        texture: getSelectedEditProductMulti('addProductTextureChips').join(', '),
        cuffStyle: getSelectedEditProductMulti('addProductCuffStyleChips').join(', ')
    };
    try {
        const response = await api.post('/api/products', productData);
        if (response.success) {
            showToast('✅ Product added successfully!', 'success');
            hideAddProductForm();
            if (state.currentPage === 'admin' && state.adminTab === 'products') {
                loadAdminProducts();
            } else {
                document.getElementById('addProductForm').reset();
            }
        }
    } catch (error) {
        showToast('❌ Error adding product: ' + (error.message || 'Unknown error'), 'error');
        console.error(error);
    }
}

async function submitContact() {
    const name = document.getElementById('contactName')?.value?.trim();
    const email = document.getElementById('contactEmail')?.value?.trim();
    const company = document.getElementById('contactCompany')?.value?.trim() || '';
    const message = document.getElementById('contactMessage')?.value?.trim();
    if (!name || !email || !message) {
        showToast('Please fill in name, email, and message.', 'error');
        return;
    }
    try {
        const res = await api.post('/api/contact', { name, email, company, message });
        showToast(res.message || 'Message sent! We\'ll get back to you soon.');
        document.getElementById('contactName').value = '';
        document.getElementById('contactEmail').value = '';
        document.getElementById('contactCompany').value = '';
        document.getElementById('contactMessage').value = '';
    } catch (e) {
        showToast(e.message || 'Failed to send message. Please try again.', 'error');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeBrandForAttr(s) {
    if (s == null) return '';
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
function escapeBrandHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function loadBrands() {
    const brands = await api.get('/api/brands');
    const dropdown = document.getElementById('brandDropdown');
    if (dropdown) {
        dropdown.innerHTML = brands.map(brand => {
            const safeAttr = escapeBrandForAttr(brand);
            const safeHtml = escapeBrandHtml(brand);
            const logoPath = getBrandLogoPath(brand);
            const logoHtml = logoPath
                ? '<img src="' + logoPath + '" alt="" class="dropdown-brand-logo" onerror="this.style.display=\'none\'">'
                : '';
            return '<li><a href="#" onclick="filterByBrand(\'' + safeAttr + '\'); return false;">' + logoHtml + '<span>' + safeHtml + '</span></a></li>';
        }).join('');
    }
}

function toggleMobileMenu() {
    const nav = document.querySelector('.header-nav-secondary');
    if (nav) {
        nav.classList.toggle('mobile-open');
    }
    // Also toggle old nav if it exists
    const oldNav = document.getElementById('mainNav');
    if (oldNav) {
        oldNav.classList.toggle('open');
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast && toast.querySelector('i');
    
    if (!toast || !toastMessage) {
        console.log('Toast:', message);
        return;
    }
    
    toastMessage.textContent = message;
    
    toast.classList.remove('success', 'error', 'info');
    if (type === 'success' || type === 'error' || type === 'info') {
        toast.classList.add(type);
    }
    if (toastIcon) {
        toastIcon.className = type === 'error' ? 'fas fa-exclamation-circle' : type === 'success' ? 'fas fa-check-circle' : 'fas fa-info-circle';
    }
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('open');
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('open');
}

