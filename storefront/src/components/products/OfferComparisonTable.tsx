"use client";

/**
 * OfferComparisonTable
 * 
 * Product offer comparison table with full supplier identity visibility.
 * 
 * Displays:
 * - Supplier name (with fallback for missing logo)
 * - Price
 * - Trust score
 * - Reliability score
 * - Offer freshness
 * 
 * Handles:
 * - Missing supplier logos (shows initials)
 * - Long supplier names (truncation with tooltip)
 * - Multiple offers from same supplier (grouped or separate)
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface OfferForComparison {
  offer_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_logo_url?: string;
  supplier_reliability_score: number;
  supplier_reliability_band: string;
  price: number;
  price_per_unit?: number;
  units_per_case?: number;
  lead_time_days?: number;
  trust_score: number;
  trust_band: string;
  freshness_score: number;
  freshness_status: 'fresh' | 'recent' | 'stale' | 'very_stale';
  recommendation_rank?: number;
  is_recommended: boolean;
  updated_at: string;
  days_since_update: number;
}

export interface OfferComparisonTableProps {
  offers: OfferForComparison[];
  onSelectOffer?: (offer: OfferForComparison) => void;
  selectedOfferId?: string;
  showRanking?: boolean;
  showLeadTime?: boolean;
  compact?: boolean;
  className?: string;
}

export function OfferComparisonTable({
  offers,
  onSelectOffer,
  selectedOfferId,
  showRanking = true,
  showLeadTime = true,
  compact = false,
  className,
}: OfferComparisonTableProps) {
  const [hoveredOfferId, setHoveredOfferId] = useState<string | null>(null);
  
  if (offers.length === 0) {
    return (
      <div className={cn(
        "bg-white rounded-lg border border-gray-200 p-8 text-center",
        className
      )}>
        <p className="text-gray-500">No offers available for this product</p>
      </div>
    );
  }
  
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {showRanking && (
                <th className="w-12 px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Rank
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Supplier
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Price
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Trust Score
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Reliability
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Freshness
              </th>
              {showLeadTime && (
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Lead Time
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {offers.map((offer, index) => {
              const isSelected = selectedOfferId === offer.offer_id;
              const isHovered = hoveredOfferId === offer.offer_id;
              
              return (
                <tr
                  key={offer.offer_id}
                  onClick={() => onSelectOffer?.(offer)}
                  onMouseEnter={() => setHoveredOfferId(offer.offer_id)}
                  onMouseLeave={() => setHoveredOfferId(null)}
                  className={cn(
                    "transition-colors",
                    onSelectOffer && "cursor-pointer",
                    isSelected && "bg-blue-50 ring-1 ring-inset ring-blue-200",
                    isHovered && !isSelected && "bg-gray-50",
                    offer.is_recommended && !isSelected && "bg-green-50/50"
                  )}
                >
                  {/* Rank */}
                  {showRanking && (
                    <td className="px-3 py-3 text-center">
                      {offer.recommendation_rank ? (
                        <RankBadge rank={offer.recommendation_rank} />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  {/* Supplier */}
                  <td className="px-4 py-3">
                    <SupplierCell
                      name={offer.supplier_name}
                      logoUrl={offer.supplier_logo_url}
                      isRecommended={offer.is_recommended}
                      compact={compact}
                    />
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatPrice(offer.price)}
                    </div>
                    {offer.units_per_case && !compact && (
                      <div className="text-xs text-gray-500">
                        {offer.units_per_case} ct
                        {offer.price_per_unit && (
                          <span className="ml-1">
                            (${offer.price_per_unit.toFixed(3)}/ea)
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Trust Score */}
                  <td className="px-4 py-3 text-center">
                    <TrustScoreBadge
                      score={offer.trust_score}
                      band={offer.trust_band}
                      compact={compact}
                    />
                  </td>

                  {/* Reliability */}
                  <td className="px-4 py-3 text-center">
                    <ReliabilityBadge
                      score={offer.supplier_reliability_score}
                      band={offer.supplier_reliability_band}
                      compact={compact}
                    />
                  </td>

                  {/* Freshness */}
                  <td className="px-4 py-3 text-center">
                    <FreshnessIndicator
                      score={offer.freshness_score}
                      status={offer.freshness_status}
                      daysSinceUpdate={offer.days_since_update}
                      compact={compact}
                    />
                  </td>

                  {/* Lead Time */}
                  {showLeadTime && (
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {offer.lead_time_days ? `${offer.lead_time_days}d` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Rank badge showing recommendation position
 */
function RankBadge({ rank }: { rank: number }) {
  const isTop = rank === 1;
  
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full",
        isTop
          ? "bg-blue-600 text-white"
          : rank <= 3
          ? "bg-blue-100 text-blue-700"
          : "bg-gray-100 text-gray-600"
      )}
    >
      {rank}
    </span>
  );
}

/**
 * Supplier cell with logo/initials, name, and recommended badge
 */
function SupplierCell({
  name,
  logoUrl,
  isRecommended,
  compact,
}: {
  name: string;
  logoUrl?: string;
  isRecommended: boolean;
  compact?: boolean;
}) {
  const initials = getSupplierInitials(name);
  const displayName = truncateSupplierName(name, compact ? 20 : 30);
  const isLongName = name.length > (compact ? 20 : 30);
  
  return (
    <div className="flex items-center gap-3">
      {/* Logo or Initials */}
      <div className="flex-shrink-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            className={cn(
              "rounded-full object-cover bg-gray-100",
              compact ? "w-8 h-8" : "w-10 h-10"
            )}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                const fallback = document.createElement('div');
                fallback.className = cn(
                  "flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-semibold",
                  compact ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm"
                );
                fallback.textContent = initials;
                parent.appendChild(fallback);
              }
            }}
          />
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-semibold",
              compact ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm"
            )}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Name and Badges */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-medium text-gray-900",
              compact ? "text-sm" : "text-sm",
              isLongName && "truncate"
            )}
            title={isLongName ? name : undefined}
          >
            {displayName}
          </span>
          {isRecommended && (
            <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 rounded">
              Best
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Trust score badge with color coding
 */
function TrustScoreBadge({
  score,
  band,
  compact,
}: {
  score: number;
  band: string;
  compact?: boolean;
}) {
  const getBandStyles = () => {
    switch (band) {
      case 'high_trust':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'medium_trust':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'review_sensitive':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low_trust':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };
  
  return (
    <div className="flex flex-col items-center">
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border",
          getBandStyles()
        )}
      >
        {Math.round(score * 100)}%
      </span>
      {!compact && (
        <span className="text-[10px] text-gray-400 mt-0.5 capitalize">
          {band.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  );
}

/**
 * Reliability badge showing supplier reliability
 */
function ReliabilityBadge({
  score,
  band,
  compact,
}: {
  score: number;
  band: string;
  compact?: boolean;
}) {
  const getBandStyles = () => {
    switch (band) {
      case 'trusted':
        return 'text-green-600';
      case 'stable':
        return 'text-blue-600';
      case 'watch':
        return 'text-amber-600';
      case 'risky':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };
  
  return (
    <div className="flex flex-col items-center">
      <span className={cn("text-sm font-medium", getBandStyles())}>
        {Math.round(score * 100)}%
      </span>
      {!compact && (
        <span className="text-[10px] text-gray-400 mt-0.5 capitalize">
          {band}
        </span>
      )}
    </div>
  );
}

/**
 * Freshness indicator with visual icon
 */
function FreshnessIndicator({
  score,
  status,
  daysSinceUpdate,
  compact,
}: {
  score: number;
  status: 'fresh' | 'recent' | 'stale' | 'very_stale';
  daysSinceUpdate: number;
  compact?: boolean;
}) {
  const getStatusConfig = () => {
    switch (status) {
      case 'fresh':
        return { icon: '●', color: 'text-green-500', label: 'Fresh' };
      case 'recent':
        return { icon: '◐', color: 'text-blue-500', label: 'Recent' };
      case 'stale':
        return { icon: '○', color: 'text-amber-500', label: 'Stale' };
      case 'very_stale':
        return { icon: '○', color: 'text-red-500', label: 'Very Stale' };
      default:
        return { icon: '○', color: 'text-gray-400', label: 'Unknown' };
    }
  };
  
  const config = getStatusConfig();
  
  return (
    <div className="flex flex-col items-center">
      <span
        className={cn("text-lg", config.color)}
        title={`${config.label} - ${daysSinceUpdate} days ago`}
      >
        {config.icon}
      </span>
      {!compact && (
        <span className="text-[10px] text-gray-400 mt-0.5">
          {daysSinceUpdate}d ago
        </span>
      )}
    </div>
  );
}

/**
 * Get initials from supplier name (max 2 chars)
 */
function getSupplierInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Truncate supplier name with ellipsis
 */
function truncateSupplierName(name: string, maxLength: number): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 1) + '…';
}

/**
 * Compact offer comparison card for mobile/sidebar
 */
export function OfferComparisonCard({
  offer,
  onClick,
  isSelected,
  className,
}: {
  offer: OfferForComparison;
  onClick?: () => void;
  isSelected?: boolean;
  className?: string;
}) {
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border transition-colors",
        onClick && "cursor-pointer",
        isSelected
          ? "bg-blue-50 border-blue-200"
          : offer.is_recommended
          ? "bg-green-50 border-green-200 hover:bg-green-100"
          : "bg-white border-gray-200 hover:bg-gray-50",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Supplier Info */}
        <div className="flex items-center gap-2 min-w-0">
          <SupplierLogo
            name={offer.supplier_name}
            logoUrl={offer.supplier_logo_url}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-gray-900 truncate">
                {offer.supplier_name}
              </span>
              {offer.is_recommended && (
                <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-semibold bg-green-600 text-white rounded">
                  #1
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <TrustScoreBadge score={offer.trust_score} band={offer.trust_band} compact />
              <span className="text-xs text-gray-400">•</span>
              <span className={cn(
                "text-xs",
                offer.freshness_status === 'fresh' || offer.freshness_status === 'recent'
                  ? 'text-green-600'
                  : 'text-amber-600'
              )}>
                {offer.freshness_status === 'fresh' ? 'Fresh' : 
                 offer.freshness_status === 'recent' ? 'Recent' : 
                 offer.freshness_status === 'stale' ? 'Stale' : 'Very Stale'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Price */}
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-gray-900">
            {formatPrice(offer.price)}
          </div>
          {offer.units_per_case && (
            <div className="text-xs text-gray-500">
              {offer.units_per_case} ct
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Standalone supplier logo component
 */
export function SupplierLogo({
  name,
  logoUrl,
  size = 'md',
  className,
}: {
  name: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const initials = getSupplierInitials(name);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };
  
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={cn(
          "rounded-full object-cover bg-gray-100",
          sizeClasses[size],
          className
        )}
      />
    );
  }
  
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-semibold",
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  );
}

/**
 * Market summary header showing price range and supplier count
 */
export function MarketSummaryHeader({
  offerCount,
  supplierCount,
  priceMin,
  priceMax,
  trustedBestPrice,
  trustedBestSupplier,
  className,
}: {
  offerCount: number;
  supplierCount: number;
  priceMin: number;
  priceMax: number;
  trustedBestPrice?: number;
  trustedBestSupplier?: string;
  className?: string;
}) {
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  
  return (
    <div className={cn(
      "flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200",
      className
    )}>
      <div className="flex items-center gap-6">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Offers</div>
          <div className="text-lg font-semibold text-gray-900">{offerCount}</div>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Suppliers</div>
          <div className="text-lg font-semibold text-gray-900">{supplierCount}</div>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Price Range</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatPrice(priceMin)} – {formatPrice(priceMax)}
          </div>
        </div>
      </div>
      
      {trustedBestPrice && (
        <div className="text-right">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Best Trusted</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-green-600">
              {formatPrice(trustedBestPrice)}
            </span>
            {trustedBestSupplier && (
              <span className="text-sm text-gray-500">
                from {trustedBestSupplier}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
