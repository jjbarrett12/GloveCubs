/**
 * Bulk Import: enqueue URLs, worker (parse + normalize -> drafts), approve draft -> products.
 * Requires Supabase (import_jobs, import_job_items, products_drafts).
 */

const parseProductUrl = require('./parse-product-url').parseProductUrl;
const productsService = require('../services/productsService');
const aiNormalizeProduct = require('./ai-normalize-product').aiNormalizeProduct;
const normalizeFromExtracted = require('./ai-normalize-product').normalizeFromExtracted;
const aiNormalizeConfigured = require('./ai-normalize-product').isConfigured;
const { normalizeProduct } = require('./productImport/normalizeProduct');
const { inferAttributesAI, mergeAttributes, mergeWarnings, isConfigured: inferAiConfigured } = require('./productImport/inferAttributesAI');

const MAX_ATTEMPTS = 3;

/**
 * Enqueue URLs: create import_job and import_job_items (status queued).
 * @returns {{ job_id: number, total_count: number }}
 */
async function enqueueBulkUrls(supabase, urls) {
    const list = Array.isArray(urls) ? urls.map((u) => String(u).trim()).filter((u) => u.startsWith('http://') || u.startsWith('https://')) : [];
    if (list.length === 0) {
        throw new Error('At least one valid URL (http/https) is required');
    }
    const { data: job, error: jobErr } = await supabase
        .from('import_jobs')
        .insert({ total_count: list.length })
        .select('id')
        .single();
    if (jobErr || !job) throw new Error(jobErr?.message || 'Failed to create import job');
    const jobId = job.id;
    const items = list.map((source_url) => ({
        job_id: jobId,
        source_url,
        status: 'queued',
        attempt_count: 0,
        max_attempts: MAX_ATTEMPTS,
    }));
    const { error: itemsErr } = await supabase.from('import_job_items').insert(items);
    if (itemsErr) throw new Error(itemsErr.message || 'Failed to create import job items');
    return { job_id: jobId, total_count: list.length };
}

/**
 * Process one item: parse URL, normalize, upsert products_drafts, set extracted_json + normalized_json.
 * Returns { success: boolean, error_message?: string }.
 */
async function processOneItem(supabase, item) {
    const url = item.source_url;
    let extracted = null;
    let normalized = null;
    try {
        const payload = await parseProductUrl(url);
        if (payload.kind === 'asset') {
            const hints = payload.hints || {};
            const image_urls = hints.image_urls || hints.images || (payload.asset && payload.asset.finalUrl ? [payload.asset.finalUrl] : [url]);
            extracted = {
                kind: 'asset',
                meta: {},
                jsonld: [],
                text: '',
                image_urls,
            };
        } else if (payload.kind === 'page' && payload.extracted) {
            extracted = {
                jsonld: payload.extracted.jsonld || [],
                meta: payload.extracted.meta || { title: '', image: '', description: '' },
                text: payload.extracted.text || '',
                image_urls: payload.extracted.image_urls || [],
                specText: payload.extracted.specText || '',
                bullets: Array.isArray(payload.extracted.bullets) ? payload.extracted.bullets : [],
                productDetails: payload.extracted.productDetails || {},
            };
            if (payload.extracted.sku) extracted.sku = payload.extracted.sku;
            if (payload.extracted.skuGuess) extracted.skuGuess = payload.extracted.skuGuess;
        }
        if (!extracted) throw new Error('Unsupported URL response');

        const hints = payload?.hints || {};
        let normalizedDraft;
        if (typeof aiNormalizeProduct === 'function' && aiNormalizeConfigured()) {
            normalizedDraft = await aiNormalizeProduct(extracted, { hints });
        } else {
            normalizedDraft = normalizeFromExtracted(extracted, { hints });
        }
        const specText = (extracted.specText || '').toString();
        const bullets = Array.isArray(extracted.bullets) ? extracted.bullets : [];
        const attrDraft = normalizeProduct(extracted, hints, specText, bullets);
        let attributes = attrDraft.attributes || {};
        let attribute_warnings = attrDraft.warnings || [];
        let source_confidence = {};
        if (inferAiConfigured()) {
            const aiInput = {
                name: normalizedDraft.name,
                description: normalizedDraft.description,
                specText,
                bullets,
            };
            const aiResult = await inferAttributesAI(aiInput);
            if (aiResult) {
                attributes = mergeAttributes(attributes, aiResult);
                attribute_warnings = mergeWarnings(attribute_warnings, aiResult.warnings);
                source_confidence = aiResult.confidence || {};
            }
        }
        normalizedDraft.attributes = attributes;
        normalizedDraft.attribute_warnings = attribute_warnings;
        normalizedDraft.source_confidence = source_confidence;
        normalized = normalizedDraft;

        const image_urls = Array.isArray(normalized.image_urls) ? normalized.image_urls : [];
        const primaryImage = image_urls[0] || '';
        const additionalImages = image_urls.length > 1 ? image_urls.slice(1) : [];

        const draftRow = {
            source_url: url,
            import_job_item_id: item.id,
            status: 'draft',
            sku: (normalized.sku || '').toString().trim() || null,
            name: (normalized.name || '').toString().trim() || null,
            brand: (normalized.brand || '').toString().trim() || null,
            description: (normalized.description || '').toString().trim() || null,
            image_url: (primaryImage || '').toString().trim() || null,
            images: additionalImages.length ? additionalImages : [],
            material: (normalized.material || '').toString().trim() || null,
            color: (normalized.color || '').toString().trim() || null,
            sizes: (normalized.sizes || '').toString().trim() || null,
            pack_qty: normalized.pack_qty != null ? Number(normalized.pack_qty) : null,
            case_qty: normalized.case_qty != null ? Number(normalized.case_qty) : null,
            category: (normalized.category || '').toString().trim() || null,
            subcategory: (normalized.subcategory || '').toString().trim() || null,
            thickness: (normalized.thickness || '').toString().trim() || null,
            powder: (normalized.powder || '').toString().trim() || null,
            grade: (normalized.grade || '').toString().trim() || null,
            attributes: normalized.attributes && typeof normalized.attributes === 'object' ? normalized.attributes : {},
            attribute_warnings: Array.isArray(normalized.attribute_warnings) ? normalized.attribute_warnings : [],
            source_confidence: normalized.source_confidence && typeof normalized.source_confidence === 'object' ? normalized.source_confidence : {},
            updated_at: new Date().toISOString(),
        };

        await supabase.from('products_drafts').upsert(draftRow, {
            onConflict: 'source_url',
            ignoreDuplicates: false,
        });

        await supabase
            .from('import_job_items')
            .update({
                status: 'done',
                extracted_json: extracted,
                normalized_json: normalized,
                error_message: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

        return { success: true };
    } catch (err) {
        const attemptCount = (item.attempt_count || 0) + 1;
        const nextStatus = attemptCount >= MAX_ATTEMPTS ? 'error' : 'queued';
        await supabase
            .from('import_job_items')
            .update({
                status: nextStatus,
                attempt_count: attemptCount,
                error_message: (err && err.message) || String(err),
                extracted_json: extracted || undefined,
                normalized_json: normalized || undefined,
                updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
        return { success: false, error_message: err.message || String(err) };
    }
}

/**
 * Worker: process up to `limit` queued items (status=queued, attempt_count < max_attempts).
 * @returns {{ processed: number, done: number, errors: number }}
 */
async function runWorker(supabase, limit = 20) {
    const { data: items, error: fetchErr } = await supabase
        .from('import_job_items')
        .select('*')
        .eq('status', 'queued')
        .lt('attempt_count', MAX_ATTEMPTS)
        .order('id', { ascending: true })
        .limit(limit);
    if (fetchErr || !items || items.length === 0) {
        return { processed: 0, done: 0, errors: 0 };
    }

    let done = 0;
    let errors = 0;
    for (const item of items) {
        await supabase.from('import_job_items').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', item.id);
        const result = await processOneItem(supabase, item);
        if (result.success) done++;
        else errors++;
    }
    return { processed: items.length, done, errors };
}

/**
 * Approve draft: insert/update products, set draft status approved, set import_job_items.created_product_id.
 */
async function approveDraft(supabase, draftId) {
    const { data: draft, error: draftErr } = await supabase.from('products_drafts').select('*').eq('id', draftId).single();
    if (draftErr || !draft) throw new Error('Draft not found');
    if (draft.status === 'approved') throw new Error('Draft already approved');

    const sku = (draft.sku || '').toString().trim();
    const name = (draft.name || '').toString().trim();
    if (!sku || !name) throw new Error('Draft must have sku and name to approve');

    const brand = (draft.brand || '').toString().trim();

    const productPayload = {
        sku,
        name,
        brand: brand || null,
        description: draft.description || null,
        cost: 0,
        image_url: draft.image_url || null,
        images: draft.images || [],
        material: draft.material || null,
        color: draft.color || null,
        sizes: draft.sizes || null,
        pack_qty: draft.pack_qty ?? null,
        case_qty: draft.case_qty ?? null,
        category: draft.category || null,
        subcategory: draft.subcategory || null,
        thickness: draft.thickness || null,
        powder: draft.powder || null,
        grade: draft.grade || null,
        attributes: draft.attributes && typeof draft.attributes === 'object' ? draft.attributes : {},
        attribute_warnings: Array.isArray(draft.attribute_warnings) ? draft.attribute_warnings : [],
        source_confidence: draft.source_confidence && typeof draft.source_confidence === 'object' ? draft.source_confidence : {},
    };

    const existingBySku = await productsService.getProductBySkuForWrite(sku);
    if (existingBySku && existingBySku.ambiguous) {
        throw new Error('Ambiguous SKU in catalog; resolve duplicate catalogos.products rows before approve.');
    }
    let productId;
    let action;
    if (existingBySku && existingBySku.id) {
        await productsService.updateProduct(existingBySku.id, productPayload);
        productId = existingBySku.id;
        action = 'updated';
    } else {
        const created = await productsService.createProduct(productPayload);
        productId = created && created.id;
        action = 'created';
    }

    await supabase.from('products_drafts').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', draftId);
    if (draft.import_job_item_id) {
        const patch = { updated_at: new Date().toISOString() };
        patch.created_catalog_product_id = productId;
        await supabase.from('import_job_items').update(patch).eq('id', draft.import_job_item_id);
    }
    return { product_id: productId, action };
}

module.exports = {
    enqueueBulkUrls,
    runWorker,
    approveDraft,
    MAX_ATTEMPTS,
};
