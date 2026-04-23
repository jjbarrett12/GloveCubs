/**
 * Supplier cost CSV preview + apply: exact SKU match, audit rows, updates public.products pricing path.
 */

const productStore = require('../lib/product-store');
const {
  normalizeRules,
  validateRules,
  computeDerivedPricing
} = require('../lib/supplierCostPricing');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const productsService = require('./productsService');

function normalizeSku(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim();
}

function parseNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[$,\s]/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseIntMaybe(raw) {
  const n = parseNumber(raw);
  if (n == null) return null;
  const i = Math.round(n);
  return Number.isFinite(i) ? i : null;
}

/**
 * @param {string} csvContent
 * @returns {Array<{ lineNo: number, values: string[], get: (name: string, alts?: string[]) => string }>}
 */
function parseCsvRows(csvContent) {
  let content = csvContent || '';
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { error: 'CSV must include a header row and at least one data row.', rows: [] };

  const delimiter = productStore.detectDelimiter(lines[0]);
  const parseLine = (line) =>
    productStore.parseCSVLine(line, delimiter).map((v) => (v || '').replace(/^"|"$/g, '').trim());
  const headers = parseLine(lines[0]).map((h) => (h || '').replace(/^\ufeff/, '').trim());
  const { getVal, col } = productStore.buildHeaderLookup(headers);
  const headerCount = headers.length;

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const values = parseLine(lines[i]);
    if (values.length < headerCount) continue;
    if (values.every((v) => !(v || '').trim())) continue;
    const get = (name, alts = []) => getVal(values, name, alts, '');
    rows.push({ lineNo, values, get });
  }
  return { error: null, headers, rows };
}

function extractRowFields(get) {
  const sku = normalizeSku(get('sku', ['product_sku', 'item_number', 'part_number']));
  const cost = parseNumber(get('supplier_cost', ['cost', 'unit_cost', 'supplier unit cost', 'dealer_cost']));
  const caseQty = parseIntMaybe(get('case_qty', ['case_quantity', 'case qty', 'casesize']));
  const brand = (get('brand', ['mfg', 'manufacturer']) || '').trim() || null;
  const mapPrice = parseNumber(get('map', ['map_price', 'msrp', 'minimum_advertised_price']));
  const weight = (get('weight', ['ship_weight', 'shipping_weight']) || '').trim() || null;
  const shippingClass = (get('shipping_class', ['ship_class', 'freight_class']) || '').trim() || null;
  const productIdRaw = get('product_id', ['live_product_id', 'id']);
  const productId = parseIntMaybe(productIdRaw);

  return { sku, cost, caseQty, brand, mapPrice, weight, shippingClass, productId };
}

function buildSummary() {
  return {
    rows_processed: 0,
    rows_matched: 0,
    rows_unmatched: 0,
    rows_skipped: 0,
    rows_error: 0,
    rows_would_update: 0,
    rows_updated: 0,
    warnings_count: 0,
    errors_sample: [],
    warnings_sample: []
  };
}

function pushSample(arr, item, max = 15) {
  if (arr.length < max) arr.push(item);
}

async function insertRun({ adminUserId, rulesSnapshot, csvText, summary, status = 'preview' }) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('supplier_cost_import_runs')
    .insert({
      admin_user_id: adminUserId || null,
      status,
      rules_snapshot: rulesSnapshot,
      csv_text: csvText,
      summary
    })
    .select('id, expires_at, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function insertLines(linesPayload) {
  if (!linesPayload.length) return;
  const sb = getSupabaseAdmin();
  const chunk = 200;
  for (let i = 0; i < linesPayload.length; i += chunk) {
    const slice = linesPayload.slice(i, i + chunk);
    const { error } = await sb.from('supplier_cost_import_lines').insert(slice);
    if (error) throw error;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.csvText
 * @param {object} opts.rules
 * @param {number|null} opts.adminUserId
 */
async function previewSupplierCostImport(opts) {
  const csvText = opts.csvText || '';
  const v = validateRules(opts.rules || {});
  if (!v.ok) {
    return { ok: false, error: 'Invalid rules', validation_errors: v.errors };
  }
  const rules = v.rules;

  const parsed = parseCsvRows(csvText);
  if (parsed.error) {
    return { ok: false, error: parsed.error };
  }

  const summary = buildSummary();
  const warningsGlobal = [];
  const skuSeen = new Map();

  const lineRecords = [];
  const previewRows = [];

  for (const row of parsed.rows) {
    summary.rows_processed++;
    const f = extractRowFields(row.get);
    const lineWarnings = [];

    if (!f.sku) {
      summary.rows_skipped++;
      pushSample(summary.errors_sample, { line: row.lineNo, message: 'Missing SKU' });
      lineRecords.push({
        line_no: row.lineNo,
        sku: '',
        raw_row: { values: row.values },
        product_id: null,
        status: 'skipped',
        source_cost: null,
        map_price: null,
        case_qty: null,
        brand: null,
        previous_cost: null,
        previous_price: null,
        previous_bulk_price: null,
        computed_price: null,
        computed_bulk_price: null,
        tier2_reference: null,
        tier3_reference: null,
        explain: null,
        warnings: ['missing_sku'],
        error_message: 'Missing SKU'
      });
      previewRows.push({
        line_no: row.lineNo,
        sku: '',
        status: 'skipped',
        message: 'Missing SKU'
      });
      continue;
    }

    if (skuSeen.has(f.sku)) {
      lineWarnings.push(`duplicate_sku_in_file: also on line ${skuSeen.get(f.sku)}`);
      summary.warnings_count++;
      pushSample(summary.warnings_sample, { line: row.lineNo, sku: f.sku, message: 'Duplicate SKU in file (last row wins for preview display; apply uses last occurrence)' });
    }
    skuSeen.set(f.sku, row.lineNo);

    if (f.cost == null || f.cost <= 0) {
      summary.rows_skipped++;
      pushSample(summary.errors_sample, { line: row.lineNo, sku: f.sku, message: 'Missing or invalid supplier cost' });
      lineRecords.push({
        line_no: row.lineNo,
        sku: f.sku,
        raw_row: { ...f, values: row.values },
        product_id: null,
        status: 'skipped',
        source_cost: f.cost,
        map_price: f.mapPrice,
        case_qty: f.caseQty,
        brand: f.brand,
        previous_cost: null,
        previous_price: null,
        previous_bulk_price: null,
        computed_price: null,
        computed_bulk_price: null,
        tier2_reference: null,
        tier3_reference: null,
        explain: null,
        warnings: lineWarnings,
        error_message: 'Missing or invalid supplier cost'
      });
      previewRows.push({
        line_no: row.lineNo,
        sku: f.sku,
        status: 'skipped',
        message: 'Missing or invalid supplier cost'
      });
      continue;
    }

    const prod = await productsService.getProductBySkuForWrite(f.sku);
    if (prod && prod.ambiguous) {
      summary.rows_error++;
      pushSample(summary.errors_sample, { line: row.lineNo, sku: f.sku, message: 'Multiple products share this SKU in database' });
      lineRecords.push({
        line_no: row.lineNo,
        sku: f.sku,
        raw_row: { ...f, values: row.values },
        product_id: null,
        status: 'ambiguous_sku',
        source_cost: f.cost,
        map_price: f.mapPrice,
        case_qty: f.caseQty,
        brand: f.brand,
        previous_cost: null,
        previous_price: null,
        previous_bulk_price: null,
        computed_price: null,
        computed_bulk_price: null,
        tier2_reference: null,
        tier3_reference: null,
        explain: null,
        warnings: lineWarnings,
        error_message: 'Ambiguous SKU — multiple product rows'
      });
      previewRows.push({
        line_no: row.lineNo,
        sku: f.sku,
        status: 'error',
        message: 'Ambiguous SKU in database'
      });
      continue;
    }

    if (!prod) {
      summary.rows_unmatched++;
      lineRecords.push({
        line_no: row.lineNo,
        sku: f.sku,
        raw_row: { ...f, values: row.values },
        product_id: null,
        status: 'unmatched',
        source_cost: f.cost,
        map_price: f.mapPrice,
        case_qty: f.caseQty,
        brand: f.brand,
        previous_cost: null,
        previous_price: null,
        previous_bulk_price: null,
        computed_price: null,
        computed_bulk_price: null,
        tier2_reference: null,
        tier3_reference: null,
        explain: null,
        warnings: lineWarnings,
        error_message: null
      });
      previewRows.push({
        line_no: row.lineNo,
        sku: f.sku,
        status: 'unmatched',
        message: 'No product with exact SKU'
      });
      continue;
    }

    if (f.productId != null && Number(f.productId) !== Number(prod.id)) {
      summary.rows_error++;
      pushSample(summary.errors_sample, {
        line: row.lineNo,
        sku: f.sku,
        message: `product_id ${f.productId} does not match SKU (product id ${prod.id})`
      });
      lineRecords.push({
        line_no: row.lineNo,
        sku: f.sku,
        raw_row: { ...f, values: row.values },
        product_id: prod.id,
        status: 'error',
        source_cost: f.cost,
        map_price: f.mapPrice,
        case_qty: f.caseQty,
        brand: f.brand,
        previous_cost: prod.cost,
        previous_price: prod.price,
        previous_bulk_price: prod.bulk_price,
        computed_price: null,
        computed_bulk_price: null,
        tier2_reference: null,
        tier3_reference: null,
        explain: null,
        warnings: lineWarnings,
        error_message: 'product_id mismatch for SKU'
      });
      previewRows.push({
        line_no: row.lineNo,
        sku: f.sku,
        status: 'error',
        message: 'product_id does not match SKU'
      });
      continue;
    }

    const derived = computeDerivedPricing(f.cost, f.mapPrice, rules);
    if (derived.error) {
      summary.rows_error++;
      lineRecords.push({
        line_no: row.lineNo,
        sku: f.sku,
        raw_row: { ...f, values: row.values },
        product_id: prod.id,
        status: 'error',
        source_cost: f.cost,
        map_price: f.mapPrice,
        case_qty: f.caseQty,
        brand: f.brand,
        previous_cost: prod.cost,
        previous_price: prod.price,
        previous_bulk_price: prod.bulk_price,
        computed_price: null,
        computed_bulk_price: null,
        tier2_reference: null,
        tier3_reference: null,
        explain: { steps: derived.steps },
        warnings: lineWarnings,
        error_message: 'Pricing computation failed'
      });
      previewRows.push({
        line_no: row.lineNo,
        sku: f.sku,
        status: 'error',
        message: 'Pricing computation failed'
      });
      continue;
    }

    summary.rows_matched++;
    summary.rows_would_update++;

    const explain = {
      engine: 'supplier_cost_import',
      source_cost: derived.source_cost,
      map: derived.map_applied,
      rules_applied: rules,
      formula_steps: derived.steps,
      generated: {
        list_price: derived.price,
        bulk_price: derived.bulk_price,
        tier2_reference: derived.tier2_reference,
        tier3_reference: derived.tier3_reference
      },
      margin_percent: {
        list: derived.list_margin_achieved,
        bulk: derived.bulk_margin_achieved
      }
    };

    lineRecords.push({
      line_no: row.lineNo,
      sku: f.sku,
      raw_row: { ...f, values: row.values },
      product_id: prod.id,
      status: 'matched',
      source_cost: f.cost,
      map_price: f.mapPrice,
      case_qty: f.caseQty,
      brand: f.brand,
      previous_cost: prod.cost,
      previous_price: prod.price,
      previous_bulk_price: prod.bulk_price,
      computed_price: derived.price,
      computed_bulk_price: derived.bulk_price,
      tier2_reference: derived.tier2_reference,
      tier3_reference: derived.tier3_reference,
      explain,
      warnings: lineWarnings,
      error_message: null
    });

    previewRows.push({
      line_no: row.lineNo,
      sku: f.sku,
      product_id: prod.id,
      status: 'matched',
      source_cost: f.cost,
      previous: { cost: prod.cost, price: prod.price, bulk_price: prod.bulk_price },
      proposed: {
        cost: f.cost,
        price: derived.price,
        bulk_price: derived.bulk_price,
        tier2_reference: derived.tier2_reference,
        tier3_reference: derived.tier3_reference
      },
      margin_percent: explain.margin_percent,
      formula_steps: derived.steps,
      warnings: lineWarnings
    });
  }

  const run = await insertRun({
    adminUserId: opts.adminUserId,
    rulesSnapshot: rules,
    csvText,
    summary: { ...summary, warnings_global: warningsGlobal }
  });

  const withRunId = lineRecords.map((L) => ({ ...L, run_id: run.id }));
  await insertLines(withRunId);

  return {
    ok: true,
    run_id: run.id,
    expires_at: run.expires_at,
    summary,
    preview_rows: previewRows.slice(0, 500),
    preview_truncated: previewRows.length > 500,
    preview_total: previewRows.length,
    rules: rules
  };
}

async function getRun(runId) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('supplier_cost_import_runs').select('*').eq('id', runId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getRunLines(runId, limit = 200, offset = 0) {
  const sb = getSupabaseAdmin();
  const lim = Math.min(500, Math.max(1, limit));
  const off = Math.max(0, offset);
  const { data, error, count } = await sb
    .from('supplier_cost_import_lines')
    .select('*', { count: 'exact' })
    .eq('run_id', runId)
    .order('line_no', { ascending: true })
    .range(off, off + lim - 1);
  if (error) throw error;
  return { lines: data || [], total: count ?? (data || []).length };
}

async function listRecentRuns(limit = 10) {
  const sb = getSupabaseAdmin();
  const lim = Math.min(50, Math.max(1, limit));
  const { data, error } = await sb
    .from('supplier_cost_import_runs')
    .select('id, status, summary, created_at, applied_at, expires_at')
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) throw error;
  return data || [];
}

async function applyRun(runId, adminUserId) {
  const sb = getSupabaseAdmin();
  const run = await getRun(runId);
  if (!run) {
    return { ok: false, error: 'Run not found' };
  }
  if (run.status !== 'preview') {
    return { ok: false, error: `Run is not preview (status=${run.status})` };
  }
  if (run.expires_at && new Date(run.expires_at) < new Date()) {
    await sb.from('supplier_cost_import_runs').update({ status: 'expired' }).eq('id', runId);
    return { ok: false, error: 'Preview expired — run preview again' };
  }

  const rules = normalizeRules(run.rules_snapshot || {});
  const { data: lines, error: lerr } = await sb
    .from('supplier_cost_import_lines')
    .select('*')
    .eq('run_id', runId)
    .order('line_no', { ascending: true });
  if (lerr) throw lerr;

  const summary = buildSummary();
  summary.rows_processed = (lines || []).length;

  let updated = 0;
  const errors = [];

  for (const line of lines || []) {
    const st = line.status;
    if (st === 'matched') summary.rows_matched++;
    else if (st === 'unmatched') summary.rows_unmatched++;
    else if (st === 'skipped') summary.rows_skipped++;
    else if (st === 'error' || st === 'ambiguous_sku') summary.rows_error++;
  }

  const matchedOrdered = (lines || []).filter((l) => l.status === 'matched' && l.product_id);
  const lastLineBySku = new Map();
  for (const line of matchedOrdered) {
    lastLineBySku.set(normalizeSku(line.sku), line);
  }

  for (const line of lastLineBySku.values()) {
    const f = {
      cost: line.source_cost,
      caseQty: line.case_qty,
      brand: line.brand,
      mapPrice: line.map_price
    };
    const raw = line.raw_row || {};
    const weight = raw.weight != null ? raw.weight : null;
    const shippingClass = raw.shipping_class != null ? raw.shipping_class : null;

    try {
      const row = await productsService.getProductBySkuForWrite(line.sku);
      if (!row || row.ambiguous || String(row.id) !== String(line.product_id)) {
        errors.push({ line: line.line_no, sku: line.sku, message: 'Product/SKU mismatch or missing — skipped' });
        continue;
      }
      const full = await productsService.getProductById(line.product_id);
      if (!full) {
        errors.push({ line: line.line_no, sku: line.sku, message: 'Product not found' });
        continue;
      }

      const derived = computeDerivedPricing(f.cost, f.mapPrice, rules);
      if (derived.error) {
        errors.push({ line: line.line_no, sku: line.sku, message: 'Derive failed on apply' });
        continue;
      }

      const pricingDerivation = {
        engine: 'supplier_cost_import',
        run_id: runId,
        line_id: line.id,
        at: new Date().toISOString(),
        admin_user_id: adminUserId || null,
        source_cost: derived.source_cost,
        map: derived.map_applied,
        rules_snapshot: rules,
        formula_steps: derived.steps,
        price: derived.price,
        bulk_price: derived.bulk_price,
        tier2_reference: derived.tier2_reference,
        tier3_reference: derived.tier3_reference,
        margin_percent: {
          list: derived.list_margin_achieved,
          bulk: derived.bulk_margin_achieved
        }
      };

      const payload = {
        cost: f.cost,
        price: derived.price,
        bulk_price: derived.bulk_price,
        pricing_derivation: pricingDerivation
      };

      if (rules.update_case_qty_from_import && f.caseQty != null) {
        payload.case_qty = f.caseQty;
      }
      if (rules.update_brand_from_import && f.brand) {
        payload.brand = f.brand;
      }

      if (rules.merge_shipping_attributes && (weight || shippingClass)) {
        const prevAttr = full.attributes && typeof full.attributes === 'object' ? { ...full.attributes } : {};
        if (weight) prevAttr.supplier_import_weight = weight;
        if (shippingClass) prevAttr.supplier_import_shipping_class = shippingClass;
        payload.attributes = prevAttr;
      }

      await productsService.updateProduct(line.product_id, payload);
      updated++;
    } catch (e) {
      errors.push({ line: line.line_no, sku: line.sku, message: e.message || String(e) });
    }
  }

  summary.rows_updated = updated;
  summary.rows_apply_unique_skus = lastLineBySku.size;
  summary.apply_errors = errors.slice(0, 30);

  const { error: uerr } = await sb
    .from('supplier_cost_import_runs')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      summary
    })
    .eq('id', runId);
  if (uerr) throw uerr;

  return { ok: true, run_id: runId, summary };
}

async function listRuleSets() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('wholesale_pricing_rule_sets')
    .select('id, name, is_default, rules, updated_at')
    .order('name');
  if (error) throw error;
  return data || [];
}

async function upsertRuleSet(name, body) {
  const sb = getSupabaseAdmin();
  const n = String(name || '').trim();
  if (!n) throw new Error('name required');
  const rules = normalizeRules(body.rules || {});
  const v = validateRules(rules);
  if (!v.ok) throw new Error(v.errors.join('; '));

  if (body.is_default) {
    await sb.from('wholesale_pricing_rule_sets').update({ is_default: false }).eq('is_default', true);
  }

  const { data: existing } = await sb.from('wholesale_pricing_rule_sets').select('id').eq('name', n).maybeSingle();
  const row = {
    name: n,
    rules: v.rules,
    is_default: Boolean(body.is_default),
    updated_at: new Date().toISOString()
  };
  if (existing && existing.id) {
    const { error } = await sb.from('wholesale_pricing_rule_sets').update(row).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('wholesale_pricing_rule_sets').insert(row);
    if (error) throw error;
  }
  return { ok: true, name: n };
}

module.exports = {
  previewSupplierCostImport,
  applyRun,
  getRun,
  getRunLines,
  listRecentRuns,
  listRuleSets,
  upsertRuleSet,
  normalizeRules,
  parseCsvRows,
  DEFAULT_RULES: require('../lib/supplierCostPricing').DEFAULT_RULES
};
