"use client";

/**
 * Product Offers Client Component
 * 
 * Fetches and displays supplier offers for a product with full identity visibility.
 */

import { useEffect, useState, useCallback } from "react";
import {
  OfferComparisonTable,
  OfferComparisonCard,
  MarketSummaryHeader,
  type OfferForComparison,
} from "@/components/products";

interface OffersResponse {
  product_id: string;
  product_name: string;
  offers: OfferForComparison[];
  market_summary: {
    offer_count: number;
    supplier_count: number;
    price_min: number;
    price_max: number;
    price_avg: number;
    trusted_best_price?: number;
    trusted_best_supplier?: string;
  };
}

interface ProductOffersClientProps {
  productId: string;
}

export function ProductOffersClient({ productId }: ProductOffersClientProps) {
  const [data, setData] = useState<OffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/products/${productId}/offers`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch offers');
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [productId]);
  
  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);
  
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          <span className="text-gray-500">Loading offers...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={fetchOffers}
          className="mt-3 px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }
  
  if (!data || data.offers.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="text-gray-400 text-4xl mb-3">📦</div>
        <p className="text-gray-600 font-medium">No offers available</p>
        <p className="text-gray-500 text-sm mt-1">
          Check back later for supplier offers on this product
        </p>
      </div>
    );
  }
  
  const { offers, market_summary } = data;
  
  const handleSelectOffer = (offer: OfferForComparison) => {
    setSelectedOfferId(selectedOfferId === offer.offer_id ? null : offer.offer_id);
  };
  
  return (
    <div className="space-y-4">
      {/* Market Summary */}
      <MarketSummaryHeader
        offerCount={market_summary.offer_count}
        supplierCount={market_summary.supplier_count}
        priceMin={market_summary.price_min}
        priceMax={market_summary.price_max}
        trustedBestPrice={market_summary.trusted_best_price}
        trustedBestSupplier={market_summary.trusted_best_supplier}
      />
      
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {offers.length} offer{offers.length !== 1 ? 's' : ''} from{' '}
          {market_summary.supplier_count} supplier{market_summary.supplier_count !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'cards'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Cards
          </button>
        </div>
      </div>
      
      {/* Offers Display */}
      {viewMode === 'table' ? (
        <OfferComparisonTable
          offers={offers}
          onSelectOffer={handleSelectOffer}
          selectedOfferId={selectedOfferId || undefined}
          showRanking={true}
          showLeadTime={true}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {offers.map((offer) => (
            <OfferComparisonCard
              key={offer.offer_id}
              offer={offer}
              onClick={() => handleSelectOffer(offer)}
              isSelected={selectedOfferId === offer.offer_id}
            />
          ))}
        </div>
      )}
      
      {/* Selected Offer Details */}
      {selectedOfferId && (
        <SelectedOfferDetails
          offer={offers.find((o) => o.offer_id === selectedOfferId)!}
          onClose={() => setSelectedOfferId(null)}
        />
      )}
    </div>
  );
}

function SelectedOfferDetails({
  offer,
  onClose,
}: {
  offer: OfferForComparison;
  onClose: () => void;
}) {
  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
  
  return (
    <div className="bg-white rounded-lg border border-blue-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <SupplierAvatar
            name={offer.supplier_name}
            logoUrl={offer.supplier_logo_url}
          />
          <div>
            <h3 className="font-semibold text-gray-900">{offer.supplier_name}</h3>
            <p className="text-sm text-gray-500">Offer Details</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DetailItem label="Price" value={formatPrice(offer.price)} highlight />
        <DetailItem
          label="Trust Score"
          value={formatPercent(offer.trust_score)}
          subtext={offer.trust_band.replace(/_/g, ' ')}
        />
        <DetailItem
          label="Reliability"
          value={formatPercent(offer.supplier_reliability_score)}
          subtext={offer.supplier_reliability_band}
        />
        <DetailItem
          label="Freshness"
          value={offer.freshness_status.replace(/_/g, ' ')}
          subtext={`${offer.days_since_update} days ago`}
        />
        {offer.units_per_case && (
          <DetailItem label="Pack Size" value={`${offer.units_per_case} ct`} />
        )}
        {offer.lead_time_days && (
          <DetailItem label="Lead Time" value={`${offer.lead_time_days} days`} />
        )}
        {offer.price_per_unit && (
          <DetailItem label="Per Unit" value={`$${offer.price_per_unit.toFixed(4)}`} />
        )}
        {offer.recommendation_rank && (
          <DetailItem
            label="Ranking"
            value={`#${offer.recommendation_rank}`}
            highlight={offer.recommendation_rank === 1}
          />
        )}
      </div>
      
      {offer.is_recommended && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-green-600 text-lg">✓</span>
          <span className="text-sm font-medium text-green-800">
            Recommended Supplier
          </span>
          <span className="text-sm text-green-600 ml-auto">
            Best trust-adjusted value
          </span>
        </div>
      )}
    </div>
  );
}

function DetailItem({
  label,
  value,
  subtext,
  highlight,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-gray-400 capitalize">{subtext}</div>
      )}
    </div>
  );
}

function SupplierAvatar({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
    
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="w-12 h-12 rounded-full object-cover bg-gray-100"
      />
    );
  }
  
  return (
    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center justify-center">
      {initials}
    </div>
  );
}
