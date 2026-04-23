"use client";

/**
 * Commercial Intelligence Dashboard Client
 * 
 * Interactive daily command center for procurement operations.
 */

import { useState } from "react";
import Link from "next/link";
import {
  StatCard,
  StatGrid,
  StatusBadge,
  TableCard,
  TableToolbar,
  SlideOver,
  SlideOverSection,
} from "@/components/admin";
import type {
  DashboardData,
  SupplierHealthItem,
  MarginOpportunityItem,
  VolatileProductItem,
  StaleOfferItem,
  ProcurementAlert,
  ForecastItem,
} from "./page";

interface Props {
  data: DashboardData;
}

export function CommercialDashboardClient({ data }: Props) {
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierHealthItem | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<MarginOpportunityItem | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<ProcurementAlert | null>(null);

  return (
    <div className="space-y-8">
      {/* Top Metrics Bar */}
      <MetricsBar metrics={data.metrics} />

      {/* Priority Alerts */}
      {data.alerts.length > 0 && (
        <AlertsSection alerts={data.alerts} onSelectAlert={setSelectedAlert} />
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supplier Health */}
        <SupplierHealthSection
          health={data.supplierHealth}
          onSelectSupplier={setSelectedSupplier}
        />

        {/* Margin Opportunities */}
        <MarginOpportunitiesSection
          opportunities={data.marginOpportunities}
          onSelectOpportunity={setSelectedOpportunity}
        />
      </div>

      {/* Market Stability */}
      <MarketStabilitySection stability={data.marketStability} />

      {/* Forecasts */}
      {data.forecasts.length > 0 && <ForecastsSection forecasts={data.forecasts} />}

      {/* Detail Panels */}
      <SupplierDetailPanel
        supplier={selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
      />
      <OpportunityDetailPanel
        opportunity={selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
      />
      <AlertDetailPanel alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}

// ============================================================================
// METRICS BAR
// ============================================================================

function MetricsBar({ metrics }: { metrics: DashboardData["metrics"] }) {
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
  const formatCurrency = (value: number) =>
    value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(0)}`;

  return (
    <StatGrid columns={6}>
      <StatCard
        label="Open Alerts"
        value={metrics.total_open_alerts}
        color={metrics.total_open_alerts > 5 ? "red" : metrics.total_open_alerts > 0 ? "amber" : "green"}
      />
      <StatCard
        label="Margin Opportunities"
        value={metrics.total_open_opportunities}
        color={metrics.total_open_opportunities > 0 ? "blue" : "default"}
      />
      <StatCard
        label="Acceptance Rate"
        value={formatPercent(metrics.recommendation_acceptance_rate)}
        color="default"
      />
      <StatCard
        label="Realized Savings"
        value={formatCurrency(metrics.realized_savings_total)}
        color="green"
      />
      <StatCard
        label="Active Suppliers"
        value={metrics.total_active_suppliers}
        color="default"
      />
      <StatCard
        label="Forecast Precision"
        value={formatPercent(metrics.forecast_precision)}
        color="default"
      />
    </StatGrid>
  );
}

// ============================================================================
// ALERTS SECTION
// ============================================================================

function AlertsSection({
  alerts,
  onSelectAlert,
}: {
  alerts: ProcurementAlert[];
  onSelectAlert: (alert: ProcurementAlert) => void;
}) {
  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const highAlerts = alerts.filter((a) => a.severity === "high");
  const otherAlerts = alerts.filter((a) => !["critical", "high"].includes(a.severity));

  const severityColors: Record<string, string> = {
    critical: "bg-red-50 border-red-300 hover:bg-red-100",
    high: "bg-orange-50 border-orange-300 hover:bg-orange-100",
    normal: "bg-amber-50 border-amber-300 hover:bg-amber-100",
    low: "bg-blue-50 border-blue-300 hover:bg-blue-100",
  };

  const severityIcons: Record<string, string> = {
    critical: "🚨",
    high: "⚠️",
    normal: "📋",
    low: "ℹ️",
  };

  const displayAlerts = [...criticalAlerts, ...highAlerts, ...otherAlerts].slice(0, 6);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Priority Alerts ({alerts.length})
        </h3>
        <Link href="/admin/review?type=pricing" className="text-sm text-blue-600 hover:underline">
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayAlerts.map((alert) => (
          <button
            key={alert.id}
            onClick={() => onSelectAlert(alert)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              severityColors[alert.severity] || severityColors.normal
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{severityIcons[alert.severity] || "📋"}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 truncate">{alert.title}</div>
                <div className="text-sm text-gray-600 truncate mt-0.5">{alert.description}</div>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <StatusBadge status={alert.severity} />
                  <span>{alert.alert_type.replace(/_/g, " ")}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// SUPPLIER HEALTH SECTION
// ============================================================================

function SupplierHealthSection({
  health,
  onSelectSupplier,
}: {
  health: DashboardData["supplierHealth"];
  onSelectSupplier: (supplier: SupplierHealthItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<"deteriorating" | "risky" | "leaderboard">(
    health.deteriorating.length > 0 ? "deteriorating" : "leaderboard"
  );

  const tabs = [
    { key: "deteriorating" as const, label: "Deteriorating", count: health.deteriorating.length },
    { key: "risky" as const, label: "Risky", count: health.risky.length },
    { key: "leaderboard" as const, label: "Leaderboard", count: health.leaderboard.length },
  ];

  const items =
    activeTab === "deteriorating"
      ? health.deteriorating
      : activeTab === "risky"
      ? health.risky
      : health.leaderboard;

  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  const getChangeIndicator = (supplier: SupplierHealthItem) => {
    if (supplier.change_direction === "down") {
      return <span className="text-red-500">↓</span>;
    }
    if (supplier.change_direction === "up") {
      return <span className="text-green-500">↑</span>;
    }
    return null;
  };

  const getBandColor = (band: string) => {
    if (band === "trusted") return "text-green-600";
    if (band === "stable") return "text-blue-600";
    if (band === "watch") return "text-amber-600";
    return "text-red-600";
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Supplier Health</h3>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  tab.key === "deteriorating" || tab.key === "risky"
                    ? "bg-red-100 text-red-600"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {activeTab === "deteriorating"
              ? "No suppliers showing decline"
              : activeTab === "risky"
              ? "No risky suppliers detected"
              : "No supplier data available"}
          </div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Supplier</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Score</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Band</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Products</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((supplier, idx) => (
                <tr
                  key={supplier.supplier_id}
                  onClick={() => onSelectSupplier(supplier)}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {activeTab === "leaderboard" && (
                        <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {supplier.supplier_name}
                      </span>
                      {getChangeIndicator(supplier)}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="text-sm font-semibold">
                      {formatPercent(supplier.reliability_score)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-sm capitalize ${getBandColor(supplier.reliability_band)}`}>
                      {supplier.reliability_band}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-sm text-gray-600">
                    {supplier.product_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// MARGIN OPPORTUNITIES SECTION
// ============================================================================

function MarginOpportunitiesSection({
  opportunities,
  onSelectOpportunity,
}: {
  opportunities: DashboardData["marginOpportunities"];
  onSelectOpportunity: (opp: MarginOpportunityItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<"largest" | "accepted" | "rejected" | "savings">(
    "largest"
  );

  const tabs = [
    { key: "largest" as const, label: "Open", count: opportunities.largest.length },
    { key: "accepted" as const, label: "Accepted", count: opportunities.recentAccepted.length },
    { key: "rejected" as const, label: "Rejected", count: opportunities.recentRejected.length },
    { key: "savings" as const, label: "Savings", count: opportunities.realizedSavings.length },
  ];

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const getBandColor = (band: string) => {
    if (band === "major") return "bg-green-100 text-green-700";
    if (band === "meaningful") return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Margin Opportunities</h3>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto">
        {activeTab === "savings" ? (
          <SavingsLeaderboard savings={opportunities.realizedSavings} />
        ) : (
          <OpportunitiesTable
            items={
              activeTab === "largest"
                ? opportunities.largest
                : activeTab === "accepted"
                ? opportunities.recentAccepted
                : opportunities.recentRejected
            }
            onSelect={onSelectOpportunity}
            getBandColor={getBandColor}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
          />
        )}
      </div>
    </section>
  );
}

function OpportunitiesTable({
  items,
  onSelect,
  getBandColor,
  formatCurrency,
  formatPercent,
}: {
  items: MarginOpportunityItem[];
  onSelect: (opp: MarginOpportunityItem) => void;
  getBandColor: (band: string) => string;
  formatCurrency: (value: number) => string;
  formatPercent: (value: number) => string;
}) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">No opportunities in this category</div>
    );
  }

  return (
    <table className="min-w-full">
      <thead className="bg-gray-50 sticky top-0">
        <tr>
          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Product</th>
          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Savings</th>
          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Band</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {items.map((opp) => (
          <tr
            key={opp.id}
            onClick={() => onSelect(opp)}
            className="cursor-pointer hover:bg-blue-50 transition-colors"
          >
            <td className="px-4 py-2">
              <div className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                {opp.product_name}
              </div>
              <div className="text-xs text-gray-500 font-mono">{opp.product_sku}</div>
            </td>
            <td className="px-4 py-2 text-center">
              <div className="text-sm font-semibold text-green-600">
                {formatCurrency(opp.estimated_savings_per_case)}
              </div>
              <div className="text-xs text-gray-500">{formatPercent(opp.estimated_savings_percent)}</div>
            </td>
            <td className="px-4 py-2 text-center">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getBandColor(opp.opportunity_band)}`}>
                {opp.opportunity_band}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SavingsLeaderboard({ savings }: { savings: { supplier_name: string; total_savings: number }[] }) {
  if (savings.length === 0) {
    return <div className="p-8 text-center text-sm text-gray-500">No realized savings yet</div>;
  }

  const formatCurrency = (value: number) =>
    value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(0)}`;

  return (
    <div className="p-4 space-y-3">
      {savings.map((s, idx) => (
        <div key={s.supplier_name} className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{s.supplier_name}</div>
          </div>
          <div className="text-sm font-semibold text-green-600">{formatCurrency(s.total_savings)}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MARKET STABILITY SECTION
// ============================================================================

function MarketStabilitySection({ stability }: { stability: DashboardData["marketStability"] }) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <section>
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
        Market Stability
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Volatile Products */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">High Volatility Products</h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {stability.volatileProducts.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">All products stable</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {stability.volatileProducts.map((p) => (
                  <Link
                    key={p.product_id}
                    href={`/admin/products/${p.product_id}/intelligence`}
                    className="block px-4 py-2 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {p.product_name}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">{p.product_sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-red-600">
                          {formatPercent(p.volatility)}
                        </div>
                        <div className="text-xs text-gray-400">volatility</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Unstable Markets */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">Unstable Markets</h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {stability.unstableMarkets.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">All markets stable</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {stability.unstableMarkets.map((m) => (
                  <div key={m.category} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{m.category}</div>
                        <div className="text-xs text-gray-500">{m.product_count} products</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-amber-600">
                          {formatPercent(m.avg_volatility)}
                        </div>
                        <div className="text-xs text-gray-400">avg volatility</div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.min(100, m.avg_volatility * 300)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stale Offers */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">Stale Offers</h4>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {stability.staleOffers.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">All offers fresh</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {stability.staleOffers.slice(0, 8).map((o) => (
                  <div key={o.offer_id} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {o.supplier_name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{o.product_name}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${o.days_stale > 30 ? "text-red-600" : "text-amber-600"}`}>
                          {o.days_stale}d
                        </div>
                        <div className="text-xs text-gray-400">stale</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// FORECASTS SECTION
// ============================================================================

function ForecastsSection({ forecasts }: { forecasts: ForecastItem[] }) {
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  const typeLabels: Record<string, string> = {
    supplier_risk: "Supplier Risk",
    rebid_needed: "Rebid Needed",
    commercial_risk: "Commercial Risk",
  };

  const typeColors: Record<string, string> = {
    supplier_risk: "bg-red-50 border-red-200",
    rebid_needed: "bg-amber-50 border-amber-200",
    commercial_risk: "bg-orange-50 border-orange-200",
  };

  return (
    <section>
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
        Forecasts & Predictions
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {forecasts.map((forecast, idx) => (
          <div
            key={`${forecast.type}-${forecast.entity_id}-${idx}`}
            className={`rounded-lg border p-4 ${typeColors[forecast.type] || "bg-gray-50 border-gray-200"}`}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-white/50">
                {typeLabels[forecast.type] || forecast.type}
              </span>
              <span className="text-sm font-semibold text-gray-700">
                {formatPercent(forecast.confidence)} conf.
              </span>
            </div>
            <div className="text-sm font-semibold text-gray-900 mb-1">{forecast.entity_name}</div>
            <div className="text-xs text-gray-600 mb-2">{forecast.reasoning}</div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {forecast.predicted_impact && (
                <span>Impact: <strong>{forecast.predicted_impact}</strong></span>
              )}
              {forecast.time_horizon && (
                <span>Horizon: <strong>{forecast.time_horizon}</strong></span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// DETAIL PANELS
// ============================================================================

function SupplierDetailPanel({
  supplier,
  onClose,
}: {
  supplier: SupplierHealthItem | null;
  onClose: () => void;
}) {
  if (!supplier) return null;

  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <SlideOver
      open={!!supplier}
      onClose={onClose}
      title={supplier.supplier_name}
      subtitle="Supplier Health Details"
    >
      <SlideOverSection title="Reliability Score">
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold text-gray-900">
            {formatPercent(supplier.reliability_score)}
          </div>
          <div>
            <span
              className={`px-2 py-1 text-sm font-medium rounded-full capitalize ${
                supplier.reliability_band === "trusted"
                  ? "bg-green-100 text-green-700"
                  : supplier.reliability_band === "stable"
                  ? "bg-blue-100 text-blue-700"
                  : supplier.reliability_band === "watch"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {supplier.reliability_band}
            </span>
          </div>
        </div>
        {supplier.previous_score !== undefined && (
          <div className="mt-2 text-sm text-gray-500">
            Previous: {formatPercent(supplier.previous_score)}
            <span
              className={`ml-2 ${
                supplier.change_direction === "down"
                  ? "text-red-600"
                  : supplier.change_direction === "up"
                  ? "text-green-600"
                  : "text-gray-400"
              }`}
            >
              {supplier.change_direction === "down"
                ? "↓ Declining"
                : supplier.change_direction === "up"
                ? "↑ Improving"
                : "→ Stable"}
            </span>
          </div>
        )}
      </SlideOverSection>

      <SlideOverSection title="Key Metrics">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Products</div>
            <div className="text-lg font-semibold">{supplier.product_count}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Freshness</div>
            <div className="text-lg font-semibold">{formatPercent(supplier.freshness_score)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Anomaly Rate</div>
            <div className="text-lg font-semibold text-amber-600">
              {formatPercent(supplier.anomaly_rate)}
            </div>
          </div>
        </div>
      </SlideOverSection>

      <SlideOverSection title="Recommended Actions">
        <div className="space-y-2 text-sm">
          {supplier.reliability_band === "risky" && (
            <div className="p-3 bg-red-50 rounded-md text-red-800">
              Consider finding alternative suppliers for critical products
            </div>
          )}
          {supplier.reliability_band === "watch" && (
            <div className="p-3 bg-amber-50 rounded-md text-amber-800">
              Monitor closely and request updated pricing feeds
            </div>
          )}
          {supplier.freshness_score < 0.5 && (
            <div className="p-3 bg-blue-50 rounded-md text-blue-800">
              Request fresh pricing data from this supplier
            </div>
          )}
          {supplier.anomaly_rate > 0.2 && (
            <div className="p-3 bg-orange-50 rounded-md text-orange-800">
              Review pricing anomalies and validate data quality
            </div>
          )}
        </div>
      </SlideOverSection>
    </SlideOver>
  );
}

function OpportunityDetailPanel({
  opportunity,
  onClose,
}: {
  opportunity: MarginOpportunityItem | null;
  onClose: () => void;
}) {
  if (!opportunity) return null;

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <SlideOver
      open={!!opportunity}
      onClose={onClose}
      title={opportunity.product_name}
      subtitle={`SKU: ${opportunity.product_sku}`}
    >
      <SlideOverSection title="Opportunity Summary">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Current Cost</div>
            <div className="text-lg font-semibold">{formatCurrency(opportunity.current_cost)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Best Alternative</div>
            <div className="text-lg font-semibold text-green-600">
              {formatCurrency(opportunity.best_alternative_cost)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Savings/Case</div>
            <div className="text-lg font-semibold text-green-600">
              {formatCurrency(opportunity.estimated_savings_per_case)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Savings %</div>
            <div className="text-lg font-semibold text-green-600">
              {formatPercent(opportunity.estimated_savings_percent)}
            </div>
          </div>
        </div>
      </SlideOverSection>

      <SlideOverSection title="Alternative Supplier">
        <div className="p-3 bg-blue-50 rounded-md">
          <div className="font-medium text-blue-900">{opportunity.best_alternative_supplier}</div>
          <div className="text-sm text-blue-700 mt-1">
            Offers this product at {formatCurrency(opportunity.best_alternative_cost)}/case
          </div>
        </div>
      </SlideOverSection>

      <SlideOverSection title="Actions">
        <div className="flex gap-2">
          <button className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium">
            Accept Recommendation
          </button>
          <button className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-medium">
            Reject
          </button>
        </div>
      </SlideOverSection>

      <SlideOverSection title="View Product Intelligence">
        <Link
          href={`/admin/products/${opportunity.product_id}/intelligence`}
          className="block text-center px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 text-sm font-medium"
        >
          Open Product Intelligence →
        </Link>
      </SlideOverSection>
    </SlideOver>
  );
}

function AlertDetailPanel({
  alert,
  onClose,
}: {
  alert: ProcurementAlert | null;
  onClose: () => void;
}) {
  if (!alert) return null;

  const severityColors: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    normal: "bg-amber-100 text-amber-800",
    low: "bg-blue-100 text-blue-800",
  };

  return (
    <SlideOver open={!!alert} onClose={onClose} title={alert.title} subtitle={`Alert ${alert.id.slice(0, 8)}`}>
      <SlideOverSection title="Alert Details">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${severityColors[alert.severity]}`}>
              {alert.severity}
            </span>
            <span className="text-sm text-gray-500">{alert.alert_type.replace(/_/g, " ")}</span>
          </div>
          <p className="text-sm text-gray-700">{alert.description}</p>
        </div>
      </SlideOverSection>

      {(alert.product_name || alert.supplier_name) && (
        <SlideOverSection title="Related Entities">
          <div className="space-y-2">
            {alert.product_name && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Product</span>
                <Link
                  href={`/admin/products/${alert.product_id}/intelligence`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {alert.product_name}
                </Link>
              </div>
            )}
            {alert.supplier_name && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Supplier</span>
                <span className="text-sm font-medium">{alert.supplier_name}</span>
              </div>
            )}
          </div>
        </SlideOverSection>
      )}

      <SlideOverSection title="Timeline">
        <div className="text-sm text-gray-600">
          Created: {new Date(alert.created_at).toLocaleString()}
        </div>
      </SlideOverSection>

      <SlideOverSection title="Actions">
        <div className="flex gap-2">
          <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">
            Acknowledge
          </button>
          <button className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium">
            Resolve
          </button>
          <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-medium">
            Dismiss
          </button>
        </div>
      </SlideOverSection>
    </SlideOver>
  );
}
