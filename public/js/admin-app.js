/**
 * Admin UI component architecture (vanilla JS).
 * Loaded before app.js. Pages call AdminUI.*.compose* from loaders in app.js.
 * data-component attributes map to the conceptual tree for DOM inspection.
 */
(function (global) {
    'use strict';

    function esc(s) {
        return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function go(tab) {
        return "renderAdminPanel('" + tab + "'); return false;";
    }

    var PAGE_TITLE = {
        dashboard: 'Overview',
        customers: 'Companies',
        orders: 'Orders',
        products: 'Products',
        pricing: 'Pricing',
        users: 'Admin & approvals',
        inventory: 'Inventory',
        stripe: 'Payments',
        integrations: 'Integrations',
        settings: 'Settings',
        reports: 'Reports',
        messages: 'Messages',
        rfqs: 'RFQs',
        'early-pipeline': 'Early pipeline',
        'margin-insights': 'Shipping & margin',
        'shipping-policy': 'Shipping policy',
        'channel-analytics': 'Marketing / UTM',
        'bulk-import': 'Bulk import',
        automations: 'Automations',
        'po-health': 'PO mapping health',
        'net-terms': 'Net terms',
        'pricing-tiers': 'Pricing tiers'
    };

    /** Sidebar: primary nav matches spec nav items. */
    var PRIMARY_NAV = [
        { tab: 'dashboard', label: 'Overview', icon: 'fa-gauge-high', component: 'OverviewNavItem' },
        { tab: 'customers', label: 'Companies', icon: 'fa-building', component: 'CompaniesNavItem' },
        { tab: 'orders', label: 'Orders', icon: 'fa-cart-shopping', component: 'OrdersNavItem' },
        { tab: 'products', label: 'Products', icon: 'fa-box', component: 'ProductsNavItem' },
        { tab: 'pricing', label: 'Pricing', icon: 'fa-tags', component: 'PricingNavItem' },
        { tab: 'users', label: 'Admin users', icon: 'fa-user-shield', component: 'AdminUsersNavItem' },
        { tab: 'inventory', label: 'Inventory', icon: 'fa-warehouse', component: 'InventoryNavItem' },
        { tab: 'stripe', label: 'Payments', icon: 'fa-credit-card', component: 'PaymentsNavItem' },
        { tab: 'integrations', label: 'Integrations', icon: 'fa-plug', component: 'IntegrationsNavItem' },
        { tab: 'settings', label: 'Settings', icon: 'fa-gear', component: 'SettingsNavItem' }
    ];

    var OPS_NAV = [
        { tab: 'reports', label: 'Reports', icon: 'fa-chart-line', component: 'ReportsNavItem' },
        { tab: 'messages', label: 'Messages', icon: 'fa-envelope', component: 'MessagesNavItem' },
        { tab: 'rfqs', label: 'RFQs', icon: 'fa-file-lines', component: 'RfqsNavItem' },
        { tab: 'early-pipeline', label: 'Early pipeline', icon: 'fa-seedling', component: 'EarlyPipelineNavItem' },
        { tab: 'margin-insights', label: 'Shipping & margin', icon: 'fa-scale-balanced', component: 'MarginInsightsNavItem' },
        { tab: 'shipping-policy', label: 'Shipping policy', icon: 'fa-truck-ramp-box', component: 'ShippingPolicyNavItem' },
        { tab: 'channel-analytics', label: 'Marketing / UTM', icon: 'fa-chart-pie', component: 'ChannelAnalyticsNavItem' },
        { tab: 'bulk-import', label: 'Bulk import', icon: 'fa-file-import', component: 'BulkImportNavItem' },
        { tab: 'automations', label: 'Automations', icon: 'fa-bolt', component: 'AutomationsNavItem' },
        { tab: 'po-health', label: 'PO mapping', icon: 'fa-clipboard-check', component: 'PoHealthNavItem' },
        { tab: 'net-terms', label: 'Net terms', icon: 'fa-file-signature', component: 'NetTermsNavItem' },
        { tab: 'pricing-tiers', label: 'Pricing tiers', icon: 'fa-medal', component: 'PricingTiersNavItem' }
    ];

    function navLink(activeTab, item) {
        var active = activeTab === item.tab ? ' active' : '';
        return '<a href="#" class="' + active + '" data-component="' + item.component + '" onclick="' + go(item.tab) + '"><i class="fas ' + item.icon + '"></i><span>' + esc(item.label) + '</span></a>';
    }

    function navSection(title, items, activeTab) {
        return '<div class="cockpit-nav-section" data-component="AdminSidebar"><div class="cockpit-nav-section-title">' + esc(title) + '</div><nav class="cockpit-nav">' + items.map(function (i) { return navLink(activeTab, i); }).join('') + '</nav></div>';
    }

    var AdminLayout = {
        AdminSidebar: {
            html: function (activeTab) {
                return navSection('Main', PRIMARY_NAV, activeTab) + navSection('Operations', OPS_NAV, activeTab);
            }
        },

        AdminTopbar: {
            html: function (activeTab, user) {
                var title = PAGE_TITLE[activeTab] || activeTab;
                var email = user && user.email ? esc(user.email) : '';
                return '<header class="cockpit-topbar" data-component="AdminTopbar">' +
                    '<div class="cockpit-topbar-left">' +
                    '<a href="#" class="cockpit-logo" onclick="navigate(\'admin\'); renderAdminPanel(\'dashboard\'); return false;"><img src="/images/logo.png" alt="GloveCubs"><span>Admin</span></a>' +
                    '<span class="admin-page-title" data-component="PageTitle">' + esc(title) + '</span>' +
                    '<div class="cockpit-search-wrap" data-component="GlobalSearch"><i class="fas fa-search cockpit-search-icon"></i><input type="text" class="cockpit-search" placeholder="Search orders, companies, products…" id="cockpitGlobalSearch"></div>' +
                    '</div>' +
                    '<div class="cockpit-topbar-right">' +
                    '<div class="admin-menu-wrap" data-component="QuickCreateMenu"><button type="button" class="cockpit-quick-create" id="cockpitQuickCreate"><i class="fas fa-plus"></i> Quick create</button></div>' +
                    '<button type="button" class="cockpit-btn-icon" data-component="NotificationsButton" title="Notifications"><i class="fas fa-bell"></i></button>' +
                    '<span class="cockpit-health" title="API live"><i class="fas fa-circle"></i> Live</span>' +
                    '<span class="cockpit-env-badge" id="cockpitEnvBadge" data-component="EnvironmentBadge">Prod</span>' +
                    '<span class="cockpit-role-badge" data-component="OwnerBadge">Owner</span>' +
                    '<span class="admin-profile-menu" data-component="ProfileMenu">' +
                    '<button type="button" class="cockpit-theme-toggle" id="adminThemeToggle" onclick="toggleTheme();" title="Theme"><i class="fas fa-moon" id="adminThemeIcon"></i></button>' +
                    (email ? '<span class="admin-profile-email" title="' + email + '">' + email.substring(0, 22) + (email.length > 22 ? '…' : '') + '</span>' : '') +
                    '<a href="#" class="cockpit-back-link" onclick="navigate(\'dashboard\'); return false;">Site</a></span>' +
                    '</div></header>';
            }
        },

        AdminPageContainer: {
            slotHtml: function (activeTab) {
                var slots = '';
                var add = function (tab, id, loading) {
                    if (activeTab === tab) slots += '<div id="' + id + '" data-admin-tab="' + tab + '">' + loading + '</div>';
                };
                add('dashboard', 'adminDashboardContent', 'Loading…');
                add('orders', 'adminOrdersContent', 'Loading…');
                add('rfqs', 'adminRFQsContent', 'Loading…');
                add('early-pipeline', 'adminEarlyPipelineContent', 'Loading…');
                add('margin-insights', 'adminMarginInsightsContent', 'Loading…');
                add('shipping-policy', 'adminShippingPolicyContent', 'Loading…');
                add('channel-analytics', 'adminChannelAnalyticsContent', 'Loading…');
                add('users', 'adminUsersContent', 'Loading…');
                add('products', 'adminProductsContent', 'Loading…');
                add('messages', 'adminMessagesContent', 'Loading…');
                add('customers', 'adminCustomersContent', 'Loading…');
                add('inventory', 'adminInventoryContent', 'Loading…');
                add('vendors', 'adminVendorsContent', 'Loading…');
                add('purchase-orders', 'adminPurchaseOrdersContent', 'Loading…');
                add('bulk-import', 'adminBulkImportContent', 'Loading…');
                add('arap', 'adminARAPContent', 'Loading…');
                add('pricing', 'adminPricingContent', 'Loading…');
                add('stripe', 'adminStripeContent', 'Loading…');
                add('integrations', 'adminIntegrationsContent', 'Loading…');
                add('reports', 'adminReportsContent', 'Loading…');
                add('automations', 'adminAutomationsContent', 'Loading…');
                add('settings', 'adminSettingsContent', 'Loading…');
                add('audit-log', 'adminAuditLogContent', 'Loading…');
                add('po-health', 'adminPoHealthContent', 'Loading…');
                add('net-terms', 'adminNetTermsContent', 'Loading…');
                add('pricing-tiers', 'adminPricingTiersContent', 'Loading…');
                return '<main class="cockpit-main" data-component="AdminPageContainer"><div class="cockpit-content" id="adminTabContent">' + slots + '</div></main>';
            }
        },

        renderShell: function (activeTab, user) {
            return '<div class="cockpit admin-app-root" data-component="AdminApp">' +
                '<div class="cockpit-wrap" data-component="AdminLayout">' +
                this.AdminTopbar.html(activeTab, user) +
                '<div class="cockpit-body">' +
                '<aside class="cockpit-sidebar">' + this.AdminSidebar.html(activeTab) + '</aside>' +
                this.AdminPageContainer.slotHtml(activeTab) +
                '</div></div></div>';
        }
    };

    function kpiDrill(val, sub, label, panel) {
        return '<a href="#" onclick="' + go(panel) + '" class="cockpit-kpi cockpit-kpi--drill">' +
            '<span class="cockpit-kpi-value">' + esc(val) + '</span><span class="cockpit-kpi-label">' + esc(label) + '</span>' +
            (sub ? '<span class="cockpit-kpi-sub">' + esc(sub) + '</span>' : '') + '</a>';
    }

    var OverviewPage = {
        ExecutiveSummaryStrip: function (t) {
            var pendingStr = t.pending_orders != null ? String(t.pending_orders) : '—';
            return '<section class="admin-card-strip" data-component="ExecutiveSummaryStrip">' +
                '<div class="cockpit-kpi-strip" style="grid-template-columns:repeat(4,minmax(140px,1fr));">' +
                kpiDrill(String(t.total_companies || 0), String(t.active_companies || 0) + ' active', 'Companies', 'customers') +
                kpiDrill(String(t.total_orders || 0), pendingStr + ' pending', 'Orders', 'orders') +
                kpiDrill(String(t.total_products || 0), String(t.featured_products || 0) + ' featured · ' + String(t.products_missing_cost || 0) + ' no cost', 'Products', 'products') +
                kpiDrill(String(t.approved_users || 0) + ' / ' + String(t.unapproved_users || 0), String(t.app_admins_count || 0) + ' app_admins', 'Users', 'users') +
                '</div></section>';
        },
        AdminAlertsPanel: function (ov) {
            var gaps = (ov.schema_gaps || []).map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('');
            return '<aside class="cockpit-panel admin-alerts" data-component="AdminAlertsPanel"><div class="cockpit-panel-header">Schema truth</div><div class="cockpit-panel-body"><ul class="admin-schema-notes">' + (gaps || '<li>No notes</li>') + '</ul></div></aside>';
        },
        OrdersOverviewCard: function (t) {
            return '<div class="cockpit-kpi" data-component="OrdersOverviewCard"><span class="cockpit-kpi-value">' + esc(String(t.total_orders || 0)) + '</span><span class="cockpit-kpi-label">Total orders</span></div>';
        },
        CompaniesOverviewCard: function (t) {
            return '<div class="cockpit-kpi" data-component="CompaniesOverviewCard"><span class="cockpit-kpi-value">' + esc(String(t.total_companies || 0)) + '</span><span class="cockpit-kpi-label">Companies</span></div>';
        },
        ProductsOverviewCard: function (t) {
            return '<div class="cockpit-kpi" data-component="ProductsOverviewCard"><span class="cockpit-kpi-value">' + esc(String(t.total_products || 0)) + '</span><span class="cockpit-kpi-label">Products</span></div>';
        },
        PricingCoverageCard: function (t) {
            return '<div class="cockpit-kpi" data-component="PricingCoverageCard"><span class="cockpit-kpi-value">' + esc(String(t.company_pricing_override_coverage_pct ?? '—')) + '%</span><span class="cockpit-kpi-label">Co. w/ mfg overrides</span></div>';
        },
        UserApprovalsCard: function (t) {
            return '<a href="#" onclick="' + go('users') + '" class="cockpit-kpi cockpit-kpi--drill" data-component="UserApprovalsCard"><span class="cockpit-kpi-value">' + esc(String(t.unapproved_users || 0)) + '</span><span class="cockpit-kpi-label">Pending approvals</span></a>';
        },
        RecentOrdersCard: function (ov) {
            var rows = (ov.recent_orders || []).map(function (o) {
                return '<tr><td class="mono">' + esc(o.order_number) + '</td><td>' + esc(o.company_name || '—') + '</td><td>' + esc(o.status) + '</td><td class="num">$' + (parseFloat(o.total) || 0).toFixed(2) + '</td><td>' + (o.has_stripe_intent ? '<span class="cockpit-badge cockpit-badge--ok">PI</span>' : '—') + '</td><td>' + esc(o.created_at ? new Date(o.created_at).toLocaleString() : '') + '</td></tr>';
            }).join('');
            return '<div class="cockpit-panel" data-component="RecentOrdersCard"><div class="cockpit-panel-header">Recent orders</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-intel-table"><thead><tr><th>#</th><th>Company</th><th>Status</th><th>Total</th><th>Pay</th><th>When</th></tr></thead><tbody>' +
                (rows || '<tr><td colspan="6" class="cockpit-empty-cell">No orders</td></tr>') + '</tbody></table></div></div>';
        },
        RecentCompaniesCard: function (ov) {
            var rows = (ov.recent_companies || []).map(function (c) {
                return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.created_at ? new Date(c.created_at).toLocaleDateString() : '') + '</td><td><a href="#" class="cockpit-intel-link" onclick="state.adminCustomerId=' + c.id + ';renderAdminPanel(\'customers\');return false;">Open</a></td></tr>';
            }).join('');
            return '<div class="cockpit-panel" data-component="RecentCompaniesCard"><div class="cockpit-panel-header">Recent companies</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-intel-table"><thead><tr><th>Name</th><th>Created</th><th></th></tr></thead><tbody>' +
                (rows || '<tr><td colspan="3" class="cockpit-empty-cell">None</td></tr>') + '</tbody></table></div></div>';
        },
        InventoryIntegrityCard: function (ov) {
            var inv = ov.inventory_summary;
            var line = inv ? (inv.row_count + ' rows · ' + inv.total_quantity_on_hand + ' u') : '—';
            return '<a href="#" onclick="' + go('inventory') + '" class="cockpit-panel cockpit-panel--link" data-component="InventoryIntegrityCard"><div class="cockpit-panel-header">Inventory integrity</div><div class="cockpit-panel-body"><strong>' + esc(line) + '</strong><p class="cockpit-hint" style="margin:8px 0 0;">product_id ↔ products.id</p></div></a>';
        },
        /** @param {object} [ops] from GET /api/admin/operations/dashboard */
        composeOperationsDashboard: function (ops) {
            if (!ops || ops.ok !== true) {
                var em = ops && ops.error ? esc(ops.error) : 'Load failed';
                return '<div class="cockpit-panel admin-ops-dash" data-component="OperationsDashboardError"><div class="cockpit-panel-header">Business operations</div><div class="cockpit-panel-body"><p class="cockpit-error" style="font-size:13px;">' + em + '</p></div></div>';
            }
            var s = ops.summary || {};
            var ar = ops.ar || {};
            var meta = ops.meta || {};
            var lim = ops.limitations || [];
            function money(n) {
                if (n == null || !isFinite(Number(n))) return '—';
                return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            function pct(n) {
                if (n == null || !isFinite(Number(n))) return '—';
                return Number(n).toFixed(1) + '%';
            }
            var kpi =
                '<div class="cockpit-kpi-strip admin-ops-kpis" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px;">' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + money(s.revenue_today) + '</span><span class="cockpit-kpi-label">Revenue today (UTC)</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + money(s.revenue_mtd) + '</span><span class="cockpit-kpi-label">Revenue MTD</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(s.orders_today != null ? s.orders_today : '—')) + '</span><span class="cockpit-kpi-label">Orders today</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(s.orders_mtd != null ? s.orders_mtd : '—')) + '</span><span class="cockpit-kpi-label">Orders MTD</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + money(s.aov_mtd) + '</span><span class="cockpit-kpi-label">AOV MTD</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + pct(s.repeat_customer_rate_pct) + '</span><span class="cockpit-kpi-label">Repeat co. rate MTD</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + pct(s.reorder_rate_pct) + '</span><span class="cockpit-kpi-label">Reorder rate MTD</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(s.distinct_customers_mtd != null ? s.distinct_customers_mtd : '—')) + '</span><span class="cockpit-kpi-label">Distinct companies MTD</span></div>' +
                '</div>';
            var arBox =
                '<div class="cockpit-panel" style="margin-top:14px;" data-component="OperationsARPanel">' +
                '<div class="cockpit-panel-header">Invoice terms &amp; AR snapshot</div><div class="cockpit-panel-body">' +
                '<div class="cockpit-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + money(ar.outstanding_total) + '</span><span class="cockpit-kpi-label">Outstanding balance (sum)</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(ar.companies_with_balance != null ? ar.companies_with_balance : '—')) + '</span><span class="cockpit-kpi-label">Companies &gt; $0</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(ar.on_hold_count != null ? ar.on_hold_count : '—')) + '</span><span class="cockpit-kpi-label">Net terms on hold</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(ar.pending_applications != null ? ar.pending_applications : '—')) + '</span><span class="cockpit-kpi-label">Pending applications</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">—</span><span class="cockpit-kpi-label">Overdue AR</span><span class="cockpit-kpi-sub">No due dates in DB</span></div>' +
                '</div>' +
                '<p class="cockpit-hint" style="margin-top:10px;"><a href="#" onclick="' + go('net-terms') + '">Net terms queue →</a></p></div></div>';
            var topCust = (ops.top_customers_mtd || []).map(function (r) {
                return '<tr><td>' + esc(r.company_name) + '</td><td class="num">' + money(r.revenue_mtd) + '</td><td class="num">' + esc(String(r.orders_mtd)) + '</td><td><button type="button" class="cockpit-btn cockpit-btn--sm" onclick="state.adminCustomerId=' + r.company_id + ';renderAdminPanel(\'customers\');return false;">Company</button></td></tr>';
            }).join('');
            var topProd = (ops.top_products_mtd || []).map(function (r) {
                return '<tr><td>' + esc(r.sku || '—') + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + esc((r.name || '').substring(0, 48)) + '</td><td class="num">' + esc(String(r.qty_mtd)) + '</td><td class="num">' + money(r.revenue_mtd) + '</td></tr>';
            }).join('');
            var m = ops.margin || {};
            var marginBlock =
                '<p class="cockpit-hint" style="margin:0 0 8px;">Goods margin (MTD sample, cost-known lines only): <strong>' +
                (m.goods_margin_pct != null ? esc(String(m.goods_margin_pct)) + '%' : '—') +
                '</strong> · lines w/ cost: <strong>' +
                (m.lines_with_cost_pct != null ? esc(String(m.lines_with_cost_pct)) + '%' : '—') +
                '</strong> · sample orders: ' +
                esc(String(m.sample_orders || 0)) +
                '</p>' +
                '<p class="cockpit-hint" style="font-size:11px;">' + esc(m.note || '') + '</p>';
            var lowP = (ops.low_margin_products_mtd || []).map(function (r) {
                return '<tr><td>' + esc(r.sku || '—') + '</td><td>' + esc((r.name || '').substring(0, 36)) + '</td><td class="num">' + (r.goods_margin_pct != null ? esc(String(r.goods_margin_pct)) + '%' : '—') + '</td><td class="num">' + money(r.revenue_mtd) + '</td></tr>';
            }).join('');
            var lowO = (ops.low_margin_orders_mtd || []).map(function (r) {
                return '<tr><td class="mono">' + esc(r.order_number || '#' + r.order_id) + '</td><td>' + esc(r.company_name || '—') + '</td><td class="num">' + (r.goods_margin_pct != null ? esc(String(r.goods_margin_pct)) + '%' : '—') + '</td><td class="num">' + money(r.net_merchandise_covered) + '</td><td><button type="button" class="cockpit-btn cockpit-btn--sm" onclick="renderAdminPanel(\'orders\');return false;">Orders</button></td></tr>';
            }).join('');
            var stale = (ops.stale_customers || []).map(function (r) {
                return '<tr><td>' + esc(r.company_name) + '</td><td class="num">' + esc(String(r.days_since_order != null ? r.days_since_order : '—')) + '</td><td>' + esc(r.last_order_at ? new Date(r.last_order_at).toLocaleDateString() : '') + '</td><td><button type="button" class="cockpit-btn cockpit-btn--sm" onclick="state.adminCustomerId=' + r.company_id + ';renderAdminPanel(\'customers\');return false;">Open</button></td></tr>';
            }).join('');
            var recent = (ops.recent_orders_mtd || []).map(function (o) {
                return '<tr><td class="mono">' + esc(o.order_number || '') + '</td><td>' + esc(o.company_name || '—') + '</td><td>' + esc(o.status || '') + '</td><td class="num">' + money(o.total) + '</td><td>' + esc(o.created_at ? new Date(o.created_at).toLocaleString() : '') + '</td></tr>';
            }).join('');
            var limHtml = lim.length
                ? '<ul class="admin-schema-notes" style="margin-top:12px;">' + lim.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
                : '';
            var defs =
                '<details class="admin-ops-meta" style="margin-top:12px;font-size:12px;color:var(--cockpit-text-muted);"><summary style="cursor:pointer;font-weight:600;color:var(--cockpit-text);">Metric definitions &amp; limits</summary>' +
                '<ul style="margin:8px 0 0;padding-left:18px;line-height:1.45;">' +
                '<li><strong>Revenue</strong>: ' + esc(meta.revenue_order_definition || '') + '</li>' +
                '<li><strong>Repeat customer rate</strong>: ' + esc(meta.repeat_customer_definition || '') + '</li>' +
                '<li><strong>Reorder rate</strong>: ' + esc(meta.reorder_rate_definition || '') + '</li>' +
                '<li><strong>Margin</strong>: ' + esc(meta.margin_definition || '') + '</li>' +
                '<li><strong>AR</strong>: ' + esc(meta.ar_definition || '') + ' ' + esc(meta.overdue_note || '') + '</li>' +
                '<li><strong>Stale customers</strong>: ' + esc(meta.last_activity_map_definition || '') + '</li>' +
                '</ul></details>';
            return (
                '<section class="admin-ops-dash" data-component="OperationsDashboard">' +
                '<div class="cockpit-truth-banner" style="margin-top:20px;background:rgba(5,150,105,0.12);border-color:rgba(5,150,105,0.35);"><i class="fas fa-chart-line"></i> <strong>Business operations</strong> — UTC month/day boundaries · excludes cancelled &amp; abandoned checkout. <a href="#" onclick="' +
                go('margin-insights') +
                '" style="margin-left:8px;font-weight:600;">Shipping &amp; margin deep-dive →</a></div>' +
                kpi +
                arBox +
                '<div class="cockpit-overview-grid" style="margin-top:16px;">' +
                '<div class="cockpit-overview-main">' +
                '<div class="cockpit-panel"><div class="cockpit-panel-header">Top customers (MTD revenue)</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-intel-table"><thead><tr><th>Company</th><th class="num">Revenue</th><th class="num">Orders</th><th></th></tr></thead><tbody>' +
                (topCust || '<tr><td colspan="4" class="cockpit-empty-cell">No MTD data</td></tr>') +
                '</tbody></table></div></div>' +
                '<div class="cockpit-panel"><div class="cockpit-panel-header">Top products (MTD)</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-intel-table"><thead><tr><th>SKU</th><th>Name</th><th class="num">Qty</th><th class="num">Revenue</th></tr></thead><tbody>' +
                (topProd || '<tr><td colspan="4" class="cockpit-empty-cell">No lines</td></tr>') +
                '</tbody></table></div></div>' +
                '<div class="cockpit-panel"><div class="cockpit-panel-header">Margin &amp; low performers (estimated)</div><div class="cockpit-panel-body">' +
                marginBlock +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:12px;">' +
                '<div><div class="cockpit-hint" style="font-weight:600;margin-bottom:6px;">Lowest goods margin · products</div><table class="cockpit-intel-table"><thead><tr><th>SKU</th><th>Name</th><th class="num">GM%</th><th class="num">Rev</th></tr></thead><tbody>' +
                (lowP || '<tr><td colspan="4" class="cockpit-empty-cell">Need cost on products</td></tr>') +
                '</tbody></table></div>' +
                '<div><div class="cockpit-hint" style="font-weight:600;margin-bottom:6px;">Lowest goods margin · orders</div><table class="cockpit-intel-table"><thead><tr><th>Order</th><th>Company</th><th class="num">GM%</th><th class="num">Covered net</th><th></th></tr></thead><tbody>' +
                (lowO || '<tr><td colspan="5" class="cockpit-empty-cell">—</td></tr>') +
                '</tbody></table></div></div></div></div>' +
                '<div class="cockpit-panel"><div class="cockpit-panel-header">Customers quiet ' + esc(String(s.stale_customer_days || 90)) + '+ days (see definition)</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-intel-table"><thead><tr><th>Company</th><th class="num">Days</th><th>Last order</th><th></th></tr></thead><tbody>' +
                (stale || '<tr><td colspan="4" class="cockpit-empty-cell">None in window</td></tr>') +
                '</tbody></table></div></div>' +
                '<div class="cockpit-panel"><div class="cockpit-panel-header">Recent orders (MTD, newest)</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-intel-table"><thead><tr><th>#</th><th>Company</th><th>Status</th><th class="num">Total</th><th>When</th></tr></thead><tbody>' +
                (recent || '<tr><td colspan="5" class="cockpit-empty-cell">—</td></tr>') +
                '</tbody></table><p class="cockpit-hint" style="margin-top:8px;"><a href="#" onclick="' + go('orders') + '">Full order queue →</a></p></div></div>' +
                '</div><div class="cockpit-overview-sidebar">' +
                '<div class="cockpit-panel"><div class="cockpit-panel-header">Notes</div><div class="cockpit-panel-body"><p class="cockpit-hint" style="font-size:12px;">' +
                esc((meta.margin_limitations || []).join(' ')) +
                '</p>' +
                limHtml +
                defs +
                '</div></div></div></div></section>'
            );
        },
        compose: function (ov, ops) {
            var t = ov.totals || {};
            var opsDash = this.composeOperationsDashboard(ops);
            return '<div class="overview-page" data-page="OverviewPage">' +
                '<div class="cockpit-truth-banner"><i class="fas fa-database"></i> <strong>Live data</strong> — companies, orders, products, users, app_admins, customer_manufacturer_pricing, inventory.</div>' +
                this.ExecutiveSummaryStrip(t) +
                opsDash +
                '<div class="cockpit-kpi-strip overview-secondary-kpis" style="grid-template-columns:repeat(4,minmax(120px,1fr));margin-top:8px;">' +
                this.OrdersOverviewCard(t) + this.CompaniesOverviewCard(t) + this.ProductsOverviewCard(t) + this.PricingCoverageCard(t) +
                '</div>' +
                '<div class="cockpit-kpi-strip" style="grid-template-columns:repeat(2,minmax(120px,1fr));margin-top:8px;">' +
                this.UserApprovalsCard(t) +
                '<a href="#" onclick="' + go('stripe') + '" class="cockpit-kpi cockpit-kpi--drill"><span class="cockpit-kpi-value">Payments</span><span class="cockpit-kpi-label">Stripe intents on orders</span></a>' +
                '</div>' +
                '<div class="cockpit-overview-grid" style="margin-top:20px;">' +
                '<div class="cockpit-overview-main">' + this.RecentOrdersCard(ov) + this.RecentCompaniesCard(ov) + '</div>' +
                '<div class="cockpit-overview-sidebar">' + this.InventoryIntegrityCard(ov) + this.AdminAlertsPanel(ov) + '</div>' +
                '</div></div>';
        }
    };

    var CompaniesPage = {
        CompaniesSummaryStrip: function (rows) {
            return '<div class="admin-summary-strip" data-component="CompaniesSummaryStrip"><span>' + rows.length + ' companies</span></div>';
        },
        CompaniesToolbar: function () {
            return '<div class="cockpit-toolbar" data-component="CompaniesToolbar"><input type="text" id="ownerCoNewName" class="cockpit-input" placeholder="New company name"><button type="button" class="cockpit-btn cockpit-btn--primary" onclick="ownerCreateCompany()"><i class="fas fa-plus"></i> Create</button></div>';
        },
        CompaniesTable: function (rows) {
            var table = rows.map(function (c) {
                return '<tr><td><strong>' + esc(c.name) + '</strong></td><td>' + esc(c.operational_status) + '</td><td>' + esc(c.default_gross_margin_percent) + '%</td><td style="font-size:11px;">' + esc(c.pricing_mode_label) + '</td><td>' + (c.stripe_orders_with_intent > 0 ? esc(String(c.stripe_orders_with_intent)) + ' w/ intent' : '—') + '</td><td>' + (c.payment_methods_count != null ? c.payment_methods_count : '<span title="' + esc(c.payment_methods_schema_note || '') + '">N/A</span>') + '</td><td class="num">' + c.member_count + '</td><td class="num">' + c.order_count + '</td><td>' + (c.last_order_at ? esc(new Date(c.last_order_at).toLocaleDateString()) : '—') + '</td><td><button type="button" class="cockpit-btn cockpit-btn--sm" onclick="state.adminCustomerId=' + c.id + ';renderAdminPanel(\'customers\');return false;">Detail</button></td></tr>';
            }).join('');
            return '<div class="admin-table-wrap" data-component="CompaniesTable"><table class="cockpit-data-table"><thead><tr><th>Name</th><th>Status</th><th>Margin</th><th>Pricing</th><th>Stripe</th><th>Pmt</th><th>Members</th><th>Orders</th><th>Last</th><th></th></tr></thead><tbody>' +
                (table || '<tr><td colspan="10" class="cockpit-empty-cell">No companies</td></tr>') + '</tbody></table></div>';
        },
        composeDirectory: function (res) {
            var rows = res.companies || [];
            return '<div class="companies-page" data-page="CompaniesPage">' +
                '<div class="cockpit-section-head"><h2>Companies</h2>' + this.CompaniesToolbar() + '</div>' +
                this.CompaniesSummaryStrip(rows) + this.CompaniesTable(rows) +
                '<p class="cockpit-hint">Detail drawer: pricing, members (future tabs). <code>company_members</code> in DB.</p></div>';
        }
    };

    var PricingPage = {
        PricingSummaryStrip: function (s) {
            return '<div class="admin-summary-strip" data-component="PricingSummaryStrip">' + esc(s.total_companies) + ' companies · ' + esc(s.companies_with_any_override) + ' w/ overrides · ' + esc(s.total_override_rows) + ' rows</div>';
        },
        CompanyPricingTable: function (companies) {
            var coRows = (companies || []).map(function (c) {
                return '<tr><td>' + esc(c.name) + '</td><td class="num">' + esc(c.default_gross_margin_percent) + '%</td><td>' + (c.has_manufacturer_overrides ? 'Yes' : 'Default') + '</td><td><button type="button" class="cockpit-btn cockpit-btn--sm" onclick="state.adminCustomerId=' + c.id + ';renderAdminPanel(\'customers\');return false;">Edit</button></td></tr>';
            }).join('');
            return '<div class="cockpit-panel" data-component="CompanyPricingTable"><div class="cockpit-panel-header">Company default margins</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-data-table"><thead><tr><th>Company</th><th>Default margin</th><th>Overrides</th><th></th></tr></thead><tbody>' + coRows + '</tbody></table></div></div>';
        },
        ManufacturerPricingTable: function (d) {
            var ovRows = (d.manufacturer_overrides || []).map(function (o) {
                var cn = (d.companies || []).find(function (x) { return x.id === o.company_id; });
                return '<tr><td>' + esc(cn ? cn.name : ('#' + o.company_id)) + '</td><td>' + esc(o.manufacturer_name) + '</td><td class="num">' + esc(o.margin_percent) + '%</td></tr>';
            }).join('');
            return '<div class="cockpit-panel" data-component="ManufacturerPricingTable"><div class="cockpit-panel-header">customer_manufacturer_pricing</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-data-table"><thead><tr><th>Company</th><th>Manufacturer</th><th>Margin</th></tr></thead><tbody>' +
                (ovRows || '<tr><td colspan="3" class="cockpit-empty-cell">No overrides</td></tr>') + '</tbody></table></div></div>';
        },
        PricingHealthPanel: function () {
            return '<div class="cockpit-panel" data-component="PricingHealthPanel"><div class="cockpit-panel-header">Health</div><div class="cockpit-panel-body"><p class="cockpit-hint">No separate company_pricing table — defaults on <code>companies</code>, exceptions in <code>customer_manufacturer_pricing</code>.</p></div></div>';
        },
        SupplierCostImportPanel: function (d) {
            var sci = d.supplier_cost_import || {};
            var def = sci.default_rules || {};
            var lm = def.list_margin_percent != null ? def.list_margin_percent : 45;
            var bm = def.bulk_margin_percent != null ? def.bulk_margin_percent : 35;
            var t2 = def.tier2_margin_percent != null ? def.tier2_margin_percent : 38;
            var t3 = def.tier3_margin_percent != null ? def.tier3_margin_percent : 40;
            var floorM = def.min_price_floor_multiplier != null ? def.min_price_floor_multiplier : 1;
            var runs = sci.recent_runs || [];
            var runRows = runs.map(function (r) {
                var sum = r.summary || {};
                return '<tr><td class="mono">' + esc(r.id) + '</td><td>' + esc(r.status) + '</td><td class="num">' + esc(sum.rows_updated != null ? sum.rows_updated : '—') + '</td><td style="font-size:11px;">' + esc(sum.rows_processed != null ? 'proc ' + sum.rows_processed : '') + '</td><td>' + esc(r.created_at || '') + '</td></tr>';
            }).join('');
            var loadErr = sci.load_error ? '<p class="cockpit-error" style="font-size:12px;">Recent runs: ' + esc(sci.load_error) + ' (apply migration if tables missing)</p>' : '';
            return '<div class="cockpit-panel" data-component="SupplierCostImportPanel" style="margin-top:20px;">' +
                '<div class="cockpit-panel-header">Supplier cost → list / bulk pricing</div>' +
                '<div class="cockpit-panel-body">' +
                '<p class="cockpit-hint">Import CSV with <code>sku</code>, <code>supplier_cost</code> (or <code>cost</code>), optional <code>case_qty</code>, <code>brand</code>, <code>map</code>, <code>product_id</code> (must match SKU), <code>weight</code>, <code>shipping_class</code>. Preview is dry-run; apply writes <code>products.cost</code>, <code>price</code>, <code>bulk_price</code>, and <code>pricing_derivation</code> for audit.</p>' +
                loadErr +
                '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:12px 0;">' +
                '<label style="font-size:11px;">List margin %<br><input type="number" id="adminSupplierCostListMargin" step="0.1" min="0" max="99" value="' + esc(lm) + '" style="width:100%;padding:6px;"></label>' +
                '<label style="font-size:11px;">Bulk margin %<br><input type="number" id="adminSupplierCostBulkMargin" step="0.1" min="0" max="99" value="' + esc(bm) + '" style="width:100%;padding:6px;"></label>' +
                '<label style="font-size:11px;">Tier2 ref margin %<br><input type="number" id="adminSupplierCostT2" step="0.1" min="0" max="99" value="' + esc(t2) + '" style="width:100%;padding:6px;"></label>' +
                '<label style="font-size:11px;">Tier3 ref margin %<br><input type="number" id="adminSupplierCostT3" step="0.1" min="0" max="99" value="' + esc(t3) + '" style="width:100%;padding:6px;"></label>' +
                '<label style="font-size:11px;">List × cost (opt.)<br><input type="number" id="adminSupplierCostListMult" step="0.01" min="0" placeholder="—" style="width:100%;padding:6px;"></label>' +
                '<label style="font-size:11px;">Floor × cost<br><input type="number" id="adminSupplierCostFloorMult" step="0.01" min="0.01" value="' + esc(floorM) + '" style="width:100%;padding:6px;"></label>' +
                '</div>' +
                '<label style="font-size:11px;">MAP policy<br><select id="adminSupplierCostMapPol" style="padding:6px;margin-bottom:8px;">' +
                '<option value="floor_for_list"' + (def.map_policy !== 'none' ? ' selected' : '') + '>Raise list to MAP when below</option>' +
                '<option value="none"' + (def.map_policy === 'none' ? ' selected' : '') + '>Ignore MAP</option></select></label> ' +
                '<label style="font-size:11px;margin-left:12px;"><input type="checkbox" id="adminSupplierCostMapBulk"' + (def.map_applies_to_bulk ? ' checked' : '') + '> MAP also floors bulk</label><br>' +
                '<label style="font-size:11px;margin-right:16px;"><input type="checkbox" id="adminSupplierCostNoCase"> Do not update case qty</label>' +
                '<label style="font-size:11px;margin-right:16px;"><input type="checkbox" id="adminSupplierCostBrand"> Update brand from CSV</label>' +
                '<label style="font-size:11px;"><input type="checkbox" id="adminSupplierCostNoShip"> Skip weight / ship class → attributes</label>' +
                '<label style="display:block;font-size:11px;font-weight:600;margin:12px 0 4px;">CSV</label>' +
                '<textarea id="adminSupplierCostCsv" rows="8" style="width:100%;font-family:monospace;font-size:11px;padding:8px;" placeholder="sku,supplier_cost,case_qty,map,brand&#10;ABC-1,12.50,10,15.99,Acme"></textarea>' +
                '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
                '<button type="button" class="cockpit-btn cockpit-btn--primary" onclick="adminSupplierCostPreview()"><i class="fas fa-eye"></i> Preview (dry-run)</button>' +
                '<span class="cockpit-hint">Creates an auditable run; no product writes until Apply.</span></div>' +
                '<div id="adminSupplierCostPreviewOut" style="margin-top:14px;"></div>' +
                '<div style="margin-top:20px;overflow:auto;max-height:180px;"><div class="cockpit-panel-header" style="font-size:12px;">Recent import runs</div>' +
                '<table class="cockpit-data-table"><thead><tr><th>Run</th><th>Status</th><th class="num">Updated</th><th>Summary</th><th>Created</th></tr></thead><tbody>' +
                (runRows || '<tr><td colspan="5" class="cockpit-empty-cell">None</td></tr>') + '</tbody></table></div>' +
                '</div></div>';
        },
        composeWorkspace: function (d) {
            var s = d.summary || {};
            return '<div class="pricing-page" data-page="PricingPage">' +
                '<h2 class="admin-page-heading">Pricing</h2>' + this.PricingSummaryStrip(s) +
                this.CompanyPricingTable(d.companies) +
                '<div style="margin-top:16px;">' + this.ManufacturerPricingTable(d) + '</div>' +
                this.SupplierCostImportPanel(d || {}) +
                this.PricingHealthPanel() + '</div>';
        }
    };

    var PaymentsPage = {
        StripeCustomersTable: function (d) {
            var byCo = (d.by_company || []).map(function (x) {
                return '<tr><td>' + esc(x.company_name || ('ID ' + x.company_id)) + '</td><td class="num">' + x.order_count + '</td><td>' + esc(x.last_at ? new Date(x.last_at).toLocaleDateString() : '') + '</td></tr>';
            }).join('');
            return '<div class="cockpit-panel" data-component="StripeCustomersTable"><div class="cockpit-panel-header">Companies by Stripe-backed orders</div><p class="cockpit-hint">Derived from <code>orders.stripe_payment_intent_id</code> — not a stripe_customers table.</p><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-data-table"><thead><tr><th>Company</th><th>Orders w/ intent</th><th>Last</th></tr></thead><tbody>' + (byCo || '<tr><td colspan="3" class="cockpit-empty-cell">None</td></tr>') + '</tbody></table></div></div>';
        },
        PaymentMethodsTable: function () {
            return '<div class="cockpit-panel" data-component="PaymentMethodsTable"><div class="cockpit-panel-header">Payment methods</div><div class="cockpit-panel-body"><p class="cockpit-hint">No <code>payment_methods</code> table in this schema. Methods appear on orders as <code>payment_method</code> text.</p><p class="cockpit-empty-cell" style="padding:16px;">No centralized card/ACH vault in DB.</p></div></div>';
        },
        compose: function (d) {
            var recent = (d.recent_with_intent || []).map(function (o) {
                return '<tr><td class="mono">' + esc(o.order_number) + '</td><td>' + esc(o.company_name || '—') + '</td><td class="num">$' + (parseFloat(o.total) || 0).toFixed(2) + '</td><td>' + esc(o.created_at ? new Date(o.created_at).toLocaleString() : '') + '</td></tr>';
            }).join('');
            return '<div class="payments-page" data-page="PaymentsPage">' +
                '<div class="cockpit-truth-banner"><i class="fas fa-info-circle"></i> ' + esc(d.source) + '</div>' +
                '<div class="cockpit-kpi-strip" style="grid-template-columns:repeat(2,1fr);max-width:480px;"><div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(d.orders_with_payment_intent)) + '</span><span class="cockpit-kpi-label">Orders w/ payment intent</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + esc(String(d.orders_total_sampled)) + '</span><span class="cockpit-kpi-label">Sampled</span></div></div>' +
                '<div class="cockpit-panel" style="margin-top:16px;"><div class="cockpit-panel-header">Recent orders (Stripe intent)</div><div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-data-table"><thead><tr><th>Order</th><th>Company</th><th>Total</th><th>When</th></tr></thead><tbody>' +
                (recent || '<tr><td colspan="4" class="cockpit-empty-cell">None</td></tr>') + '</tbody></table></div></div>' +
                this.StripeCustomersTable(d) + this.PaymentMethodsTable() + '</div>';
        }
    };

    var InventoryPage = {
        InventoryIntegrityBanner: function (d) {
            return '<div class="cockpit-truth-banner" data-component="InventoryIntegrityBanner"><strong>Integrity</strong> — ' + esc(d.product_resolution || '') + ' ' + esc(d.integrity_note || '') + '</div>';
        },
        InventorySummaryCard: function (d) {
            return '<div class="cockpit-kpi" data-component="InventorySummaryCard"><span class="cockpit-kpi-value">' + esc(String(d.row_count_returned || 0)) + '</span><span class="cockpit-kpi-label">Rows loaded</span></div>';
        },
        RawInventoryTable: function (d) {
            var rows = (d.rows || []).map(function (r) {
                var ph = r.product_hint;
                return '<tr><td class="mono">' + esc(r.product_id) + '</td><td>' + (ph ? esc(ph.sku) + ' · ' + esc((ph.name || '').substring(0, 40)) : '—') + '</td><td class="num">' + esc(r.quantity_on_hand) + '</td><td class="num">' + esc(r.reorder_point) + '</td><td>' + esc(r.bin_location || '—') + '</td></tr>';
            }).join('');
            return '<div data-component="RawInventoryTable" style="overflow-x:auto;max-height:60vh;"><table class="cockpit-data-table"><thead><tr><th>product_id</th><th>Product</th><th>QOH</th><th>ROP</th><th>Bin</th></tr></thead><tbody>' +
                (rows || '<tr><td colspan="5" class="cockpit-empty-cell">No rows</td></tr>') + '</tbody></table></div>';
        },
        compose: function (d) {
            return '<div class="inventory-page" data-page="InventoryPage">' +
                this.InventoryIntegrityBanner(d) + this.InventorySummaryCard(d) +
                '<button type="button" class="cockpit-btn cockpit-btn--primary" style="margin:12px 0;" onclick="loadAdminInventory()"><i class="fas fa-edit"></i> Legacy editor (writes)</button>' +
                this.RawInventoryTable(d) + '</div>';
        }
    };

    var SettingsPage = {
        CompanyDefaultsCard: function () {
            return '<div class="cockpit-panel" data-component="CompanyDefaultsCard"><div class="cockpit-panel-header">Company defaults</div><div class="cockpit-panel-body"><p class="cockpit-hint">Default gross margin is per company on <code>companies</code>. Edit via Companies → detail.</p></div></div>';
        },
        AdminControlsCard: function () {
            return '<div class="cockpit-panel" data-component="AdminControlsCard"><div class="cockpit-panel-header">Admin access</div><div class="cockpit-panel-body"><p class="cockpit-hint"><code>public.app_admins.auth_user_id</code> only.</p></div></div>';
        },
        FeatureFlagsPlaceholder: function () {
            return '<div class="cockpit-panel" data-component="FeatureFlagsPlaceholder"><div class="cockpit-panel-header">Feature flags</div><div class="cockpit-panel-body"><p class="cockpit-empty-cell">Not configured.</p></div></div>';
        },
        compose: function () {
            return '<div class="settings-page" data-page="SettingsPage"><h2 class="admin-page-heading">Settings</h2>' +
                this.CompanyDefaultsCard() + this.AdminControlsCard() + this.FeatureFlagsPlaceholder() + '</div>';
        }
    };

    var IntegrationsPage = {
        compose: function () {
            return '<div class="integrations-page" data-page="IntegrationsPage" data-component="IntegrationsNavItem">' +
                '<h2 class="admin-page-heading">Integrations</h2>' +
                '<div class="cockpit-panel"><div class="cockpit-panel-header">External systems</div><div class="cockpit-panel-body"><p class="cockpit-hint">Placeholder — connect webhooks, ERP, or email providers here when wired. No fake vendor domains.</p></div></div></div>';
        }
    };

    /**
     * OrdersPage — markup only. Fetch/filter/handlers remain in app.js.
     */
    var OrdersPage = {
        computeStats: function (orders) {
            var o = { total: (orders || []).length, pending: 0, processing: 0, shipped: 0, completed: 0, other: 0 };
            (orders || []).forEach(function (r) {
                var st = (r.status || 'pending').toLowerCase();
                if (st === 'pending') o.pending++;
                else if (st === 'processing') o.processing++;
                else if (st === 'shipped') o.shipped++;
                else if (st === 'completed') o.completed++;
                else o.other++;
            });
            return o;
        },
        states: {
            loading: function () {
                return '<div class="ops-empty admin-state-loading" data-component="OrdersPageLoading"><i class="fas fa-spinner fa-spin"></i><p>Loading orders…</p></div>';
            },
            authRequired: function () {
                return '<div class="ops-empty admin-state-auth" data-component="OrdersPageAuthRequired"><i class="fas fa-lock"></i><div class="ops-empty-title">Authentication required</div><p>Log in to manage the order queue.</p><button type="button" class="ops-btn-ghost" onclick="navigate(\'login\')">Go to login</button></div>';
            },
            emptyPage: function () {
                return '<div class="ops-empty admin-state-empty" data-component="OrdersPageEmpty"><i class="fas fa-shopping-cart"></i><div class="ops-empty-title">No orders yet</div><p>When customers check out, they appear here for fulfillment.</p></div>';
            },
            error: function (msg, hint403) {
                var h = hint403 ? '<p>Admin access required.</p>' : '';
                return '<div class="ops-empty admin-state-error" data-component="OrdersPageError"><i class="fas fa-exclamation-triangle"></i><div class="ops-empty-title">Error loading orders</div><p>' + esc(msg || 'Unknown error') + '</p>' + h +
                    '<button type="button" class="ops-btn-ghost" onclick="loadAdminOrders()">Retry</button></div>';
            },
            emptyTable: function () {
                return '<tr><td colspan="10" class="ops-empty admin-state-empty-table" data-component="OrdersTableEmpty" style="border:none;padding:40px;"><i class="fas fa-inbox"></i><div class="ops-empty-title">No orders match</div><p>Try another status filter or clear search.</p></td></tr>';
            }
        },
        summaryStrip: function (s) {
            var pend = s.pending + s.processing;
            return '<div class="orders-summary-strip cockpit-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(100px,1fr));margin-bottom:12px;gap:8px;" data-component="OrdersSummaryStrip">' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.total + '</span><span class="cockpit-kpi-label">Total</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + pend + '</span><span class="cockpit-kpi-label">Pending / processing</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.shipped + '</span><span class="cockpit-kpi-label">Shipped</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.completed + '</span><span class="cockpit-kpi-label">Completed</span></div>' +
                (s.other > 0 ? '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.other + '</span><span class="cockpit-kpi-label">Other status</span></div>' : '') +
                '</div>';
        },
        toolbar: function () {
            return '<div class="ops-toolbar" data-component="OrdersToolbar">' +
                '<div class="ops-toolbar__head"><span class="ops-toolbar__title">Fulfillment queue</span><span id="adminOrdersMeta" class="ops-table-footer__meta"></span></div>' +
                '<div class="ops-toolbar__row" data-component="OrdersToolbarSearch">' +
                '<div class="ops-search-wrap" style="max-width:320px;"><i class="fas fa-search ops-search-icon"></i>' +
                '<input type="text" id="adminOrdersSearch" class="ops-search" placeholder="Order #, company, email…" oninput="renderAdminOrdersTable()"></div></div>' +
                '<div class="ops-chip-row" data-component="OrdersToolbarFilters"><span class="ops-chip-row-label">Status</span>' +
                '<button type="button" class="ops-chip js-order-status-chip ops-chip--active" data-status="all" onclick="adminOrdersSetStatusFilter(\'all\')">All</button>' +
                '<button type="button" class="ops-chip js-order-status-chip" data-status="pending" onclick="adminOrdersSetStatusFilter(\'pending\')">Pending</button>' +
                '<button type="button" class="ops-chip js-order-status-chip" data-status="processing" onclick="adminOrdersSetStatusFilter(\'processing\')">Processing</button>' +
                '<button type="button" class="ops-chip js-order-status-chip" data-status="shipped" onclick="adminOrdersSetStatusFilter(\'shipped\')">Shipped</button>' +
                '<button type="button" class="ops-chip js-order-status-chip" data-status="completed" onclick="adminOrdersSetStatusFilter(\'completed\')">Completed</button></div></div>';
        },
        bulkBar: function () {
            return '<div id="adminOrdersBulkBar" class="ops-bulk-bar" data-component="OrdersBulkBar">' +
                '<label class="ops-bulk-bar__label"><input type="checkbox" id="adminOrdersSelectAll" onchange="adminOrdersToggleSelectAll()"><span>Page</span></label>' +
                '<span class="ops-bulk-divider"></span><button type="button" class="ops-btn-ghost" onclick="adminOrdersCopyIds()"><i class="fas fa-copy"></i> Copy order #s</button>' +
                '<span id="adminOrdersBulkCount" style="font-size:11px;color:var(--cockpit-text-muted);"></span></div>';
        },
        tableShell: function () {
            return '<div class="ops-table-scroll ops-table-scroll--tall" data-component="OrdersTable"><div class="admin-datatable-wrap" style="border:none;border-radius:0;">' +
                '<table class="admin-datatable ops-table-dense"><thead><tr>' +
                '<th style="width:28px"></th><th>Order / account</th><th>Date</th><th>Status</th><th class="num">Lines</th><th class="num">Total</th><th class="num" title="shipping_policy_versions.id">Ship pol.</th><th>Email</th><th>Tracking</th><th style="width:88px"></th></tr></thead><tbody id="adminOrdersTbody"></tbody></table></div></div>';
        },
        tableFooter: function () {
            return '<div class="ops-table-footer" data-component="OrdersTableFooter"><span class="ops-table-footer__meta" id="adminOrdersFooter"></span><span style="font-size:10px;color:var(--cockpit-text-muted);"><i class="fas fa-list"></i> = line items</span></div>';
        },
        composeShell: function (stats) {
            return '<div class="orders-page ops-shell" data-page="OrdersPage">' +
                this.summaryStrip(stats) +
                this.toolbar() +
                this.bulkBar() +
                this.tableShell() +
                this.tableFooter() +
                '</div>';
        },
        /** One main row + expandable line-items row per order */
        tableRowsHtml: function (filteredOrders) {
            var self = this;
            return filteredOrders.map(function (order) {
                return self._orderRowPair(order);
            }).join('');
        },
        _orderRowPair: function (order) {
            var onum = order.order_number || ('#' + order.id);
            var st = (order.status || 'pending').toLowerCase();
            var badge = st === 'completed' ? 'cockpit-status-badge--ok' : (st === 'pending' ? 'cockpit-status-badge--warn' : (st === 'shipped' ? 'cockpit-status-badge--ok' : 'cockpit-status-badge--muted'));
            if (st === 'shipped') badge = 'cockpit-status-badge--ok';
            var items = (order.items && order.items.length) || 0;
            var co = order.user && order.user.company_name ? order.user.company_name : 'Unknown';
            var dt = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—';
            var pm = String(order.payment_method || '').toLowerCase();
            var inv = order.invoice_status;
            var invHtml = '';
            if (pm === 'net30' && inv) {
                invHtml =
                    '<div class="ops-cell-secondary" style="font-size:10px;margin-top:2px;">' +
                    '<span class="cockpit-status-badge cockpit-status-badge--muted">' +
                    esc(inv) +
                    '</span>';
                if (order.invoice_due_at) {
                    invHtml += ' · due ' + esc(new Date(order.invoice_due_at).toLocaleDateString());
                }
                invHtml +=
                    ' · paid $' +
                    Number(order.invoice_amount_paid || 0).toFixed(2) +
                    ' / $' +
                    Number(order.invoice_amount_due || 0).toFixed(2) +
                    '</div>';
            } else if (pm === 'net30' && order.invoice_amount_due == null) {
                invHtml =
                    '<div class="ops-cell-secondary" style="font-size:10px;color:#b45309;margin-top:2px;">Invoice AR not posted (run migration?)</div>';
            }
            var payInvBtn =
                pm === 'net30' && inv && inv !== 'paid'
                    ? '<button type="button" class="ops-icon-btn" style="color:#059669;" title="Record invoice payment" onclick="adminOpenInvoicePaymentModal(' +
                      order.id +
                      ')"><i class="fas fa-dollar-sign"></i></button>'
                    : '';
            var trackPayload = encodeURIComponent(JSON.stringify({ tracking_number: order.tracking_number || '', tracking_url: order.tracking_url || '', status: order.status || 'pending' }));
            var spv =
                order.shipping_policy_version_id != null && order.shipping_policy_version_id !== ''
                    ? String(order.shipping_policy_version_id)
                    : '—';
            var lines = (order.items || []).map(function (item) {
                var variantSku = (item.variant_sku && String(item.variant_sku).trim()) || (item.sku && String(item.sku)) || '—';
                return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cockpit-border);"><span>' + esc(item.name) + ' <span class="mono">' + esc(variantSku) + '</span> ×' + (item.quantity || 0) + '</span><span class="num">$' + ((item.price || 0) * (item.quantity || 0)).toFixed(2) + '</span></div>';
            }).join('');
            var contact = order.user ? '<div style="margin-top:8px;color:var(--cockpit-text-muted);">' + esc(order.user.contact_name || '') + '</div>' : '';
            return '<tr class="ops-row" data-oid="' + order.id + '">' +
                '<td onclick="event.stopPropagation()"><input type="checkbox" class="admin-order-select" data-oid="' + order.id + '" data-order-num="' + esc(onum) + '" onchange="adminOrdersBulkUpdate()"></td>' +
                '<td class="ops-cell-stack"><div class="ops-cell-primary mono">' + esc(onum) + '</div><div class="ops-cell-secondary">' + esc(co) + '</div>' + invHtml + '</td>' +
                '<td style="font-size:11px;">' + esc(dt) + '</td>' +
                '<td><span class="cockpit-status-badge ' + badge + '">' + esc(st) + '</span></td>' +
                '<td class="num">' + items + '</td>' +
                '<td class="num" style="font-weight:600;color:var(--cockpit-text);">$' + Number(order.total || 0).toFixed(2) + '</td>' +
                '<td class="mono" style="font-size:10px;" title="shipping_policy_version_id">' + esc(spv) + '</td>' +
                '<td style="font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis;">' + esc((order.user && order.user.email) || '—') + '</td>' +
                '<td class="mono" style="font-size:10px;">' + esc(order.tracking_number || '—') + '</td>' +
                '<td onclick="event.stopPropagation()" class="ops-actions">' +
                payInvBtn +
                '<button type="button" class="ops-icon-btn ops-icon-btn--primary" title="Tracking & status" onclick="openAdminOrderTrackingModal(' + order.id + ',\'' + trackPayload + '\')"><i class="fas fa-truck"></i></button>' +
                '<button type="button" class="ops-icon-btn" title="PO" onclick="createPoFromOrder(' + order.id + ')"><i class="fas fa-file-invoice"></i></button>' +
                '<button type="button" class="ops-icon-btn" title="Line items" onclick="adminOrdersToggleDetail(' + order.id + ')"><i class="fas fa-list"></i></button></td></tr>' +
                '<tr class="admin-order-detail" id="adminOrderDetail_' + order.id + '" style="display:none;"><td colspan="10" style="background:var(--cockpit-bg);padding:10px 14px;font-size:11px;border-bottom:1px solid var(--cockpit-border);">' +
                lines + contact + '</td></tr>';
        }
    };

    /**
     * ProductsPage — markup only. Pagination, filters, Fishbowl, edit/batch/API stay in app.js.
     */
    var ProductsPage = {
        computeStats: function (products) {
            var arr = products || [];
            var o = { total: arr.length, inStock: 0, outOfStock: 0, featured: 0 };
            arr.forEach(function (p) {
                var inS = p.in_stock !== false && p.in_stock !== 0;
                if (inS) o.inStock++;
                else o.outOfStock++;
                if (p.featured) o.featured++;
            });
            return o;
        },
        states: {
            loading: function () {
                return '<div class="ops-empty admin-state-loading" data-component="ProductsPageLoading"><i class="fas fa-spinner fa-spin"></i><p>Loading products…</p></div>';
            },
            error: function (msg, hint403) {
                var h = hint403 ? '<p>Admin access required.</p>' : '';
                return '<div class="ops-empty admin-state-error" data-component="ProductsPageError"><i class="fas fa-exclamation-triangle"></i><div class="ops-empty-title">Error loading products</div><p>' + esc(msg || 'Unknown error') + '</p>' + h +
                    '<button type="button" class="ops-btn-ghost" onclick="loadAdminProducts()">Retry</button></div>';
            },
            filteredEmpty: function () {
                return '<div class="ops-empty admin-state-empty-table" data-component="ProductsTableFilteredEmpty"><i class="fas fa-box-open"></i><div class="ops-empty-title">No products match filters</div><p>Clear filters or adjust search to see catalog rows.</p><button type="button" class="ops-btn-ghost" onclick="adminProductsClearFilters()">Clear filters</button></div>';
            }
        },
        summaryStrip: function (s) {
            return '<div class="products-summary-strip cockpit-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(100px,1fr));margin-bottom:12px;gap:8px;" data-component="ProductsSummaryStrip">' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.total + '</span><span class="cockpit-kpi-label">Catalog</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.inStock + '</span><span class="cockpit-kpi-label">In stock</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.outOfStock + '</span><span class="cockpit-kpi-label">Out of stock</span></div>' +
                (s.featured > 0 ? '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.featured + '</span><span class="cockpit-kpi-label">Featured</span></div>' : '') +
                '</div>';
        },
        pageHeader: function (totalCount) {
            var n = totalCount != null ? totalCount : 0;
            return '<div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;" data-component="ProductsPageHeader">' +
                '<div><h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Product Management</h2>' +
                '<p id="adminProductsCountText" style="color: #4B5563;">Total: ' + n + ' products</p></div>' +
                '<div style="display: flex; gap: 12px; flex-wrap: wrap;" data-component="ProductsPageActions">' +
                '<button onclick="exportProductsToCSV()" style="background: #6B7280; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background=\'#4B5563\';" onmouseout="this.style.background=\'#6B7280\';">' +
                '<i class="fas fa-download"></i> Export CSV</button>' +
                '<button onclick="showCSVImportSection()" style="background: #111111; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background=\'#1F2933\';" onmouseout="this.style.background=\'#111111\';">' +
                '<i class="fas fa-file-csv"></i> Import CSV</button>' +
                '<button onclick="showAdminNewFromUrlView()" style="background: #7C3AED; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background=\'#6D28D9\';" onmouseout="this.style.background=\'#7C3AED\';">' +
                '<i class="fas fa-link"></i> Add Product by URL</button>' +
                '<button onclick="showAddProductForm()" style="background: #FF7A00; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background=\'rgba(255,122,0,0.85)\';" onmouseout="this.style.background=\'#FF7A00\';">' +
                '<i class="fas fa-plus"></i> Add New Product</button>' +
                '<button onclick="syncFishbowlInventory()" id="fishbowlSyncBtn" style="background: #0ea5e9; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background=\'#0284c7\';" onmouseout="this.style.background=\'#0ea5e9\';">' +
                '<i class="fas fa-sync-alt"></i> Sync from Fishbowl</button>' +
                '<button onclick="exportFishbowlCustomers()" id="fishbowlExportCustomersBtn" style="background: #059669; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background=\'#047857\';" onmouseout="this.style.background=\'#059669\';">' +
                '<i class="fas fa-users"></i> Export Customers for Fishbowl</button></div></div>';
        },
        fishbowlHint: function () {
            return '<p style="font-size: 13px; color: #4B5563; margin-top: -8px; margin-bottom: 16px;" data-component="ProductsFishbowlHint"><strong>Sync from Fishbowl:</strong> Updates inventory (in_stock, quantity) for products whose SKU starts with <code>GLV-</code> only. <strong>Export Customers:</strong> Download CSV of customers who have placed orders so Fishbowl can create customers and fulfill orders.</p>';
        },
        exportBySection: function () {
            return '<div id="adminExportBySection" style="background: #F9FAFB; padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #E5E7EB;" data-component="ProductsExportBySection">' +
                '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #111111;"><i class="fas fa-filter" style="color: #FF7A00; margin-right: 8px;"></i>Export by</h3>' +
                '<p style="font-size: 13px; color: #4B5563; margin-bottom: 16px;">Choose filters below, then click Export CSV to download only matching products. Leave all as "All" to export everything.</p>' +
                '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; align-items: start;">' +
                '<div><label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Manufacturer</label>' +
                '<select id="exportFilterBrand" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;"><option value="">All manufacturers</option></select></div>' +
                '<div><label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Category</label>' +
                '<select id="exportFilterCategory" style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff;">' +
                '<option value="">All categories</option><option value="Disposable Gloves">Disposable Gloves</option><option value="Work Gloves">Reusable Work Gloves</option></select></div>' +
                '<div><label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Color(s)</label>' +
                '<select id="exportFilterColors" multiple style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff; min-height: 80px;">' +
                '<option value="Blue">Blue</option><option value="Black">Black</option><option value="White">White</option><option value="Clear">Clear</option><option value="Orange">Orange</option><option value="Purple">Purple</option>' +
                '<option value="Green">Green</option><option value="Natural">Natural</option><option value="Gray">Gray</option><option value="Tan">Tan</option><option value="Yellow">Yellow</option></select>' +
                '<span style="font-size: 11px; color: #4B5563;">Hold Ctrl/Cmd to select multiple</span></div>' +
                '<div><label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #374151;">Material(s)</label>' +
                '<select id="exportFilterMaterials" multiple style="width: 100%; padding: 10px 12px; border: 2px solid #E5E7EB; border-radius: 8px; font-size: 14px; background: #fff; min-height: 80px;">' +
                '<option value="Nitrile">Nitrile</option><option value="Latex">Latex</option><option value="Vinyl">Vinyl</option><option value="Polyethylene (PE)">Polyethylene (PE)</option></select>' +
                '<span style="font-size: 11px; color: #4B5563;">Hold Ctrl/Cmd to select multiple</span></div></div></div>';
        },
        toolbar: function () {
            return '<div class="ops-toolbar" data-component="ProductsToolbar">' +
                '<div class="ops-toolbar__head"><span class="ops-toolbar__title">Catalog</span>' +
                '<span id="adminProductsFilterSummary" style="font-size:11px;color:var(--cockpit-text-muted);"></span></div>' +
                '<div class="ops-toolbar__row" data-component="ProductsToolbarSearch">' +
                '<div class="ops-search-wrap" style="max-width:280px;"><i class="fas fa-search ops-search-icon"></i>' +
                '<input type="text" id="adminFilterSearch" class="ops-search" placeholder="Search SKU, name, brand…" oninput="adminProductsOnFilterChange()"></div>' +
                '<select id="adminFilterBrand" class="ops-select" onchange="adminProductsOnFilterChange()" title="Manufacturer"><option value="">All mfr</option></select>' +
                '<select id="adminFilterCategory" class="ops-select" onchange="adminProductsOnFilterChange()"><option value="">All categories</option><option value="Disposable Gloves">Disposable</option><option value="Work Gloves">Work gloves</option></select>' +
                '<select id="adminFilterMaterial" class="ops-select" onchange="adminProductsOnFilterChange()"><option value="">All materials</option></select>' +
                '<select id="adminFilterColor" multiple class="ops-select" style="min-height:64px;min-width:100px;" onchange="adminProductsOnFilterChange()" title="Colors"></select>' +
                '<button type="button" class="ops-btn-ghost" onclick="adminProductsClearFilters()"><i class="fas fa-undo"></i> Reset</button></div>' +
                '<div class="ops-chip-row" data-component="ProductsToolbarStock">' +
                '<span class="ops-chip-row-label">Stock</span>' +
                '<button type="button" class="ops-chip js-prod-stock-chip ops-chip--active" data-stock="" onclick="adminProductsSetStockChip(\'\')">All</button>' +
                '<button type="button" class="ops-chip js-prod-stock-chip" data-stock="in" onclick="adminProductsSetStockChip(\'in\')">In stock</button>' +
                '<button type="button" class="ops-chip js-prod-stock-chip" data-stock="out" onclick="adminProductsSetStockChip(\'out\')">Out of stock</button></div></div>';
        },
        batchBar: function () {
            return '<div id="adminProductsBatchBar" class="ops-bulk-bar" data-component="ProductsBulkBar">' +
                '<label class="ops-bulk-bar__label"><input type="checkbox" id="adminProductsSelectAll" onchange="adminProductsToggleSelectAll()"><span>Page</span></label>' +
                '<span class="ops-bulk-divider"></span>' +
                '<button type="button" onclick="batchDeleteProducts()" id="adminProductsBatchDeleteBtn" disabled class="ops-btn-ghost ops-btn-ghost--danger"><i class="fas fa-trash-alt"></i> Delete</button>' +
                '<button type="button" class="ops-btn-ghost" onclick="exportProductsToCSV()" title="Full catalog"><i class="fas fa-download"></i> Export CSV</button>' +
                '<span id="adminProductsSelectedCount" style="color:var(--cockpit-text-muted);font-size:11px;"></span></div>';
        },
        tableShell: function () {
            return '<div class="admin-datatable-wrap" data-component="ProductsTableShell"><table class="admin-datatable ops-table-dense"><thead><tr>' +
                '<th style="width:32px"><span class="sr-only">Sel</span></th><th class="sortable">SKU</th><th>Product</th><th>Vendor</th><th>Cat</th>' +
                '<th class="num">Cost</th><th class="num">Sell</th><th class="num">Margin</th><th class="num">Qty</th><th>Status</th><th style="width:72px"></th></tr></thead><tbody></tbody></table></div>';
        },
        tableWrapWithBody: function (tbodyRowsHtml) {
            return '<div class="admin-datatable-wrap" data-component="ProductsTableShell"><table class="admin-datatable ops-table-dense"><thead><tr>' +
                '<th style="width:32px"><span class="sr-only">Sel</span></th><th class="sortable">SKU</th><th>Product</th><th>Vendor</th><th>Cat</th>' +
                '<th class="num">Cost</th><th class="num">Sell</th><th class="num">Margin</th><th class="num">Qty</th><th>Status</th><th style="width:72px"></th></tr></thead><tbody>' +
                (tbodyRowsHtml || '') + '</tbody></table></div>';
        },
        tableFooter: function () {
            return '<div id="adminProductsPagination" class="ops-table-footer-wrap" data-component="ProductsTableFooter"></div>';
        },
        paginationFooterHtml: function (opts) {
            var o = opts || {};
            var startN = o.startN != null ? o.startN : 0;
            var endN = o.endN != null ? o.endN : 0;
            var total = o.total != null ? o.total : 0;
            var currentPage = o.currentPage != null ? o.currentPage : 1;
            var totalPages = o.totalPages != null ? o.totalPages : 1;
            var prevDis = o.prevDisabled ? 'disabled' : '';
            var nextDis = o.nextDisabled ? 'disabled' : '';
            return '<div class="ops-table-footer" data-component="ProductsPaginationInner">' +
                '<span class="ops-table-footer__meta">Rows ' + startN + '–' + endN + ' of ' + total + ' · Page ' + currentPage + '/' + totalPages + '</span>' +
                '<div class="ops-table-footer__nav">' +
                '<button type="button" class="ops-page-btn" onclick="adminProductsPrevPage()" ' + prevDis + '><i class="fas fa-chevron-left"></i> Prev</button>' +
                '<button type="button" class="ops-page-btn ops-page-btn--accent" onclick="adminProductsNextPage()" ' + nextDis + '>Next <i class="fas fa-chevron-right"></i></button></div></div>';
        },
        composeListChrome: function (stats, totalCount) {
            return '<div class="products-page ops-shell" data-page="ProductsPage">' +
                this.summaryStrip(stats) +
                this.pageHeader(totalCount) +
                this.fishbowlHint() +
                this.exportBySection() +
                '<div id="adminProductsFilterSection" class="ops-shell" style="margin-bottom:16px;" data-component="ProductsCatalogShell">' +
                '<input type="hidden" id="adminFilterStock" value="">' +
                this.toolbar() +
                this.batchBar() +
                '<div id="adminProductsGridWrapper" class="ops-table-scroll ops-table-scroll--tall" data-component="ProductsGridScroll"><div id="adminProductsGrid"></div></div>' +
                this.tableFooter() +
                '</div></div>';
        },
        tableRowHtml: function (product) {
            var id = product.id != null ? Number(product.id) : 0;
            var cost = parseFloat(product.cost);
            var price = parseFloat(product.price) || 0;
            var margin = (!isNaN(cost) && cost > 0 && price > 0) ? Math.round((1 - cost / price) * 1000) / 10 : null;
            var marginStr = margin != null ? margin + '%' : '—';
            var riskClass = margin != null && margin < 12 ? 'cockpit-risk-high' : (margin != null && margin < 22 ? 'cockpit-risk-mid' : 'cockpit-risk-low');
            var stock = product.quantity != null ? product.quantity : (product.in_stock ? '—' : '0');
            var st = product.in_stock !== false && product.in_stock !== 0 ? '<span class="cockpit-status-badge cockpit-status-badge--ok">Active</span>' : '<span class="cockpit-status-badge cockpit-status-badge--muted">OOS</span>';
            var ov = product.customer_price_override ? '<span class="cockpit-status-badge cockpit-status-badge--warn" title="Check customer pricing">Ovr</span>' : '';
            return '<tr class="ops-row" data-pid="' + id + '">' +
                '<td onclick="event.stopPropagation()"><input type="checkbox" class="admin-product-select" data-product-id="' + id + '" onchange="adminProductRowCheckbox(this)"></td>' +
                '<td class="mono">' + esc(product.sku) + '</td><td class="ops-cell-stack"><div class="ops-cell-primary">' + esc((product.name || '').substring(0, 42)) + '</div><div class="ops-cell-secondary">' + esc((product.brand || '').substring(0, 20)) + ' · ' + esc((product.category || '').substring(0, 18)) + '</div></td>' +
                '<td>' + esc((product.brand || '').substring(0, 12)) + '</td><td>' + esc((product.category || '').substring(0, 14)) + '</td>' +
                '<td class="num">' + (!isNaN(cost) && cost > 0 ? '$' + cost.toFixed(2) : '—') + '</td><td class="num">$' + price.toFixed(2) + '</td>' +
                '<td class="num ' + riskClass + '">' + marginStr + '</td><td class="num">' + esc(String(stock)) + '</td><td>' + st + ' ' + ov + '</td>' +
                '<td onclick="event.stopPropagation()" class="ops-actions">' +
                '<button type="button" class="ops-icon-btn ops-icon-btn--primary" title="Edit" onclick="editProduct(' + id + ')"><i class="fas fa-pen"></i></button>' +
                '<button type="button" class="ops-icon-btn" title="Delete" onclick="event.stopPropagation();deleteProduct(' + id + ')"><i class="fas fa-trash-alt"></i></button></td></tr>';
        },
        cardHtml: function (product) {
            var name = esc(product.name);
            var sku = esc(product.sku);
            var id = product.id != null ? Number(product.id) : 0;
            var imgUrl = (product.image_url || '').trim();
            var imgHtml = imgUrl
                ? '<img src="' + esc(imgUrl) + '" alt="' + name + '" style="width: 64px; height: 64px; object-fit: cover; border-radius: 8px; display: block; background: #eee;" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" /><div style="display: none; width: 64px; height: 64px; background: #E5E7EB; border-radius: 8px; align-items: center; justify-content: center; color: #9CA3AF;"><i class="fas fa-hand-paper" style="font-size: 24px;"></i></div>'
                : '<div style="width: 64px; height: 64px; background: #E5E7EB; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9CA3AF;"><i class="fas fa-hand-paper" style="font-size: 24px;"></i></div>';
            var price = (product.price != null && !isNaN(product.price)) ? Number(product.price).toFixed(2) : '0.00';
            var bulkPrice = (product.bulk_price != null && !isNaN(product.bulk_price)) ? Number(product.bulk_price).toFixed(2) : '0.00';
            var catFn = global.getCategoryDisplayName;
            var category = esc(typeof catFn === 'function' ? (catFn(product.category) || '') : (product.category || ''));
            var material = esc(product.material || 'N/A');
            return '<div class="admin-product-card" style="background: #f9f9f9; padding: 24px; border-radius: 12px; border-left: 4px solid #FF7A00;" data-component="ProductsCard">' +
                '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">' +
                '<div style="display: flex; gap: 16px; flex: 1; min-width: 0;">' +
                '<div style="flex-shrink: 0; display: flex; align-items: center;"><label style="cursor: pointer; margin: 0;"><input type="checkbox" class="admin-product-select" data-product-id="' + id + '" style="width: 18px; height: 18px; accent-color: #DC2626;" onclick="event.stopPropagation();" onchange="adminProductsUpdateBatchBar()"></label></div>' +
                '<div style="flex-shrink: 0; position: relative;">' + imgHtml + '</div>' +
                '<div style="min-width: 0;"><h3 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">' + name + '</h3>' +
                '<p style="color: #4B5563; font-size: 14px; margin-bottom: 4px;">SKU: ' + sku + ' • ' + esc(product.brand || '') + '</p>' +
                '<p style="color: #4B5563; font-size: 13px;">' + category + ' • ' + material + '</p></div></div>' +
                '<div style="text-align: right; margin-left: 24px; flex-shrink: 0;">' +
                '<div style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px;">$' + price + ' <span style="font-size: 14px; color: #4B5563; font-weight: 400;">/ $' + bulkPrice + ' B2B</span></div>' +
                '<div style="display: flex; gap: 8px; margin-top: 12px;">' +
                '<button onclick="editProduct(' + id + ')" type="button" style="background: #28a745; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-edit"></i> Edit</button>' +
                '<button onclick="deleteProduct(' + id + ')" type="button" style="background: #dc3545; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-trash"></i> Delete</button></div></div></div></div>';
        }
    };

    /**
     * AdminUsersPage — markup only. Dual api.get, modals, ownerApproveUser, mutations stay in app.js.
     * Preserves separation: app_admins roster + approval queue (cockpit) vs public.users cards.
     */
    var AdminUsersPage = {
        computeStats: function (users, cockpit) {
            var arr = users || [];
            var c = cockpit || {};
            var pubPending = 0;
            arr.forEach(function (u) {
                if (!u.is_approved) pubPending++;
            });
            return {
                publicTotal: arr.length,
                publicApproved: arr.length - pubPending,
                publicPending: pubPending,
                rosterCount: (c.app_admins_roster || []).length,
                queuePending: c.users_pending_approval != null ? Number(c.users_pending_approval) : 0
            };
        },
        states: {
            authRequired: function () {
                return '<div class="ops-empty admin-state-auth" data-component="AdminUsersAuthRequired"><i class="fas fa-lock"></i><div class="ops-empty-title">Authentication required</div><p>Log in to access admin users and approvals.</p><button type="button" class="ops-btn-ghost" onclick="navigate(\'login\')">Go to login</button></div>';
            },
            loading: function () {
                return '<div class="ops-empty admin-state-loading" data-component="AdminUsersLoading"><i class="fas fa-spinner fa-spin"></i><p>Loading users…</p></div>';
            },
            error: function (msg, hint403) {
                var h = hint403 ? '<p>Make sure you are logged in as an approved admin user.</p>' : '';
                return '<div class="ops-empty admin-state-error" data-component="AdminUsersError"><i class="fas fa-exclamation-triangle"></i><div class="ops-empty-title">Error loading users</div><p>' + esc(msg || 'Unknown error') + '</p>' + h +
                    '<button type="button" class="ops-btn-ghost" onclick="loadAdminUsers()">Retry</button></div>';
            }
        },
        summaryStrip: function (s) {
            return '<div class="cockpit-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(100px,1fr));margin-bottom:12px;gap:8px;" data-component="AdminUsersSummaryStrip">' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.publicTotal + '</span><span class="cockpit-kpi-label">public.users</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.publicApproved + '</span><span class="cockpit-kpi-label">Approved accounts</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.publicPending + '</span><span class="cockpit-kpi-label">Pending (portal)</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.rosterCount + '</span><span class="cockpit-kpi-label">app_admins roster</span></div>' +
                '<div class="cockpit-kpi"><span class="cockpit-kpi-value">' + s.queuePending + '</span><span class="cockpit-kpi-label">Approval queue</span></div></div>';
        },
        truthBanner: function (note) {
            var t = note != null && String(note).length ? esc(note) : 'Portal profile public.users.id = Auth UUID. Admin access requires app_admins.auth_user_id.';
            return '<div class="cockpit-truth-banner" style="margin-bottom:16px;" data-component="AdminUsersTruthBanner">' + t + '</div>';
        },
        rosterRowHtml: function (a) {
            var b = '<span class="cockpit-badge cockpit-badge--ok">app_admins</span>';
            return '<tr data-component="AdminRosterRow"><td>' + b + '</td><td>' + esc(a.email) + '</td><td>' + esc(a.contact_name || '—') + '</td><td>user_id: ' + esc(a.user_id != null ? String(a.user_id) : '—') + '</td></tr>';
        },
        adminRosterCard: function (rosterRowsHtml) {
            var body = rosterRowsHtml ? rosterRowsHtml : '<tr><td colspan="4" class="cockpit-empty-cell">No app_admins rows</td></tr>';
            return '<div class="cockpit-panel" style="margin-bottom:16px;" data-component="AdminRosterCard">' +
                '<div class="cockpit-panel-header">Admin roster (app_admins + env owner)</div>' +
                '<div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-data-table" data-source="app_admins">' +
                '<thead><tr><th>Badge</th><th>Email</th><th>Contact</th><th>User id</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
        },
        approvalRowHtml: function (u) {
            var id = u.id != null ? Number(u.id) : 0;
            return '<tr data-component="ApprovalQueueRow"><td>' + esc(u.email) + '</td><td>' + esc(u.company_name || '—') + '</td><td>' +
                '<button type="button" class="cockpit-btn cockpit-btn--sm" onclick="ownerApproveUser(' + id + ')">Approve</button></td></tr>';
        },
        approvalQueueCard: function (usersPendingApproval, rowsHtml) {
            var body = rowsHtml ? rowsHtml : '<tr><td colspan="3" class="cockpit-empty-cell">None</td></tr>';
            var n = usersPendingApproval != null ? usersPendingApproval : 0;
            return '<div class="cockpit-panel" style="margin-bottom:24px;" data-component="ApprovalQueueCard">' +
                '<div class="cockpit-panel-header">Approvals queue (is_approved ≠ 1) — ' + esc(String(n)) + ' pending</div>' +
                '<div class="cockpit-panel-body" style="overflow-x:auto;"><table class="cockpit-data-table" data-source="approval_queue">' +
                '<thead><tr><th>Email</th><th>Company</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
        },
        pageHeader: function (userCount) {
            return '<div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;" data-component="AdminUsersPageHeader">' +
                '<div data-component="AdminUsersPageTitle"><h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">All portal users (public.users)</h2>' +
                '<p style="color: #4B5563;">Total: ' + esc(String(userCount)) + ' users</p></div>' +
                '<div data-component="AdminUsersPageActions"><button type="button" onclick="showAddCustomerModal()" style="background: #FF7A00; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">' +
                '<i class="fas fa-user-plus"></i> Add Customer</button></div></div>';
        },
        emptyPublicUsers: function () {
            return '<div class="ops-empty admin-state-empty" data-component="AdminUsersEmptyPublic"><i class="fas fa-users"></i><div class="ops-empty-title">No public.users yet</div><p>Portal accounts will appear here after signup.</p></div>';
        },
        publicUserCardHtml: function (user) {
            var id = user.id != null ? Number(user.id) : 0;
            var approved = !!user.is_approved;
            var border = approved ? '#28a745' : '#FF7A00';
            var co = esc(user.company_name || 'Unknown Company');
            var cn = esc(user.contact_name || 'N/A');
            var em = esc(user.email || 'N/A');
            var joined = user.created_at ? esc(new Date(user.created_at).toLocaleDateString()) : 'N/A';
            var tier = user.discount_tier || 'standard';
            var pt = user.payment_terms || 'credit_card';
            var ptLabel = pt === 'net30' ? 'Net 30' : (pt === 'ach' ? 'ACH' : 'Credit Card');
            var freeUp = user.allow_free_upgrades ? '<p style="color: #059669; font-size: 12px; margin-top: 4px;"><i class="fas fa-arrow-up"></i> Free upgrades enabled</p>' : '';
            var approveBtn = !approved ? '<button onclick="updateUserApproval(' + id + ', true)" style="background: #28a745; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">Approve User</button>' : '';
            function selTier(v) { return tier === v ? ' selected' : ''; }
            function selPay(v) { return pt === v ? ' selected' : ''; }
            return '<div class="admin-public-user-card" style="background: #f9f9f9; padding: 24px; border-radius: 12px; border-left: 4px solid ' + border + ';" data-component="PublicUserCard" data-public-user-id="' + id + '">' +
                '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">' +
                '<div><h3 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">' + co + '</h3>' +
                '<p style="color: #4B5563; font-size: 14px;">' + cn + ' • ' + em + '</p>' +
                '<p style="color: #4B5563; font-size: 13px; margin-top: 4px;">Joined: ' + joined + '</p>' + freeUp + '</div>' +
                '<div style="text-align: right;">' +
                '<div style="background: ' + (approved ? '#d4edda' : '#fff3cd') + '; color: ' + (approved ? '#155724' : '#856404') + '; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; display: inline-block; margin-bottom: 8px;">' +
                (approved ? 'Approved' : 'Pending') + '</div>' +
                '<div style="font-size: 13px; color: #4B5563; text-transform: capitalize;">' + esc(tier) + ' tier</div>' +
                '<div style="font-size: 12px; color: #4B5563; margin-top: 4px;">' + esc(ptLabel) + '</div></div></div>' +
                '<div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;" data-component="PublicUserCardActions">' +
                approveBtn +
                '<select onchange="updateUserTier(' + id + ', this.value)" style="padding: 8px 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 13px; cursor: pointer;">' +
                '<option value="standard"' + selTier('standard') + '>Standard</option>' +
                '<option value="bronze"' + selTier('bronze') + '>Bronze (5%)</option>' +
                '<option value="silver"' + selTier('silver') + '>Silver (10%)</option>' +
                '<option value="gold"' + selTier('gold') + '>Gold (15%)</option>' +
                '<option value="platinum"' + selTier('platinum') + '>Platinum (20%)</option></select>' +
                '<select onchange="updateUserPaymentTerms(' + id + ', this.value)" style="padding: 8px 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 13px; cursor: pointer;">' +
                '<option value="credit_card"' + selPay('credit_card') + '>Credit Card</option>' +
                '<option value="ach"' + selPay('ach') + '>ACH</option>' +
                '<option value="net30"' + selPay('net30') + '>Net 30</option></select></div></div>';
        },
        publicUsersSection: function (cardsHtml) {
            return '<div style="display: grid; gap: 16px;" data-component="PublicUsersSection">' + (cardsHtml || '') + '</div>';
        },
        composeBody: function (users, cockpit) {
            var c = cockpit || {};
            var u = Array.isArray(users) ? users : [];
            var self = this;
            var stats = this.computeStats(u, c);
            var rosterRows = (c.app_admins_roster || []).map(function (a) { return self.rosterRowHtml(a); }).join('');
            var pendRows = (c.pending_queue || []).slice(0, 15).map(function (row) { return self.approvalRowHtml(row); }).join('');
            var parts = [
                '<div class="admin-users-page ops-shell" data-page="AdminUsersPage">',
                this.summaryStrip(stats),
                this.truthBanner(c.note),
                this.adminRosterCard(rosterRows),
                this.approvalQueueCard(c.users_pending_approval || 0, pendRows)
            ];
            if (u.length === 0) {
                parts.push(this.emptyPublicUsers());
            } else {
                parts.push(this.pageHeader(u.length));
                parts.push(this.publicUsersSection(u.map(function (user) { return self.publicUserCardHtml(user); }).join('')));
            }
            parts.push('</div>');
            return parts.join('');
        }
    };

    var AdminApp = {
        renderLayout: function (mainEl, activeTab, user) {
            mainEl.innerHTML = AdminLayout.renderShell(activeTab, user);
        }
    };

    global.AdminUI = {
        AdminApp: AdminApp,
        AdminLayout: AdminLayout,
        OverviewPage: OverviewPage,
        CompaniesPage: CompaniesPage,
        PricingPage: PricingPage,
        PaymentsPage: PaymentsPage,
        InventoryPage: InventoryPage,
        SettingsPage: SettingsPage,
        IntegrationsPage: IntegrationsPage,
        OrdersPage: OrdersPage,
        ProductsPage: ProductsPage,
        AdminUsersPage: AdminUsersPage,
        PAGE_TITLE: PAGE_TITLE
    };
})(typeof window !== 'undefined' ? window : this);
