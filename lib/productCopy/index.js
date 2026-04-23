/**
 * Product Copy Generation — GLOVECUBS
 * 
 * Generates SEO-optimized ecommerce content for B2B glove products.
 * 
 * @example
 * // Heuristic generation (no API needed)
 * const { generateAllContent } = require('./lib/productCopy');
 * const content = generateAllContent(product);
 * 
 * // AI generation (requires OPENAI_API_KEY)
 * const { generateWithAI } = require('./lib/productCopy');
 * const aiContent = await generateWithAI(product, 'full_content');
 */

const contentGenerator = require('./contentGenerator');
const promptTemplates = require('./promptTemplates');
const gloveDescriptions = require('./gloveDescriptions');

module.exports = {
  ...contentGenerator,
  ...promptTemplates,
  
  generateProductCopy: gloveDescriptions.generateProductCopy,
  
  contentGenerator,
  promptTemplates,
  gloveDescriptions,
};
