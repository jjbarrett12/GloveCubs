/**
 * Product Ingestion Pipeline — GLOVECUBS
 * 
 * AI-assisted pipeline for normalizing supplier product data into
 * consistent, search-friendly, ecommerce-ready catalog records.
 * 
 * @example
 * const { processCSV } = require('./lib/ingestion');
 * const result = await processCSV(csvContent, { enableAI: true });
 * console.log(result.products); // Normalized products
 * console.log(result.validation); // Validation results
 */

const schema = require('./schema');
const extractor = require('./extractor');
const enricher = require('./enricher');
const validator = require('./validator');
const pipeline = require('./pipeline');
const contentGenerator = require('./content-generator');

module.exports = {
  ...schema,
  ...extractor,
  ...enricher,
  ...validator,
  ...pipeline,
  ...contentGenerator,
  
  schema,
  extractor,
  enricher,
  validator,
  pipeline,
  contentGenerator,
};
