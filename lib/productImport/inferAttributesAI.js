/**
 * AI attribute inference for product import. Uses OpenAI with strict controlled vocabulary.
 * Only run if OPENAI_API_KEY exists. Validates all values against taxonomy; falls back to heuristics on invalid JSON.
 */

const { Taxonomy, coerceOne, coerceMany } = require('../products/taxonomy');

const DEFAULT_MODEL = 'gpt-4o-mini';

function getModel() {
  return process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;
}

function isConfigured() {
  return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

const ATTRIBUTES_SCHEMA = `
attributes: object with ONLY these keys, values ONLY from allowed lists below:
- category: one of ${Taxonomy.category.join(', ')}
- material: array of one or more of ${Taxonomy.material.join(', ')}
- size: array of one or more of ${Taxonomy.size.join(', ')}
- color: array of one or more of ${Taxonomy.color.join(', ')}
- thickness_mil: array of one or more of ${Taxonomy.thickness_mil.join(', ')}
- powder: one of ${Taxonomy.powder.join(', ')} or null
- grade: one of ${Taxonomy.grade.join(', ')} or null
- industries: array of one or more of ${Taxonomy.industries.join(', ')} (select ALL plausible industries)
- compliance: array of one or more of ${Taxonomy.compliance.join(', ')}
- cut_level_ansi: one of ${Taxonomy.cut_level_ansi.join(', ')} or null
- puncture_level: one of ${Taxonomy.puncture_level.join(', ')} or null
- abrasion_level: one of ${Taxonomy.abrasion_level.join(', ')} or null
- flame_resistant: boolean or null
- arc_rating: array of one or more of ${Taxonomy.arc_rating.join(', ')} or null
- warm_cold: array of one or more of ${Taxonomy.warm_cold.join(', ')}
- texture: array of one or more of ${Taxonomy.texture.join(', ')}
- cuff_style: array of one or more of ${Taxonomy.cuff_style.join(', ')}
- hand_orientation: one of ${Taxonomy.hand_orientation.join(', ')} or null
- packaging: array of one or more of ${Taxonomy.packaging.join(', ')}
- sterility: one of ${Taxonomy.sterility.join(', ')} or null

confidence: object with same keys as attributes, each value 0-1 number.
warnings: array of strings (e.g. "No SKU found", "Material uncertain").`;

/**
 * Validate and coerce AI response to taxonomy. Strip invalid values.
 */
function validateAndCoerce(attrs) {
  if (!attrs || typeof attrs !== 'object') return {};
  const out = {};
  const multiKeys = ['material', 'size', 'color', 'thickness_mil', 'industries', 'compliance', 'arc_rating', 'warm_cold', 'texture', 'cuff_style', 'packaging'];
  const singleKeys = ['category', 'powder', 'grade', 'cut_level_ansi', 'puncture_level', 'abrasion_level', 'hand_orientation', 'sterility'];
  for (const k of multiKeys) {
    if (Taxonomy[k] && attrs[k] != null) {
      const arr = Array.isArray(attrs[k]) ? attrs[k] : [attrs[k]];
      const coerced = coerceMany(k, arr);
      if (coerced.length) out[k] = coerced;
    }
  }
  for (const k of singleKeys) {
    if (Taxonomy[k] && attrs[k] != null) {
      const v = coerceOne(k, attrs[k]);
      if (v) out[k] = v;
    }
  }
  if (typeof attrs.flame_resistant === 'boolean') out.flame_resistant = attrs.flame_resistant;
  return out;
}

/**
 * Infer attributes using OpenAI. Returns { attributes, confidence, warnings } or null on failure.
 */
async function inferAttributesAI(input) {
  const apiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
  if (!apiKey) return null;

  const name = (input.name || '').toString();
  const description = (input.description || '').toString().slice(0, 6000);
  const specText = (input.specText || '').toString().slice(0, 4000);
  const bullets = Array.isArray(input.bullets) ? input.bullets.slice(0, 30) : [];
  const bulletsStr = bullets.length ? bullets.join('\n') : '';

  const systemPrompt = `You are a product attribute classifier for work gloves and PPE. Output ONLY valid JSON with no markdown.
You must use ONLY the allowed values from the schema. Do not invent values.
For "industries", select ALL plausible industries (e.g. healthcare + janitorial if it's an exam glove used in both).
If uncertain, omit the key or use null; add a short warning to the "warnings" array.
Output format: { "attributes": { ... }, "confidence": { "category": 0.9, ... }, "warnings": [] }`;

  const userPrompt = `Product name: ${name}

Description (excerpt): ${description}

Spec text: ${specText}

Bullets:
${bulletsStr}

${ATTRIBUTES_SCHEMA}

Return a single JSON object with keys: attributes, confidence, warnings.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!content.trim()) return null;
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const attributes = validateAndCoerce(parsed.attributes || {});
    const confidence = (parsed.confidence && typeof parsed.confidence === 'object') ? parsed.confidence : {};
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === 'string') : [];
    return { attributes, confidence, warnings };
  } catch (e) {
    return null;
  }
}

/**
 * Merge heuristic attributes with AI result. Prefer AI when confidence >= 0.6 for that field; else keep heuristic.
 */
function mergeAttributes(heuristicAttrs, aiResult) {
  if (!aiResult || !aiResult.attributes) return heuristicAttrs;
  const out = { ...heuristicAttrs };
  const conf = aiResult.confidence || {};
  for (const [key, value] of Object.entries(aiResult.attributes)) {
    const c = conf[key];
    if (value != null && value !== '' && (c == null || c >= 0.6)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Merge warnings (heuristic + AI), dedupe.
 */
function mergeWarnings(heuristicWarnings, aiWarnings) {
  const set = new Set(heuristicWarnings || []);
  for (const w of aiWarnings || []) {
    if (typeof w === 'string' && w.trim()) set.add(w.trim());
  }
  return Array.from(set);
}

module.exports = { inferAttributesAI, mergeAttributes, mergeWarnings, validateAndCoerce, isConfigured };
