/**
 * V2 catalog write boundary — re-exports the catalog implementation (catalogos schema only).
 * Prefer `require('./catalogService')` over reaching into catalogos tables from other modules.
 */
module.exports = require('./catalogosProductService');
