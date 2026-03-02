/**
 * Provider-agnostic AI layer. Server-side only.
 * AI_PROVIDER=openai|gemini, OPENAI_API_KEY, GEMINI_API_KEY
 */

const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();

/**
 * @typedef {Object} GloveFinderOptions
 * @property {string} [industry]
 * @property {string} [use_case]
 * @property {string} [material_preference]
 * @property {number|string} [quantity_per_month]
 * @property {string} [budget_note]
 * @property {string} [constraints]
 */

/**
 * @typedef {Object} GloveRecommendation
 * @property {string|null} [sku]
 * @property {string} name
 * @property {string|null} [brand]
 * @property {string} reason
 */

/**
 * @typedef {Object} GloveFinderResponse
 * @property {GloveRecommendation[]} recommendations
 * @property {string} [summary]
 */

/**
 * @typedef {Object} InvoiceExtractResponse
 * @property {string|null} [vendor_name]
 * @property {string|null} [invoice_number]
 * @property {string|null} [date]
 * @property {number|null} [total_amount]
 * @property {{ description: string, quantity: number, unit_price?: number, total?: number, sku_or_code?: string|null }[]} lines
 */

/**
 * @typedef {Object} InvoiceRecommendResponse
 * @property {{ line_index?: number, current_product?: string, recommended_sku?: string|null, recommended_name: string, brand?: string|null, estimated_savings?: number|null, reason: string }[]} recommendations
 * @property {number|null} [total_estimated_savings]
 * @property {string} [summary]
 */

/**
 * Generate structured JSON for glove finder (Structured Outputs / JSON schema).
 * @param {GloveFinderOptions} options
 * @returns {Promise<GloveFinderResponse>}
 */
async function aiGenerate(options) {
    if (provider === 'gemini') return geminiGloveFinder(options);
    return openaiGloveFinder(options);
}

/**
 * Extract invoice data from raw text (structured output).
 * @param {string} rawText - Invoice text (no PII stored in logs by default).
 * @returns {Promise<InvoiceExtractResponse>}
 */
async function aiExtractInvoice(rawText) {
    if (provider === 'gemini') return geminiExtractInvoice(rawText);
    return openaiExtractInvoice(rawText);
}

/**
 * Recommend product swaps for invoice lines (structured output).
 * @param {InvoiceExtractResponse} extract - Result of aiExtractInvoice
 * @param {string} [productCatalogSummary] - Optional summary of available products
 * @returns {Promise<InvoiceRecommendResponse>}
 */
async function aiRecommendFromInvoice(extract, productCatalogSummary = '') {
    if (provider === 'gemini') return geminiRecommendFromInvoice(extract, productCatalogSummary);
    return openaiRecommendFromInvoice(extract, productCatalogSummary);
}

// --- OpenAI implementation ---
function getOpenAIKey() {
    const key = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    return key;
}

const OPENAI_GLOVE_FINDER_SCHEMA = {
    type: 'object',
    properties: {
        recommendations: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    sku: { type: ['string', 'null'] },
                    name: { type: 'string' },
                    brand: { type: ['string', 'null'] },
                    reason: { type: 'string' },
                },
                required: ['name', 'reason'],
                additionalProperties: false,
            },
        },
        summary: { type: 'string' },
    },
    required: ['recommendations'],
    additionalProperties: false,
};

async function openaiGloveFinder(options) {
    const apiKey = getOpenAIKey();
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const prompt = `You are a B2B glove expert. Given the following criteria, recommend specific glove products (name, brand, reason). Use only real glove product types (e.g. nitrile exam, vinyl, reusable work gloves). Industry: ${options.industry || 'general'}. Use case: ${options.use_case || 'general'}. Material: ${options.material_preference || 'any'}. Quantity: ${options.quantity_per_month || 'N/A'}. Budget: ${options.budget_note || 'N/A'}. Constraints: ${options.constraints || 'none'}. Return JSON with "recommendations" array (each: name, brand, reason; sku optional) and "summary" string.`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_schema', json_schema: { name: 'glove_finder', strict: true, schema: OPENAI_GLOVE_FINDER_SCHEMA } },
            temperature: 0.3,
            max_tokens: 1500,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty OpenAI response');
    return JSON.parse(content);
}

const OPENAI_INVOICE_EXTRACT_SCHEMA = {
    type: 'object',
    properties: {
        vendor_name: { type: ['string', 'null'] },
        invoice_number: { type: ['string', 'null'] },
        date: { type: ['string', 'null'] },
        total_amount: { type: ['number', 'null'] },
        lines: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    description: { type: 'string' },
                    quantity: { type: 'number' },
                    unit_price: { type: 'number' },
                    total: { type: 'number' },
                    sku_or_code: { type: ['string', 'null'] },
                },
                required: ['description', 'quantity'],
                additionalProperties: false,
            },
        },
    },
    required: ['lines'],
    additionalProperties: false,
};

async function openaiExtractInvoice(rawText) {
    const apiKey = getOpenAIKey();
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const snippet = String(rawText).slice(0, 12000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: `Extract invoice data from this text. Return JSON with: vendor_name, invoice_number, date, total_amount, and "lines" array (each: description, quantity, unit_price, total, sku_or_code).\n\n${snippet}` }],
            response_format: { type: 'json_schema', json_schema: { name: 'invoice_extract', strict: true, schema: OPENAI_INVOICE_EXTRACT_SCHEMA } },
            temperature: 0.1,
            max_tokens: 2000,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty OpenAI response');
    return JSON.parse(content);
}

const OPENAI_RECOMMEND_SCHEMA = {
    type: 'object',
    properties: {
        recommendations: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    line_index: { type: 'number' },
                    current_product: { type: 'string' },
                    recommended_sku: { type: ['string', 'null'] },
                    recommended_name: { type: 'string' },
                    brand: { type: ['string', 'null'] },
                    estimated_savings: { type: ['number', 'null'] },
                    reason: { type: 'string' },
                },
                required: ['recommended_name', 'reason'],
                additionalProperties: false,
            },
        },
        total_estimated_savings: { type: ['number', 'null'] },
        summary: { type: 'string' },
    },
    required: ['recommendations'],
    additionalProperties: false,
};

async function openaiRecommendFromInvoice(extract, productCatalogSummary) {
    const apiKey = getOpenAIKey();
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const prompt = `Given this invoice extract (vendor: ${extract.vendor_name || 'N/A'}, lines: ${JSON.stringify(extract.lines || []).slice(0, 2000)}), recommend alternative glove products that could save money. ${productCatalogSummary ? `Available products summary: ${productCatalogSummary.slice(0, 1000)}` : ''} Return JSON with "recommendations" array (line_index, current_product, recommended_sku, recommended_name, brand, estimated_savings, reason), "total_estimated_savings", and "summary".`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_schema', json_schema: { name: 'invoice_recommend', strict: true, schema: OPENAI_RECOMMEND_SCHEMA } },
            temperature: 0.3,
            max_tokens: 2000,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty OpenAI response');
    return JSON.parse(content);
}

// --- Gemini stubs (switch when GEMINI_API_KEY set) ---
async function geminiGloveFinder(options) {
    throw new Error('Gemini provider not implemented. Set AI_PROVIDER=openai and OPENAI_API_KEY.');
}
async function geminiExtractInvoice(rawText) {
    throw new Error('Gemini provider not implemented. Set AI_PROVIDER=openai and OPENAI_API_KEY.');
}
async function geminiRecommendFromInvoice(extract, productCatalogSummary) {
    throw new Error('Gemini provider not implemented. Set AI_PROVIDER=openai and OPENAI_API_KEY.');
}

function isConfigured() {
    if (provider === 'gemini') return !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
    return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

module.exports = {
    aiGenerate,
    aiExtractInvoice,
    aiRecommendFromInvoice,
    isConfigured,
};
