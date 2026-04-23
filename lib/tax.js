/**
 * Tax Calculation for GLOVECUBS
 * 
 * MVP Implementation: Nexus-based tax calculation
 * Tax is only collected when shipping to the business nexus state.
 * 
 * Configuration via environment variables:
 *   BUSINESS_STATE - 2-letter state code where business has nexus (e.g., "CA")
 *   BUSINESS_TAX_RATE - Tax rate as decimal (e.g., "0.0825" for 8.25%)
 * 
 * ============================================================================
 * UPGRADE PATH: Third-Party Tax Services
 * ============================================================================
 * 
 * To integrate Avalara AvaTax or TaxJar:
 * 
 * 1. Install SDK:
 *    npm install avatax  // for Avalara
 *    npm install taxjar  // for TaxJar
 * 
 * 2. Replace calculateTax() with API call:
 * 
 *    // Avalara Example:
 *    const Avatax = require('avatax');
 *    const client = new Avatax({ appName: 'GLOVECUBS', ... });
 *    async function calculateTax(params) {
 *      const transaction = await client.createTransaction({
 *        type: 'SalesOrder',
 *        customerCode: params.customerId,
 *        date: new Date(),
 *        lines: params.items.map(item => ({
 *          amount: item.price * item.quantity,
 *          taxCode: 'P0000000'  // General tangible personal property
 *        })),
 *        addresses: {
 *          shipTo: {
 *            line1: params.shippingAddress.address_line1,
 *            city: params.shippingAddress.city,
 *            region: params.shippingAddress.state,
 *            postalCode: params.shippingAddress.zip_code,
 *            country: 'US'
 *          }
 *        }
 *      });
 *      return { tax: transaction.totalTax, details: transaction };
 *    }
 * 
 *    // TaxJar Example:
 *    const Taxjar = require('taxjar');
 *    const client = new Taxjar({ apiKey: process.env.TAXJAR_API_KEY });
 *    async function calculateTax(params) {
 *      const tax = await client.taxForOrder({
 *        to_country: 'US',
 *        to_state: params.shippingAddress.state,
 *        to_zip: params.shippingAddress.zip_code,
 *        amount: params.subtotal,
 *        shipping: params.shipping
 *      });
 *      return { tax: tax.amount_to_collect, details: tax };
 *    }
 * 
 * 3. Update environment variables:
 *    AVATAX_ACCOUNT_ID, AVATAX_LICENSE_KEY, AVATAX_ENVIRONMENT
 *    or
 *    TAXJAR_API_KEY
 * 
 * 4. Consider caching tax rates for performance
 * 
 * ============================================================================
 */

const { normalizeState } = require('./address-validation');

// Configuration from environment
const BUSINESS_STATE = (process.env.BUSINESS_STATE || '').toUpperCase().trim();
const BUSINESS_TAX_RATE = parseFloat(process.env.BUSINESS_TAX_RATE || '0');

/**
 * Check if tax configuration is properly set up.
 */
function isConfigured() {
  return BUSINESS_STATE.length === 2 && !isNaN(BUSINESS_TAX_RATE) && BUSINESS_TAX_RATE >= 0;
}

/**
 * Get current tax configuration (for debugging/admin display).
 */
function getConfig() {
  return {
    businessState: BUSINESS_STATE || null,
    taxRate: BUSINESS_TAX_RATE,
    configured: isConfigured()
  };
}

/**
 * Normalize a state value for comparison.
 * Returns uppercase 2-letter abbreviation or null if invalid.
 */
function normalizeStateForTax(state) {
  if (!state) return null;
  const result = normalizeState(state);
  return result.valid ? result.value : null;
}

/**
 * Determine if an order is taxable based on shipping destination.
 * 
 * @param {string} shippingState - State code or name where order is being shipped
 * @returns {object} { taxable: boolean, reason: string }
 */
function isTaxable(shippingState) {
  if (!isConfigured()) {
    return { 
      taxable: false, 
      reason: 'Tax not configured (BUSINESS_STATE or BUSINESS_TAX_RATE missing)' 
    };
  }
  
  const normalized = normalizeStateForTax(shippingState);
  
  if (!normalized) {
    return { 
      taxable: false, 
      reason: 'Invalid or missing shipping state' 
    };
  }
  
  if (normalized === BUSINESS_STATE) {
    return { 
      taxable: true, 
      reason: `Shipping to nexus state (${BUSINESS_STATE})` 
    };
  }
  
  return { 
    taxable: false, 
    reason: `Out-of-state shipment (${normalized} is not nexus state ${BUSINESS_STATE})` 
  };
}

/**
 * Calculate tax for an order.
 * 
 * @param {object} params
 * @param {number} params.subtotal - Product subtotal (before shipping)
 * @param {string} params.shippingState - Destination state code or name
 * @param {number} [params.shipping=0] - Shipping cost (not taxed by default)
 * @param {boolean} [params.taxShipping=false] - Whether to include shipping in taxable amount
 * @returns {object} { tax: number, rate: number, taxable: boolean, reason: string, taxableAmount: number }
 */
function calculateTax(params) {
  const { subtotal = 0, shippingState, shipping = 0, taxShipping = false } = params;
  
  const taxability = isTaxable(shippingState);
  
  if (!taxability.taxable) {
    return {
      tax: 0,
      rate: 0,
      taxable: false,
      reason: taxability.reason,
      taxableAmount: 0
    };
  }
  
  // Calculate taxable amount (subtotal only, unless taxShipping is true)
  const taxableAmount = taxShipping ? (subtotal + shipping) : subtotal;
  const tax = Math.round(taxableAmount * BUSINESS_TAX_RATE * 100) / 100;
  
  return {
    tax,
    rate: BUSINESS_TAX_RATE,
    taxable: true,
    reason: taxability.reason,
    taxableAmount
  };
}

/**
 * Calculate tax from a normalized shipping address object.
 * Convenience wrapper for calculateTax.
 * 
 * @param {object} shippingAddress - Normalized address from address-validation
 * @param {number} subtotal - Product subtotal
 * @param {number} [shipping=0] - Shipping cost
 * @returns {object} Tax calculation result
 */
function calculateTaxForAddress(shippingAddress, subtotal, shipping = 0) {
  const state = shippingAddress?.state || null;
  return calculateTax({ subtotal, shippingState: state, shipping });
}

/**
 * Format tax rate as percentage string for display.
 * 
 * @param {number} rate - Tax rate as decimal (e.g., 0.0825)
 * @returns {string} Formatted rate (e.g., "8.25%")
 */
function formatTaxRate(rate) {
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/**
 * Get a human-readable tax summary for display.
 * 
 * @param {object} taxResult - Result from calculateTax
 * @returns {string} Human-readable summary
 */
function getTaxSummary(taxResult) {
  if (!taxResult.taxable) {
    return 'No tax (out-of-state)';
  }
  return `Tax (${formatTaxRate(taxResult.rate)})`;
}

module.exports = {
  isConfigured,
  getConfig,
  isTaxable,
  calculateTax,
  calculateTaxForAddress,
  formatTaxRate,
  getTaxSummary,
  BUSINESS_STATE,
  BUSINESS_TAX_RATE
};
