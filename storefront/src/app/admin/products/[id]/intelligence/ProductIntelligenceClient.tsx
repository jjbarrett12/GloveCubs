"use client";

/**
 * Product Intelligence Client Component
 * 
 * Premium procurement intelligence dashboard for a single product.
 * Makes a glove product feel like a market intelligence object.
 */

import { useState } from "react";
import Link from "next/link";
import {
  StatusBadge,
  SlideOver,
  SlideOverSection,
  TableCard,
  TableToolbar,
} from "@/components/admin";
import type {
  ProductData,
  SupplierOffer,
  MarketOverview,
  PricingAlert,
  AnomalyHistoryItem,
} from "./page";

interface Props {
  product: ProductData;
  offers: SupplierOffer[];
  market: MarketOverview;
  alerts: PricingAlert[];
  anomalyHistory: AnomalyHistoryItem[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ProductIntelligenceClient({
  product,
  offers,
  market,
  alerts,
  anomalyHistory,
}: Props) {
  const [selectedOffer, setSelectedOffer] = useState<SupplierOffer | null>(null);
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showTrustExplanation, setShowTrustExplanation] = useState(false);

  const activeOffers = offers.filter((o) => o.is_active);
  const staleOffers = activeOffers.filter((o) => (o.freshness_score ?? 1) < 0.3);
  const suspiciousOffers = activeOffers.filter(
    (o) => o.trust_band === "low_trust" || (o.anomaly_penalty ?? 0) > 0.3
  );
  const reviewRequired = activeOffers.filter(
    (o) => o.trust_band === "review_sensitive" || o.trust_band === "low_trust"
  );

  return (
    <div className="space-y-6">
      {/* 1. Product Snapshot */}
      <ProductSnapshotSection
        product={product}
        market={market}
        offers={activeOffers}
        alerts={alerts}
      />

      {/* Active Alerts Banner */}
      {alerts.length > 0 && <AlertsBanner alerts={alerts} />}

      {/* 2. Market Comparison */}
      <MarketComparisonSection
        offers={activeOffers}
        market={market}
        onSelectOffer={setSelectedOffer}
        selectedOfferId={selectedOffer?.id}
      />

      {/* 3. Price Intelligence */}
      <PriceIntelligenceSection market={market} offers={activeOffers} />

      {/* 4. Supplier Quality */}
      <SupplierQualitySection
        offers={activeOffers}
        staleCount={staleOffers.length}
        anomalyCount={suspiciousOffers.length}
        reviewRequiredCount={reviewRequired.length}
      />

      {/* 5. Admin / Operator Detail */}
      <OperatorDetailSection
        product={product}
        market={market}
        offers={activeOffers}
        anomalyHistory={anomalyHistory}
        onShowAnomalies={() => setShowAnomalies(true)}
        onShowTrustExplanation={() => setShowTrustExplanation(true)}
      />

      {/* Detail Panels */}
      <OfferDetailPanel offer={selectedOffer} onClose={() => setSelectedOffer(null)} />
      <AnomalyHistoryPanel
        open={showAnomalies}
        onClose={() => setShowAnomalies(false)}
        history={anomalyHistory}
      />
      <TrustExplanationPanel
        open={showTrustExplanation}
        onClose={() => setShowTrustExplanation(false)}
      />
    </div>
  );
}

// ============================================================================
// 1. PRODUCT SNAPSHOT
// ============================================================================

function ProductSnapshotSection({
  product,
  market,
  offers,
  alerts,
}: {
  product: ProductData;
  market: MarketOverview;
  offers: SupplierOffer[];
  alerts: PricingAlert[];
}) {
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Determine commercial risk level
  const hasHighAlerts = alerts.some((a) => a.severity === "critical" || a.severity === "high");
  const hasLowTrustWinner = market.has_suspicious_offers;
  const highVolatility = market.price_volatility > 0.15;
  const commercialRisk = hasHighAlerts || hasLowTrustWinner ? "high" : highVolatility ? "medium" : "low";

  const riskColors = {
    low: "text-green-600 bg-green-50 border-green-200",
    medium: "text-amber-600 bg-amber-50 border-amber-200",
    high: "text-red-600 bg-red-50 border-red-200",
  };

  const volatilityLevel =
    market.price_volatility < 0.05 ? "stable" : market.price_volatility < 0.15 ? "moderate" : "volatile";
  const volatilityColors = {
    stable: "text-green-600",
    moderate: "text-amber-600",
    volatile: "text-red-600",
  };

  // Extract key attributes
  const attributes = product.attributes || {};
  const keyAttrs: string[] = [
    attributes.material ? String(attributes.material) : "",
    attributes.size ? `Size ${attributes.size}` : "",
    attributes.thickness_mil ? `${attributes.thickness_mil} mil` : "",
    attributes.powder_free === true ? "Powder-Free" : "",
    attributes.color ? String(attributes.color) : "",
  ].filter((x): x is string => x !== "");

  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{product.name}</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="font-mono text-sm text-gray-500">{product.sku}</span>
              {product.brand && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-sm text-gray-600">{product.brand}</span>
                </>
              )}
              {product.category && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-sm text-gray-500">{product.category}</span>
                </>
              )}
            </div>
            {keyAttrs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {keyAttrs.map((attr, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded"
                  >
                    {attr}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Commercial Risk Badge */}
          <div className={`px-3 py-2 rounded-lg border text-center ${riskColors[commercialRisk]}`}>
            <div className="text-xs font-medium uppercase tracking-wide opacity-75">
              Commercial Risk
            </div>
            <div className="text-lg font-bold capitalize">{commercialRisk}</div>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-5 divide-x divide-gray-100">
        <MetricCell
          label="Active Suppliers"
          value={market.supplier_count}
          subtext={`${offers.length} offers`}
        />
        <MetricCell
          label="Trust-Adjusted Best"
          value={formatPrice(market.best_trusted_price)}
          valueColor="text-blue-600"
          subtext="Recommended price"
        />
        <MetricCell
          label="Price Range"
          value={`${formatPrice(market.price_min)} – ${formatPrice(market.price_max)}`}
          subtext={`Spread: ${formatPercent((market.price_max - market.price_min) / market.price_min)}`}
        />
        <MetricCell
          label="30d Volatility"
          value={formatPercent(market.price_volatility)}
          valueColor={volatilityColors[volatilityLevel]}
          subtext={volatilityLevel.charAt(0).toUpperCase() + volatilityLevel.slice(1)}
        />
        <MetricCell
          label="Margin Opportunity"
          value={
            market.margin_opportunity_band
              ? market.margin_opportunity_band.replace(/_/g, " ")
              : "None"
          }
          valueColor={
            market.margin_opportunity_band === "major"
              ? "text-green-600"
              : market.margin_opportunity_band === "meaningful"
              ? "text-blue-600"
              : "text-gray-500"
          }
          subtext={market.margin_opportunity_score ? `Score: ${Math.round(market.margin_opportunity_score * 100)}` : ""}
        />
      </div>
    </section>
  );
}

function MetricCell({
  label,
  value,
  valueColor = "text-gray-900",
  subtext,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  subtext?: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${valueColor}`}>{value}</div>
      {subtext && <div className="text-xs text-gray-400 mt-0.5">{subtext}</div>}
    </div>
  );
}

/**
 * Supplier avatar with initials fallback
 */
function SupplierAvatar({
  name,
  isBestTrusted,
  hasAnomaly,
}: {
  name: string;
  isBestTrusted?: boolean;
  hasAnomaly?: boolean;
}) {
  const initials = getSupplierInitials(name);
  
  return (
    <div className="relative flex-shrink-0">
      <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm flex items-center justify-center">
        {initials}
      </div>
      {/* Status indicators */}
      {(isBestTrusted || hasAnomaly) && (
        <div className="absolute -bottom-0.5 -right-0.5 flex gap-0.5">
          {isBestTrusted && (
            <span
              className="w-4 h-4 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center border-2 border-white"
              title="Best Trusted"
            >
              ✓
            </span>
          )}
          {hasAnomaly && (
            <span
              className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center border-2 border-white"
              title="Anomaly Detected"
            >
              !
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get initials from supplier name (max 2 chars)
 */
function getSupplierInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return "?";
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ============================================================================
// ALERTS BANNER
// ============================================================================

function AlertsBanner({ alerts }: { alerts: PricingAlert[] }) {
  const critical = alerts.filter((a) => a.severity === "critical");
  const high = alerts.filter((a) => a.severity === "high");
  const displayAlert = critical[0] || high[0] || alerts[0];

  const severityStyles = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    normal: "bg-amber-100 text-amber-800",
    low: "bg-blue-100 text-blue-800",
  };

  return (
    <div
      className={`rounded-lg px-4 py-3 flex items-center justify-between ${
        severityStyles[displayAlert.severity as keyof typeof severityStyles] || severityStyles.normal
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{displayAlert.severity === "critical" ? "🚨" : "⚠️"}</span>
        <div>
          <div className="font-medium">{displayAlert.title}</div>
          <div className="text-sm opacity-90">{displayAlert.description}</div>
        </div>
      </div>
      {alerts.length > 1 && (
        <span className="text-sm opacity-75">+{alerts.length - 1} more alerts</span>
      )}
    </div>
  );
}

// ============================================================================
// 2. MARKET COMPARISON
// ============================================================================

function MarketComparisonSection({
  offers,
  market,
  onSelectOffer,
  selectedOfferId,
}: {
  offers: SupplierOffer[];
  market: MarketOverview;
  onSelectOffer: (offer: SupplierOffer) => void;
  selectedOfferId?: string;
}) {
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatPercent = (value?: number) => (value != null ? `${Math.round(value * 100)}%` : "—");

  // Sort by recommendation rank, then trust-adjusted price
  const sortedOffers = [...offers].sort((a, b) => {
    if (a.recommendation_rank && b.recommendation_rank) {
      return a.recommendation_rank - b.recommendation_rank;
    }
    if (a.recommendation_rank) return -1;
    if (b.recommendation_rank) return 1;
    const aAdjusted = a.cost * (1 + Math.pow(1 - (a.trust_score ?? 0.5), 1.5));
    const bAdjusted = b.cost * (1 + Math.pow(1 - (b.trust_score ?? 0.5), 1.5));
    return aAdjusted - bAdjusted;
  });

  const getTrustBadge = (band?: string, score?: number) => {
    const colors: Record<string, string> = {
      high_trust: "bg-green-100 text-green-700 border-green-200",
      medium_trust: "bg-blue-100 text-blue-700 border-blue-200",
      review_sensitive: "bg-amber-100 text-amber-700 border-amber-200",
      low_trust: "bg-red-100 text-red-700 border-red-200",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${
          colors[band || ""] || "bg-gray-100 text-gray-600 border-gray-200"
        }`}
      >
        {formatPercent(score)}
      </span>
    );
  };

  const getReliabilityBadge = (band?: string, score?: number) => {
    const colors: Record<string, string> = {
      trusted: "text-green-600",
      stable: "text-blue-600",
      watch: "text-amber-600",
      risky: "text-red-600",
    };
    return (
      <div className="text-center">
        <div className={`text-sm font-medium ${colors[band || ""] || "text-gray-500"}`}>
          {formatPercent(score)}
        </div>
        <div className="text-xs text-gray-400 capitalize">{band || "—"}</div>
      </div>
    );
  };

  const getFreshnessIndicator = (score?: number) => {
    if (score == null) return { icon: "○", color: "text-gray-400", label: "Unknown" };
    if (score >= 0.8) return { icon: "●", color: "text-green-500", label: "Fresh" };
    if (score >= 0.5) return { icon: "◐", color: "text-blue-500", label: "Recent" };
    if (score >= 0.2) return { icon: "○", color: "text-amber-500", label: "Stale" };
    return { icon: "○", color: "text-red-500", label: "Very Stale" };
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Market Comparison
        </h2>
        <span className="text-xs text-gray-500">
          {offers.length} active offers • Sorted by recommendation
        </span>
      </div>

      <TableCard>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">
                  Supplier
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase">
                  Price
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase">
                  Trust
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase">
                  Reliability
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase">
                  Fresh
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase">
                  Lead
                </th>
                <th className="w-12 px-3 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase">
                  Rev
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedOffers.map((offer) => {
                const freshness = getFreshnessIndicator(offer.freshness_score);
                const isBestTrusted = offer.supplier_id === market.best_trusted_supplier_id;
                const needsReview =
                  offer.trust_band === "review_sensitive" || offer.trust_band === "low_trust";
                const hasAnomaly = (offer.anomaly_penalty ?? 0) > 0.3;

                return (
                  <tr
                    key={offer.id}
                    onClick={() => onSelectOffer(offer)}
                    className={`cursor-pointer transition-colors hover:bg-blue-50 ${
                      selectedOfferId === offer.id
                        ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                        : ""
                    } ${isBestTrusted ? "bg-green-50/40" : ""}`}
                  >
                    {/* Rank */}
                    <td className="px-3 py-2.5 text-center">
                      {offer.recommendation_rank ? (
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full ${
                            offer.recommendation_rank === 1
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {offer.recommendation_rank}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Supplier */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {/* Supplier Initials Avatar */}
                        <SupplierAvatar
                          name={offer.supplier_name}
                          isBestTrusted={isBestTrusted}
                          hasAnomaly={hasAnomaly}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium text-gray-900 truncate max-w-[180px]"
                            title={offer.supplier_name}
                          >
                            {offer.supplier_name}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-mono truncate max-w-[120px]">
                              {offer.supplier_sku}
                            </span>
                            {isBestTrusted && (
                              <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 rounded">
                                Best
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-3 py-2.5 text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatPrice(offer.cost)}
                      </div>
                      {offer.units_per_case && (
                        <div className="text-xs text-gray-400">{offer.units_per_case} ct</div>
                      )}
                    </td>

                    {/* Trust */}
                    <td className="px-3 py-2.5 text-center">
                      {getTrustBadge(offer.trust_band, offer.trust_score)}
                    </td>

                    {/* Reliability */}
                    <td className="px-3 py-2.5">
                      {getReliabilityBadge(offer.reliability_band, offer.reliability_score)}
                    </td>

                    {/* Freshness */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-lg ${freshness.color}`} title={freshness.label}>
                        {freshness.icon}
                      </span>
                    </td>

                    {/* Lead Time */}
                    <td className="px-3 py-2.5 text-center text-sm text-gray-600">
                      {offer.lead_time_days ? `${offer.lead_time_days}d` : "—"}
                    </td>

                    {/* Review Required */}
                    <td className="px-3 py-2.5 text-center">
                      {needsReview ? (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-600 text-xs font-bold"
                          title="Review Required"
                        >
                          R
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TableCard>
    </section>
  );
}

// ============================================================================
// 3. PRICE INTELLIGENCE
// ============================================================================

function PriceIntelligenceSection({
  market,
  offers,
}: {
  market: MarketOverview;
  offers: SupplierOffer[];
}) {
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const suspiciousOffers = offers.filter(
    (o) => o.trust_band === "low_trust" || (o.anomaly_penalty ?? 0) > 0.3
  );

  const priceDiff = market.best_raw_price > 0 
    ? ((market.best_trusted_price - market.best_raw_price) / market.best_raw_price) * 100 
    : 0;

  const volatilityLevel =
    market.price_volatility < 0.05 ? "stable" : market.price_volatility < 0.15 ? "moderate" : "volatile";

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Price Intelligence
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Price Range */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Market Price Range
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">
              {formatPrice(market.price_min)}
            </span>
            <span className="text-gray-400">–</span>
            <span className="text-2xl font-bold text-gray-900">
              {formatPrice(market.price_max)}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 via-blue-400 to-gray-400"
              style={{ width: "100%" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>Low</span>
            <span>Median: {formatPrice(market.price_median)}</span>
            <span>High</span>
          </div>
        </div>

        {/* Best Trusted Price */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Best Trusted Price
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">
            {formatPrice(market.best_trusted_price)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Raw best: {formatPrice(market.best_raw_price)}
            {priceDiff > 0 && (
              <span className="ml-1 text-amber-600">(+{priceDiff.toFixed(1)}% trust adj.)</span>
            )}
          </div>
        </div>

        {/* Suspicious Warning */}
        <div
          className={`rounded-lg border p-4 ${
            suspiciousOffers.length > 0
              ? "bg-red-50 border-red-200"
              : "bg-green-50 border-green-200"
          }`}
        >
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Suspicious Offers
          </div>
          <div
            className={`mt-2 text-3xl font-bold ${
              suspiciousOffers.length > 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            {suspiciousOffers.length}
          </div>
          <div className="mt-1 text-xs text-gray-600">
            {suspiciousOffers.length > 0
              ? "Review before selecting"
              : "No anomalies detected"}
          </div>
        </div>

        {/* Price Stability */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Price Stability
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div
              className={`text-3xl font-bold ${
                volatilityLevel === "stable"
                  ? "text-green-600"
                  : volatilityLevel === "moderate"
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {formatPercent(market.price_volatility)}
            </div>
            <div
              className={`px-2 py-1 rounded text-xs font-medium uppercase ${
                volatilityLevel === "stable"
                  ? "bg-green-100 text-green-700"
                  : volatilityLevel === "moderate"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {volatilityLevel}
            </div>
          </div>
          <div className="mt-1 text-xs text-gray-500">30-day coefficient of variation</div>
        </div>
      </div>

      {/* Margin Opportunity Banner */}
      {market.margin_opportunity_band && market.margin_opportunity_band !== "none" && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 flex items-center gap-3 ${
            market.margin_opportunity_band === "major"
              ? "bg-green-50 border-green-200"
              : "bg-blue-50 border-blue-200"
          }`}
        >
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl ${
              market.margin_opportunity_band === "major"
                ? "bg-green-100 text-green-600"
                : "bg-blue-100 text-blue-600"
            }`}
          >
            $
          </div>
          <div>
            <div
              className={`font-semibold ${
                market.margin_opportunity_band === "major" ? "text-green-800" : "text-blue-800"
              }`}
            >
              {market.margin_opportunity_band === "major"
                ? "Major Margin Opportunity"
                : market.margin_opportunity_band === "meaningful"
                ? "Meaningful Margin Opportunity"
                : "Minor Margin Opportunity"}
            </div>
            <div className="text-sm text-gray-600">
              Alternative suppliers offer better pricing. Consider rebidding or renegotiating.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 4. SUPPLIER QUALITY
// ============================================================================

function SupplierQualitySection({
  offers,
  staleCount,
  anomalyCount,
  reviewRequiredCount,
}: {
  offers: SupplierOffer[];
  staleCount: number;
  anomalyCount: number;
  reviewRequiredCount: number;
}) {
  // Calculate reliability distribution
  const reliabilityBands = offers.reduce(
    (acc, o) => {
      const band = o.reliability_band || "unknown";
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate trust distribution
  const trustBands = offers.reduce(
    (acc, o) => {
      const band = o.trust_band || "unknown";
      acc[band] = (acc[band] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const total = offers.length || 1;

  const reliabilityColors: Record<string, { bg: string; bar: string }> = {
    trusted: { bg: "bg-green-100", bar: "bg-green-500" },
    stable: { bg: "bg-blue-100", bar: "bg-blue-500" },
    watch: { bg: "bg-amber-100", bar: "bg-amber-500" },
    risky: { bg: "bg-red-100", bar: "bg-red-500" },
    unknown: { bg: "bg-gray-100", bar: "bg-gray-300" },
  };

  const trustColors: Record<string, { bg: string; bar: string }> = {
    high_trust: { bg: "bg-green-100", bar: "bg-green-500" },
    medium_trust: { bg: "bg-blue-100", bar: "bg-blue-500" },
    review_sensitive: { bg: "bg-amber-100", bar: "bg-amber-500" },
    low_trust: { bg: "bg-red-100", bar: "bg-red-500" },
    unknown: { bg: "bg-gray-100", bar: "bg-gray-300" },
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Supplier Quality
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Reliability Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Supplier Reliability Distribution
          </div>
          <div className="space-y-2">
            {["trusted", "stable", "watch", "risky"].map((band) => {
              const count = reliabilityBands[band] || 0;
              const percent = (count / total) * 100;
              return (
                <div key={band} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-gray-600 capitalize">{band}</div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${reliabilityColors[band].bar}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="w-8 text-xs text-gray-500 text-right">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trust Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Offer Trust Distribution
          </div>
          <div className="space-y-2">
            {["high_trust", "medium_trust", "review_sensitive", "low_trust"].map((band) => {
              const count = trustBands[band] || 0;
              const percent = (count / total) * 100;
              return (
                <div key={band} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-gray-600 capitalize">
                    {band.replace(/_/g, " ")}
                  </div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${trustColors[band].bar}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="w-8 text-xs text-gray-500 text-right">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quality Indicators */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Quality Indicators
          </div>
          <div className="space-y-3">
            <QualityIndicator
              label="Stale Offers"
              value={staleCount}
              total={offers.length}
              threshold={0.2}
              badText="High stale rate"
              goodText="Offers are fresh"
            />
            <QualityIndicator
              label="Anomalies"
              value={anomalyCount}
              total={offers.length}
              threshold={0.1}
              badText="Investigate pricing"
              goodText="No anomalies"
            />
            <QualityIndicator
              label="Review Required"
              value={reviewRequiredCount}
              total={offers.length}
              threshold={0.3}
              badText="Many need review"
              goodText="Low review burden"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function QualityIndicator({
  label,
  value,
  total,
  threshold,
  badText,
  goodText,
}: {
  label: string;
  value: number;
  total: number;
  threshold: number;
  badText: string;
  goodText: string;
}) {
  const ratio = total > 0 ? value / total : 0;
  const isBad = ratio > threshold;

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className={`text-xs ${isBad ? "text-red-600" : "text-green-600"}`}>
          {isBad ? badText : goodText}
        </div>
      </div>
      <div
        className={`px-2.5 py-1 rounded-full text-sm font-bold ${
          isBad ? "bg-red-100 text-red-700" : value > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================================
// 5. OPERATOR DETAIL
// ============================================================================

function OperatorDetailSection({
  product,
  market,
  offers,
  anomalyHistory,
  onShowAnomalies,
  onShowTrustExplanation,
}: {
  product: ProductData;
  market: MarketOverview;
  offers: SupplierOffer[];
  anomalyHistory: AnomalyHistoryItem[];
  onShowAnomalies: () => void;
  onShowTrustExplanation: () => void;
}) {
  const suspiciousCount = anomalyHistory.filter((a) => a.is_suspicious).length;
  const hasOpportunity = market.margin_opportunity_band && market.margin_opportunity_band !== "none";
  const lowTrustCount = offers.filter((o) => o.trust_band === "low_trust").length;
  const riskySuppliers = offers.filter((o) => o.reliability_band === "risky").length;

  // Determine rebid guidance
  let rebidGuidance = "Market conditions are stable. No immediate action required.";
  let rebidUrgency: "low" | "medium" | "high" = "low";

  if (hasOpportunity && market.margin_opportunity_band === "major") {
    rebidGuidance = "Major savings available. Initiate rebid process with alternative suppliers.";
    rebidUrgency = "high";
  } else if (hasOpportunity) {
    rebidGuidance = "Meaningful savings possible. Consider requesting updated quotes.";
    rebidUrgency = "medium";
  } else if (riskySuppliers > offers.length / 2) {
    rebidGuidance = "Supplier quality concerns. Diversify supplier base.";
    rebidUrgency = "medium";
  } else if (market.price_volatility > 0.15) {
    rebidGuidance = "High volatility market. Lock in pricing when favorable.";
    rebidUrgency = "medium";
  }

  const urgencyColors = {
    low: "border-gray-200 bg-gray-50",
    medium: "border-amber-200 bg-amber-50",
    high: "border-green-200 bg-green-50",
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Operator Detail
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Rebid / Re-source Guidance */}
        <div className={`rounded-lg border p-4 ${urgencyColors[rebidUrgency]}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Rebid / Re-source Guidance
              </div>
              <div className="mt-2 text-sm font-medium text-gray-900">{rebidGuidance}</div>
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-100 rounded hover:bg-blue-200">
                  Request Quotes
                </button>
                <button className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50">
                  View Alternatives
                </button>
              </div>
            </div>
            <div
              className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                rebidUrgency === "high"
                  ? "bg-green-600 text-white"
                  : rebidUrgency === "medium"
                  ? "bg-amber-500 text-white"
                  : "bg-gray-400 text-white"
              }`}
            >
              {rebidUrgency === "high" ? "Act Now" : rebidUrgency === "medium" ? "Review" : "Monitor"}
            </div>
          </div>
        </div>

        {/* Recommendation Reasoning */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Recommendation Reasoning
          </div>
          <div className="mt-2 text-sm text-gray-600 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>Rankings combine trust-adjusted price with reliability</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>Lower trust scores incur exponential price penalty</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>Lead time and freshness are tie-breakers</span>
            </div>
            {lowTrustCount > 0 && (
              <div className="flex items-center gap-2 text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>{lowTrustCount} offer(s) penalized for low trust</span>
              </div>
            )}
          </div>
          <button
            onClick={onShowTrustExplanation}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            View full trust methodology →
          </button>
        </div>

        {/* Anomaly History */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Anomaly History (30d)
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-bold text-gray-900">{anomalyHistory.length}</span>
                <span className="text-sm text-gray-500">analyses</span>
              </div>
              {suspiciousCount > 0 && (
                <div className="mt-1 text-sm text-red-600">
                  {suspiciousCount} flagged as suspicious
                </div>
              )}
            </div>
            <button
              onClick={onShowAnomalies}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
            >
              View All
            </button>
          </div>
        </div>

        {/* Forecast Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Forecast Summary
          </div>
          <div className="mt-2 space-y-2">
            <ForecastRow
              label="Price Trend"
              value={market.price_volatility > 0.1 ? "Uncertain" : "Stable"}
              confidence={market.price_volatility > 0.1 ? 60 : 85}
            />
            <ForecastRow
              label="Supply Risk"
              value={riskySuppliers > 0 ? "Elevated" : "Low"}
              confidence={riskySuppliers > 0 ? 70 : 90}
            />
            <ForecastRow
              label="Rebid Timing"
              value={hasOpportunity ? "Favorable" : "Neutral"}
              confidence={hasOpportunity ? 80 : 65}
            />
          </div>
          <div className="mt-3 text-xs text-gray-400">
            Forecasts based on historical patterns and current market signals
          </div>
        </div>
      </div>
    </section>
  );
}

function ForecastRow({
  label,
  value,
  confidence,
}: {
  label: string;
  value: string;
  confidence: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{value}</span>
        <span className="text-xs text-gray-400">({confidence}% conf.)</span>
      </div>
    </div>
  );
}

// ============================================================================
// DETAIL PANELS
// ============================================================================

function OfferDetailPanel({
  offer,
  onClose,
}: {
  offer: SupplierOffer | null;
  onClose: () => void;
}) {
  if (!offer) return null;

  const formatPercent = (value?: number) =>
    value != null ? `${Math.round(value * 100)}%` : "—";

  return (
    <SlideOver
      open={!!offer}
      onClose={onClose}
      title={offer.supplier_name}
      subtitle={`SKU: ${offer.supplier_sku}`}
      width="lg"
    >
      <SlideOverSection title="Pricing Details">
        <div className="grid grid-cols-2 gap-4">
          <DataField label="Cost" value={`$${offer.cost.toFixed(2)}`} />
          <DataField
            label="Sell Price"
            value={offer.sell_price ? `$${offer.sell_price.toFixed(2)}` : "—"}
          />
          <DataField label="Units/Case" value={offer.units_per_case || "—"} />
          <DataField
            label="Lead Time"
            value={offer.lead_time_days ? `${offer.lead_time_days} days` : "—"}
          />
        </div>
      </SlideOverSection>

      <SlideOverSection title="Trust Score Breakdown">
        <div className="space-y-3">
          <ScoreBar label="Overall Trust" value={offer.trust_score} band={offer.trust_band} />
          <ScoreBar
            label="Supplier Reliability"
            value={offer.reliability_score}
            band={offer.reliability_band}
          />
          <ScoreBar label="Match Confidence" value={offer.match_confidence} />
          <ScoreBar label="Offer Freshness" value={offer.freshness_score} />
          {offer.anomaly_penalty && offer.anomaly_penalty > 0 && (
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <span className="text-sm text-red-600 font-medium">Anomaly Penalty</span>
              <span className="text-sm font-bold text-red-600">
                -{formatPercent(offer.anomaly_penalty)}
              </span>
            </div>
          )}
        </div>
      </SlideOverSection>

      <SlideOverSection title="Recommendation">
        {offer.recommendation_rank ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 text-blue-700 text-2xl font-bold">
              #{offer.recommendation_rank}
            </div>
            <div>
              <div className="text-sm text-gray-500">Recommendation Score</div>
              <div className="text-xl font-bold">{formatPercent(offer.recommendation_score)}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">No recommendation generated for this offer</div>
        )}
      </SlideOverSection>

      <SlideOverSection title="Metadata">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Last Updated</span>
            <span className="text-gray-900">{new Date(offer.updated_at).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Offer ID</span>
            <span className="text-gray-900 font-mono text-xs">{offer.id}</span>
          </div>
        </div>
      </SlideOverSection>
    </SlideOver>
  );
}

function DataField({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function ScoreBar({ label, value, band }: { label: string; value?: number; band?: string }) {
  const percent = value != null ? value * 100 : 0;

  const getColor = () => {
    if (value == null) return "bg-gray-200";
    if (value >= 0.8) return "bg-green-500";
    if (value >= 0.6) return "bg-blue-500";
    if (value >= 0.4) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">
          {value != null ? `${Math.round(percent)}%` : "—"}
          {band && (
            <span className="text-xs text-gray-400 ml-1">({band.replace(/_/g, " ")})</span>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${getColor()}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function AnomalyHistoryPanel({
  open,
  onClose,
  history,
}: {
  open: boolean;
  onClose: () => void;
  history: AnomalyHistoryItem[];
}) {
  return (
    <SlideOver open={open} onClose={onClose} title="Anomaly History" subtitle="Last 30 days" width="lg">
      {history.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          No pricing analyses recorded for this product
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border p-3 ${
                item.is_suspicious ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      item.is_suspicious ? "bg-red-500" : "bg-green-500"
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900">{item.supplier_name}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-1 text-sm text-gray-600">{item.analysis_category}</div>
              {item.reasoning && (
                <div className="mt-1 text-xs text-gray-500 italic">{item.reasoning}</div>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="text-gray-400">
                  Confidence: {Math.round(item.confidence * 100)}%
                </span>
                {item.is_suspicious && (
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                    Suspicious
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SlideOver>
  );
}

function TrustExplanationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Trust Score Methodology"
      subtitle="How offer trust is calculated"
      width="lg"
    >
      <SlideOverSection title="Overview">
        <p className="text-sm text-gray-600">
          Trust scores determine how reliable an offer's pricing data is. Lower trust means higher
          risk of pricing errors, stale data, or anomalies. Trust-adjusted pricing penalizes
          low-trust offers to prevent risky purchasing decisions.
        </p>
      </SlideOverSection>

      <SlideOverSection title="Scoring Weights">
        <div className="space-y-3">
          <WeightRow label="Supplier Reliability" weight={25} description="Historical supplier accuracy and consistency" />
          <WeightRow label="Match Confidence" weight={18} description="Certainty of product-to-offer mapping" />
          <WeightRow label="Extraction Confidence" weight={12} description="AI confidence in parsed data" />
          <WeightRow label="Pricing Confidence" weight={12} description="Price reasonableness validation" />
          <WeightRow label="Normalization Confidence" weight={10} description="Pack size / unit clarity" />
          <WeightRow label="Freshness" weight={8} description="Recency of offer update" />
        </div>
      </SlideOverSection>

      <SlideOverSection title="Penalties">
        <div className="space-y-3">
          <WeightRow label="Anomaly Penalty" weight={-10} description="Deducted for suspicious pricing patterns" negative />
          <WeightRow label="Correction Penalty" weight={-5} description="Deducted for past human corrections" negative />
        </div>
      </SlideOverSection>

      <SlideOverSection title="Trust Bands">
        <div className="space-y-2">
          <BandRow band="High Trust" range="≥ 80%" color="green" description="Safe for automated decisions" />
          <BandRow band="Medium Trust" range="60-79%" color="blue" description="Generally reliable" />
          <BandRow band="Review Sensitive" range="40-59%" color="amber" description="Manual review recommended" />
          <BandRow band="Low Trust" range="< 40%" color="red" description="Do not use without verification" />
        </div>
      </SlideOverSection>

      <SlideOverSection title="Price Adjustment Formula">
        <div className="p-3 bg-gray-50 rounded-lg font-mono text-sm">
          <div className="text-gray-600">adjusted_price = raw_price × (1 + penalty)</div>
          <div className="text-gray-600 mt-1">penalty = (1 - trust_score)^1.5 × 100%</div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Example: 50% trust = 35% price penalty; 20% trust = 72% penalty
        </p>
      </SlideOverSection>
    </SlideOver>
  );
}

function WeightRow({
  label,
  weight,
  description,
  negative,
}: {
  label: string;
  weight: number;
  description: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex-shrink-0 w-10 text-right text-sm font-bold ${
          negative ? "text-red-600" : "text-blue-600"
        }`}
      >
        {negative ? "" : "+"}{weight}%
      </div>
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </div>
  );
}

function BandRow({
  band,
  range,
  color,
  description,
}: {
  band: string;
  range: string;
  color: string;
  description: string;
}) {
  const colors: Record<string, string> = {
    green: "bg-green-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full ${colors[color]}`} />
      <div className="w-28 text-sm font-medium text-gray-900">{band}</div>
      <div className="w-16 text-sm text-gray-500">{range}</div>
      <div className="text-sm text-gray-600">{description}</div>
    </div>
  );
}
