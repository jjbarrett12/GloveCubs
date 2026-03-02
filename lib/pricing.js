/**
 * Customer pricing helpers: effective margin and sell price.
 * sell = cost / (1 - margin/100). Validation: 0 <= margin < 100.
 * Uses manufacturer_id only (no brand string matching).
 * Priority: manufacturer override > customer default > 0.
 */

/**
 * Get effective margin % for a company and optional manufacturer.
 * @param {object} db - Full DB (companies, customer_manufacturer_pricing)
 * @param {number} companyId - Company id
 * @param {number} [manufacturerId] - Manufacturer id (from product.manufacturer_id); used for override lookup only
 * @returns {number} Margin percent (0–99.99)
 */
function getEffectiveMargin(db, companyId, manufacturerId) {
    if (!db || companyId == null) return 0;
    const companies = db.companies || [];
    const overrides = db.customer_manufacturer_pricing || [];
    const company = companies.find((c) => c.id === Number(companyId));
    const defaultPercent = company && company.default_gross_margin_percent != null
        ? Number(company.default_gross_margin_percent)
        : 30;
    if (manufacturerId != null) {
        const override = overrides.find(
            (o) => o.company_id === Number(companyId) && o.manufacturer_id === Number(manufacturerId)
        );
        const margin = override && (override.gross_margin_percent != null || override.margin_percent != null)
            ? Number(override.gross_margin_percent != null ? override.gross_margin_percent : override.margin_percent)
            : null;
        if (margin != null && margin >= 0 && margin < 100) return margin;
    }
    const p = defaultPercent;
    return p >= 0 && p < 100 ? p : 0;
}

/**
 * Compute sell price from cost and margin %.
 * sell = cost / (1 - margin/100). Valid only for 0 <= margin < 100.
 * @param {number} cost - Unit cost
 * @param {number} marginPercent - Gross margin percent (0–99.99)
 * @returns {number} Sell price, or NaN if invalid
 */
function computeSellPrice(cost, marginPercent) {
    const c = Number(cost);
    const m = Number(marginPercent);
    if (m < 0 || m >= 100) return NaN;
    if (c <= 0) return c;
    return c / (1 - m / 100);
}

module.exports = { getEffectiveMargin, computeSellPrice };
