"use client";

/**
 * Products Table Client Component
 * 
 * Interactive table with filtering and links to intelligence view
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  TableCard,
  TableToolbar,
  EmptyState,
  StatusBadge,
} from "@/components/admin";

interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  category?: string;
  price?: number;
  offer_count: number;
  has_margin_opportunity: boolean;
  has_alerts: boolean;
  best_trust_band?: string;
}

interface Props {
  products: ProductListItem[];
  categories: string[];
  currentFilters: {
    category?: string;
    hasAlerts?: string;
    hasOpportunity?: string;
  };
}

export function ProductsTableClient({ products, categories, currentFilters }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filteredProducts = products.filter((p) =>
    search
      ? p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
      : true
  );

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams();
    
    if (currentFilters.category && key !== "category") {
      params.set("category", currentFilters.category);
    }
    if (currentFilters.hasAlerts && key !== "hasAlerts") {
      params.set("hasAlerts", currentFilters.hasAlerts);
    }
    if (currentFilters.hasOpportunity && key !== "hasOpportunity") {
      params.set("hasOpportunity", currentFilters.hasOpportunity);
    }
    
    if (value) {
      params.set(key, value);
    }
    
    const queryString = params.toString();
    router.push(`/admin/products${queryString ? `?${queryString}` : ""}`);
  };

  const getTrustBadge = (band?: string) => {
    if (!band) return null;
    
    const colors: Record<string, string> = {
      high_trust: "bg-green-100 text-green-700",
      medium_trust: "bg-blue-100 text-blue-700",
      review_sensitive: "bg-amber-100 text-amber-700",
      low_trust: "bg-red-100 text-red-700",
    };
    
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[band] || "bg-gray-100 text-gray-600"}`}>
        {band.replace(/_/g, " ")}
      </span>
    );
  };

  return (
    <TableCard>
      <TableToolbar>
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />

          <select
            value={currentFilters.category || ""}
            onChange={(e) => updateFilter("category", e.target.value || null)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={currentFilters.hasAlerts === "true"}
              onChange={(e) => updateFilter("hasAlerts", e.target.checked ? "true" : null)}
              className="rounded border-gray-300"
            />
            Has Alerts
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={currentFilters.hasOpportunity === "true"}
              onChange={(e) => updateFilter("hasOpportunity", e.target.checked ? "true" : null)}
              className="rounded border-gray-300"
            />
            Has Opportunity
          </label>
        </div>

        <div className="text-sm text-gray-500">
          {filteredProducts.length} products
        </div>
      </TableToolbar>

      {filteredProducts.length === 0 ? (
        <EmptyState
          title="No products found"
          description="Try adjusting your filters"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Product
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Price
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Offers
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Best Trust
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <Link
                        href={`/admin/products/${product.id}/intelligence`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600"
                      >
                        {product.name}
                      </Link>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span className="font-mono">{product.sku}</span>
                        {product.brand && <span>• {product.brand}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {product.category || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {product.price ? (
                      <span className="text-sm font-medium text-gray-900">
                        ${product.price.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-medium text-gray-900">
                      {product.offer_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getTrustBadge(product.best_trust_band)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {product.has_margin_opportunity && (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 text-xs"
                          title="Margin Opportunity"
                        >
                          $
                        </span>
                      )}
                      {product.has_alerts && (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-xs"
                          title="Has Alerts"
                        >
                          !
                        </span>
                      )}
                      {!product.has_margin_opportunity && !product.has_alerts && (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/products/${product.id}/intelligence`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      Intelligence →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  );
}
