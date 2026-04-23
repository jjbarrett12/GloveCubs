"use client";

/**
 * Buyer Intelligence Dashboard Client
 * 
 * Enterprise buyer-facing dashboard showing platform value.
 */

import { useState } from "react";
import Link from "next/link";
import {
  SlideOver,
  SlideOverSection,
  TableCard,
} from "@/components/admin";
import type {
  BuyerDashboardData,
  SavingsOpportunity,
  SupplierComparisonItem,
} from "./page";

interface Props {
  data: BuyerDashboardData;
}

export function BuyerDashboardClient({ data }: Props) {
  const [selectedOpportunity, setSelectedOpportunity] = useState<SavingsOpportunity | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierComparisonItem | null>(null);

  return (
    <div className="space-y-8">
      {/* Hero Savings Summary */}
      <SavingsSummarySection savings={data.savings} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Intelligence */}
        <MarketIntelligenceSection market={data.market} />

        {/* Procurement Risk */}
        <ProcurementRiskSection risks={data.risks} />
      </div>

      {/* Supplier Comparison */}
      <SupplierComparisonSection
        suppliers={data.suppliers}
        onSelectSupplier={setSelectedSupplier}
      />

      {/* Opportunity Engine */}
      <OpportunityEngineSection
        opportunities={data.opportunities}
        onSelectOpportunity={setSelectedOpportunity}
      />

      {/* Spend Analytics */}
      <SpendAnalyticsSection spend={data.spend} />

      {/* Detail Panels */}
      <OpportunityDetailPanel
        opportunity={selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
      />
      <SupplierDetailPanel
        supplier={selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
      />
    </div>
  );
}

// ============================================================================
// SAVINGS SUMMARY (HERO)
// ============================================================================

function SavingsSummarySection({ savings }: { savings: BuyerDashboardData["savings"] }) {
  const formatCurrency = (value: number) =>
    value >= 10000
      ? `$${(value / 1000).toFixed(0)}k`
      : value >= 1000
      ? `$${(value / 1000).toFixed(1)}k`
      : `$${value.toFixed(0)}`;

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <section className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium opacity-90">This Quarter</h2>
          <div className="text-4xl font-bold mt-1">
            {formatCurrency(savings.quarter_savings)}
            <span className="text-lg font-normal opacity-75 ml-2">total savings</span>
          </div>
        </div>
        {savings.vs_last_quarter !== 0 && (
          <div
            className={`px-4 py-2 rounded-lg ${
              savings.vs_last_quarter > 0 ? "bg-green-500/20" : "bg-red-500/20"
            }`}
          >
            <div className="text-sm opacity-75">vs Last Quarter</div>
            <div className="text-xl font-bold">
              {savings.vs_last_quarter > 0 ? "+" : ""}
              {formatPercent(savings.vs_last_quarter)}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <SavingsMetric
          label="Realized Savings"
          value={formatCurrency(savings.realized_savings)}
          subtext={`${savings.savings_count} opportunities captured`}
        />
        <SavingsMetric
          label="Pipeline Savings"
          value={formatCurrency(savings.pipeline_savings)}
          subtext="Open opportunities"
        />
        <SavingsMetric
          label="Avg Savings Rate"
          value={formatPercent(savings.avg_savings_percent * 100)}
          subtext="Per opportunity"
        />
        <SavingsMetric
          label="Platform Value"
          value={formatCurrency(savings.quarter_savings * 4)}
          subtext="Projected annual"
        />
      </div>
    </section>
  );
}

function SavingsMetric({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="bg-white/10 rounded-lg p-4">
      <div className="text-sm opacity-75">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs opacity-60 mt-1">{subtext}</div>
    </div>
  );
}

// ============================================================================
// MARKET INTELLIGENCE
// ============================================================================

function MarketIntelligenceSection({ market }: { market: BuyerDashboardData["market"] }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
        Market Intelligence
      </h3>

      <div className="space-y-4">
        {/* Coverage */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Product Coverage</div>
            <div className="text-xs text-gray-400">Products with active offers</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {market.products_with_offers}
              <span className="text-sm font-normal text-gray-500">
                {" "}
                / {market.total_products}
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {market.total_products > 0
                ? Math.round((market.products_with_offers / market.total_products) * 100)
                : 0}
              % coverage
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Price Range */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Avg Price Range</div>
            <div className="text-xs text-gray-400">Spread between suppliers</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {market.avg_price_range_percent.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-400">Opportunity for negotiation</div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Data Quality */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div
              className={`text-2xl font-bold ${
                market.suspicious_offer_count > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {market.suspicious_offer_count}
            </div>
            <div className="text-xs text-gray-500">Suspicious Offers</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div
              className={`text-2xl font-bold ${
                market.stale_offer_count > 10 ? "text-amber-600" : "text-green-600"
              }`}
            >
              {market.stale_offer_count}
            </div>
            <div className="text-xs text-gray-500">Stale Offers</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// PROCUREMENT RISK
// ============================================================================

function ProcurementRiskSection({ risks }: { risks: BuyerDashboardData["risks"] }) {
  const hasRisks =
    risks.critical_alerts > 0 ||
    risks.high_alerts > 0 ||
    risks.deteriorating_suppliers.length > 0 ||
    risks.volatile_products.length > 0;

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Procurement Risk
        </h3>
        {hasRisks && (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            Attention Needed
          </span>
        )}
      </div>

      {!hasRisks ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-3xl mb-2">✓</div>
          <div className="font-medium">All Clear</div>
          <div className="text-sm">No significant risks detected</div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Alert Summary */}
          {(risks.critical_alerts > 0 || risks.high_alerts > 0) && (
            <div className="flex gap-3">
              {risks.critical_alerts > 0 && (
                <div className="flex-1 p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">{risks.critical_alerts}</div>
                  <div className="text-xs text-red-700">Critical Alerts</div>
                </div>
              )}
              {risks.high_alerts > 0 && (
                <div className="flex-1 p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                  <div className="text-2xl font-bold text-orange-600">{risks.high_alerts}</div>
                  <div className="text-xs text-orange-700">High Alerts</div>
                </div>
              )}
            </div>
          )}

          {/* Deteriorating Suppliers */}
          {risks.deteriorating_suppliers.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Supplier Deterioration
              </div>
              <div className="space-y-2">
                {risks.deteriorating_suppliers.slice(0, 3).map((s) => (
                  <div
                    key={s.supplier_id}
                    className="flex items-center justify-between p-2 bg-amber-50 rounded"
                  >
                    <span className="text-sm font-medium text-gray-900">{s.supplier_name}</span>
                    <span className="text-sm text-red-600 font-medium">
                      {s.change_percent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Volatile Products */}
          {risks.volatile_products.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Price Volatility
              </div>
              <div className="space-y-2">
                {risks.volatile_products.slice(0, 3).map((p) => (
                  <div
                    key={p.product_id}
                    className="flex items-center justify-between p-2 bg-amber-50 rounded"
                  >
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                      {p.product_name}
                    </span>
                    <span className="text-sm text-amber-600 font-medium">
                      {(p.volatility * 100).toFixed(0)}% vol
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// SUPPLIER COMPARISON
// ============================================================================

function SupplierComparisonSection({
  suppliers,
  onSelectSupplier,
}: {
  suppliers: SupplierComparisonItem[];
  onSelectSupplier: (supplier: SupplierComparisonItem) => void;
}) {
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  const getReliabilityColor = (band: string) => {
    if (band === "trusted") return "text-green-600 bg-green-100";
    if (band === "stable") return "text-blue-600 bg-blue-100";
    if (band === "watch") return "text-amber-600 bg-amber-100";
    return "text-red-600 bg-red-100";
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Supplier Comparison
        </h3>
        <span className="text-xs text-gray-500">{suppliers.length} active suppliers</span>
      </div>

      <TableCard>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Supplier
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                  Products
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                  Avg Price
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                  Trust Score
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                  Reliability
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                  #1 Picks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.map((supplier, idx) => (
                <tr
                  key={supplier.supplier_id}
                  onClick={() => onSelectSupplier(supplier)}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {supplier.supplier_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    {supplier.product_count}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                    ${supplier.avg_price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TrustMeter value={supplier.avg_trust_score} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${getReliabilityColor(
                        supplier.reliability_band
                      )}`}
                    >
                      {supplier.reliability_band}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {supplier.recommendation_wins > 0 ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                        {supplier.recommendation_wins}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableCard>
    </section>
  );
}

function TrustMeter({ value }: { value: number }) {
  const percent = value * 100;
  const getColor = () => {
    if (value >= 0.8) return "bg-green-500";
    if (value >= 0.6) return "bg-blue-500";
    if (value >= 0.4) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${getColor()}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-gray-500">{Math.round(percent)}%</span>
    </div>
  );
}

// ============================================================================
// OPPORTUNITY ENGINE
// ============================================================================

function OpportunityEngineSection({
  opportunities,
  onSelectOpportunity,
}: {
  opportunities: SavingsOpportunity[];
  onSelectOpportunity: (opp: SavingsOpportunity) => void;
}) {
  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const totalPotentialSavings = opportunities.reduce((sum, o) => sum + o.savings_per_case, 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Opportunity Engine
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {opportunities.length} opportunities • {formatCurrency(totalPotentialSavings)} potential savings
          </p>
        </div>
        <Link
          href="/admin/commercial"
          className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
        >
          View All Opportunities
        </Link>
      </div>

      {opportunities.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="text-3xl mb-2">🎯</div>
          <div className="font-medium text-gray-900">No Open Opportunities</div>
          <div className="text-sm text-gray-500 mt-1">
            All current savings opportunities have been reviewed
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {opportunities.slice(0, 6).map((opp) => (
            <div
              key={opp.id}
              onClick={() => onSelectOpportunity(opp)}
              className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {opp.product_name}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">{opp.product_sku}</div>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    opp.opportunity_band === "major"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {opp.opportunity_band}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Current</div>
                  <div className="text-sm font-medium text-gray-600 line-through">
                    {formatCurrency(opp.current_cost)}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{opp.current_supplier}</div>
                </div>
                <div className="text-gray-300">→</div>
                <div className="flex-1">
                  <div className="text-xs text-gray-500">Recommended</div>
                  <div className="text-sm font-bold text-green-600">
                    {formatCurrency(opp.recommended_cost)}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{opp.recommended_supplier}</div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-bold text-green-600">
                    {formatCurrency(opp.savings_per_case)}
                  </span>
                  <span className="text-gray-500"> savings/case</span>
                </div>
                <div className="text-xs text-gray-400">{formatPercent(opp.savings_percent)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// SPEND ANALYTICS
// ============================================================================

function SpendAnalyticsSection({ spend }: { spend: BuyerDashboardData["spend"] }) {
  const formatCurrency = (value: number) =>
    value >= 10000 ? `$${(value / 1000).toFixed(0)}k` : `$${value.toFixed(0)}`;

  const maxCategorySpend = Math.max(...spend.spend_by_category.map((c) => c.spend), 1);

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
        Spend Analytics
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend by Category */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-700">Spend by Category</div>
            <div className="text-xs text-gray-500">Total: {formatCurrency(spend.total_spend)}</div>
          </div>

          {spend.spend_by_category.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No spend data available</div>
          ) : (
            <div className="space-y-3">
              {spend.spend_by_category.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{cat.category}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(cat.spend)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(cat.spend / maxCategorySpend) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spend Trend */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm font-medium text-gray-700 mb-4">Spend Trend</div>

          {spend.spend_trend.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No trend data available</div>
          ) : (
            <div className="h-48 flex items-end gap-2">
              {spend.spend_trend.map((month, idx) => {
                const maxSpend = Math.max(...spend.spend_trend.map((m) => m.spend), 1);
                const height = (month.spend / maxSpend) * 100;
                return (
                  <div key={month.period} className="flex-1 flex flex-col items-center">
                    <div className="flex-1 w-full flex items-end">
                      <div
                        className="w-full bg-blue-500 rounded-t"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {new Date(month.period + "-01").toLocaleDateString("en-US", {
                        month: "short",
                      })}
                    </div>
                    <div className="text-xs font-medium text-gray-700">
                      {formatCurrency(month.spend)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// DETAIL PANELS
// ============================================================================

function OpportunityDetailPanel({
  opportunity,
  onClose,
}: {
  opportunity: SavingsOpportunity | null;
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
      width="lg"
    >
      <SlideOverSection title="Opportunity Summary">
        <div
          className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${
            opportunity.opportunity_band === "major"
              ? "bg-green-100 text-green-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {opportunity.opportunity_band} opportunity
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Current</div>
            <div className="text-2xl font-bold text-gray-600 mt-1">
              {formatCurrency(opportunity.current_cost)}
            </div>
            <div className="text-sm text-gray-500 mt-1">{opportunity.current_supplier}</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Recommended</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(opportunity.recommended_cost)}
            </div>
            <div className="text-sm text-gray-500 mt-1">{opportunity.recommended_supplier}</div>
          </div>
        </div>
      </SlideOverSection>

      <SlideOverSection title="Savings Details">
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Savings per Case</span>
            <span className="text-lg font-bold text-green-600">
              {formatCurrency(opportunity.savings_per_case)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Savings Percentage</span>
            <span className="text-lg font-bold text-green-600">
              {formatPercent(opportunity.savings_percent)}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-600">Recommendation Confidence</span>
            <span className="text-sm font-medium text-gray-900">
              {Math.round(opportunity.confidence * 100)}%
            </span>
          </div>
        </div>
      </SlideOverSection>

      <SlideOverSection title="Actions">
        <div className="flex gap-3">
          <button className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            Accept Recommendation
          </button>
          <button className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">
            Reject
          </button>
        </div>
        <Link
          href={`/admin/products/${opportunity.product_id}/intelligence`}
          className="block mt-3 text-center text-sm text-blue-600 hover:underline"
        >
          View Full Product Intelligence →
        </Link>
      </SlideOverSection>
    </SlideOver>
  );
}

function SupplierDetailPanel({
  supplier,
  onClose,
}: {
  supplier: SupplierComparisonItem | null;
  onClose: () => void;
}) {
  if (!supplier) return null;

  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  const getReliabilityColor = (band: string) => {
    if (band === "trusted") return "text-green-600";
    if (band === "stable") return "text-blue-600";
    if (band === "watch") return "text-amber-600";
    return "text-red-600";
  };

  return (
    <SlideOver
      open={!!supplier}
      onClose={onClose}
      title={supplier.supplier_name}
      subtitle="Supplier Details"
      width="lg"
    >
      <SlideOverSection title="Overview">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-900">{supplier.product_count}</div>
            <div className="text-xs text-gray-500">Products</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">{supplier.recommendation_wins}</div>
            <div className="text-xs text-gray-500">#1 Recommendations</div>
          </div>
        </div>
      </SlideOverSection>

      <SlideOverSection title="Trust & Reliability">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">Average Trust Score</span>
              <span className="font-medium">{formatPercent(supplier.avg_trust_score)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${supplier.avg_trust_score * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">Reliability Score</span>
              <span className="font-medium">{formatPercent(supplier.reliability_score)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500"
                style={{ width: `${supplier.reliability_score * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-gray-600">Reliability Band</span>
            <span
              className={`text-sm font-bold capitalize ${getReliabilityColor(
                supplier.reliability_band
              )}`}
            >
              {supplier.reliability_band}
            </span>
          </div>
        </div>
      </SlideOverSection>

      <SlideOverSection title="Pricing">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Average Price</span>
          <span className="text-lg font-bold text-gray-900">${supplier.avg_price.toFixed(2)}</span>
        </div>
      </SlideOverSection>
    </SlideOver>
  );
}
