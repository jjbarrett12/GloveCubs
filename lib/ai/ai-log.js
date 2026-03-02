/**
 * Log AI usage to DB (summaries only; no full raw invoice text by default).
 */

const crypto = require('crypto');

function hashIp(ip) {
    if (!ip || typeof ip !== 'string') return null;
    return crypto.createHash('sha256').update(ip.trim()).digest('hex').slice(0, 32);
}

async function logConversation(supabase, payload) {
    if (!supabase) return;
    const { user_id = null, ip_hash = null, kind = 'glove_finder', request_summary = null, response_summary = null, meta = null } = payload;
    try {
        await supabase.from('ai_conversations').insert({
            user_id,
            ip_hash,
            kind,
            request_summary: request_summary ? String(request_summary).slice(0, 2000) : null,
            response_summary: response_summary ? String(response_summary).slice(0, 2000) : null,
            meta: meta && typeof meta === 'object' ? meta : null,
        });
    } catch (err) {
        console.error('[ai-log] conversation insert failed:', err.message);
    }
}

async function logInvoiceUpload(supabase, payload) {
    if (!supabase) return null;
    const { user_id = null, ip_hash = null, file_name = null, vendor_name = null, invoice_number = null, total_amount = null, line_count = null, extract_summary = null } = payload;
    try {
        const { data, error } = await supabase.from('invoice_uploads').insert({
            user_id,
            ip_hash,
            file_name: file_name ? String(file_name).slice(0, 500) : null,
            vendor_name: vendor_name ? String(vendor_name).slice(0, 255) : null,
            invoice_number: invoice_number ? String(invoice_number).slice(0, 100) : null,
            total_amount: total_amount != null ? Number(total_amount) : null,
            line_count: line_count != null ? Number(line_count) : null,
            extract_summary: extract_summary ? String(extract_summary).slice(0, 2000) : null,
        }).select('id').single();
        if (error) throw error;
        return data && data.id ? data.id : null;
    } catch (err) {
        console.error('[ai-log] invoice_uploads insert failed:', err.message);
        return null;
    }
}

async function logInvoiceLines(supabase, uploadId, lines) {
    if (!supabase || !uploadId || !Array.isArray(lines) || lines.length === 0) return;
    try {
        const rows = lines.slice(0, 500).map((l, i) => ({
            upload_id: uploadId,
            line_index: i,
            description: (l.description || '').slice(0, 1000),
            quantity: Number(l.quantity) || 0,
            unit_price: l.unit_price != null ? Number(l.unit_price) : null,
            total: l.total != null ? Number(l.total) : null,
            sku_or_code: (l.sku_or_code || '').slice(0, 100) || null,
        }));
        await supabase.from('invoice_lines').insert(rows);
    } catch (err) {
        console.error('[ai-log] invoice_lines insert failed:', err.message);
    }
}

async function logRecommendations(supabase, payload) {
    if (!supabase) return;
    const { upload_id = null, conversation_id = null, recommendations = [] } = payload;
    if (!recommendations.length) return;
    try {
        const rows = recommendations.slice(0, 200).map((r) => ({
            upload_id,
            conversation_id,
            line_index: r.line_index != null ? r.line_index : null,
            current_product: (r.current_product || '').slice(0, 500) || null,
            recommended_sku: (r.recommended_sku || '').slice(0, 100) || null,
            recommended_name: (r.recommended_name || '').slice(0, 500),
            brand: (r.brand || '').slice(0, 255) || null,
            estimated_savings: r.estimated_savings != null ? Number(r.estimated_savings) : null,
            reason: (r.reason || '').slice(0, 1000) || null,
        }));
        await supabase.from('recommendations').insert(rows);
    } catch (err) {
        console.error('[ai-log] recommendations insert failed:', err.message);
    }
}

module.exports = { hashIp, logConversation, logInvoiceUpload, logInvoiceLines, logRecommendations };
