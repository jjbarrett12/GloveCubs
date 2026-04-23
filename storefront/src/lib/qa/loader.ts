/**
 * QA Supervisor - Data Loader
 * 
 * Loads actual domain records from the database for auditing.
 * This is where the QA supervisor gets real data to audit.
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';
import { flattenCatalogosProductRow } from '../catalog/canonical-read-model';
import { logger } from '../jobs/logger';
import type {
  QAAuditInput,
  SupplierRecord,
  ProductRecord,
  MatchRecord,
  PricingRecord,
  ActionRecord,
} from './types';

export interface AuditDataSet {
  suppliers: SupplierRecord[];
  products: ProductRecord[];
  matches: MatchRecord[];
  pricing: PricingRecord[];
  actions: ActionRecord[];
}

/**
 * Load domain records from database for auditing
 * 
 * For full audits: loads recent records across all domains
 * For targeted audits: uses provided data or loads specific records
 */
export async function loadAuditData(
  input: QAAuditInput,
  modules: string[]
): Promise<AuditDataSet> {
  const since = input.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceISO = since.toISOString();

  const data: AuditDataSet = {
    suppliers: input.suppliers ?? [],
    products: input.products ?? [],
    matches: input.matches ?? [],
    pricing: input.pricing ?? [],
    actions: input.actions ?? [],
  };

  // If data was provided directly, use it
  const hasProvidedData = 
    data.suppliers.length > 0 ||
    data.products.length > 0 ||
    data.matches.length > 0 ||
    data.pricing.length > 0 ||
    data.actions.length > 0;

  if (hasProvidedData && input.scope === 'targeted') {
    logger.info('Using provided audit data', {
      suppliers: data.suppliers.length,
      products: data.products.length,
      matches: data.matches.length,
      pricing: data.pricing.length,
      actions: data.actions.length,
    });
    return data;
  }

  // Load from database based on modules
  const loadPromises: Promise<void>[] = [];

  if (modules.includes('supplier_discovery')) {
    loadPromises.push(loadSuppliers(sinceISO, data));
  }

  if (modules.includes('product_intake')) {
    loadPromises.push(loadProducts(sinceISO, data));
  }

  if (modules.includes('product_matching')) {
    loadPromises.push(loadMatches(sinceISO, data));
  }

  if (modules.includes('competitive_pricing')) {
    loadPromises.push(loadPricingData(sinceISO, data));
  }

  if (modules.includes('daily_price_guard')) {
    loadPromises.push(loadActionQueue(sinceISO, data));
  }

  await Promise.all(loadPromises);

  logger.info('Loaded audit data from database', {
    suppliers: data.suppliers.length,
    products: data.products.length,
    matches: data.matches.length,
    pricing: data.pricing.length,
    actions: data.actions.length,
  });

  return data;
}

async function loadSuppliers(since: string, data: AuditDataSet): Promise<void> {
  try {
    // Load from suppliers table
    const { data: suppliers, error } = await supabaseAdmin
      .from('suppliers')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      logger.warn('Failed to load suppliers for audit', { error: error.message });
      return;
    }

    if (suppliers) {
      data.suppliers = suppliers.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type ?? s.supplier_type,
        supplier_type: s.supplier_type ?? s.type,
        website: s.website,
        url: s.url ?? s.website,
        contact_email: s.contact_email ?? s.email,
        phone: s.phone,
        trust_score: s.trust_score,
        minimum_order: s.minimum_order ?? s.moq,
        ...s,
      }));
    }

    // Also check supplier_discovery_queue if it exists
    const { data: discoveryQueue, error: dqError } = await supabaseAdmin
      .from('supplier_discovery_queue')
      .select('*')
      .gte('created_at', since)
      .eq('status', 'pending')
      .limit(200);

    if (!dqError && discoveryQueue) {
      for (const item of discoveryQueue) {
        if (!data.suppliers.some(s => s.id === item.id)) {
          data.suppliers.push({
            id: item.id,
            name: item.company_name ?? item.name,
            type: item.supplier_type,
            website: item.website ?? item.url,
            trust_score: item.trust_score,
            ...item,
          });
        }
      }
    }
  } catch (err) {
    logger.warn('Error loading suppliers', { error: String(err) });
  }
}

async function loadProducts(since: string, data: AuditDataSet): Promise<void> {
  try {
    // Load supplier_products (normalized products awaiting matching)
    const { data: supplierProducts, error: spError } = await supabaseAdmin
      .from('supplier_products')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!spError && supplierProducts) {
      for (const p of supplierProducts) {
        data.products.push({
          id: p.id,
          sku: p.sku ?? p.supplier_sku,
          supplier_sku: p.supplier_sku ?? p.sku,
          brand: p.brand,
          material: p.material,
          color: p.color,
          grade: p.grade,
          size: p.size,
          thickness_mil: p.thickness_mil ?? p.thickness,
          thickness: p.thickness ?? p.thickness_mil,
          units_per_box: p.units_per_box,
          boxes_per_case: p.boxes_per_case,
          total_units_per_case: p.total_units_per_case,
          title: p.title ?? p.canonical_title,
          canonical_title: p.canonical_title ?? p.title,
          parse_confidence: p.parse_confidence ?? p.confidence,
          review_required: p.review_required,
          manufacturer_part_number: p.manufacturer_part_number ?? p.mpn,
          ...p,
        });
      }
    }

    const { data: catalogRows, error: cpError } = await getSupabaseCatalogos()
      .from('products')
      .select('id, sku, name, attributes, updated_at')
      .eq('is_active', true)
      .gte('updated_at', since)
      .limit(200);

    if (!cpError && catalogRows) {
      for (const row of catalogRows) {
        const p = flattenCatalogosProductRow(row as Record<string, unknown>);
        const attrs =
          row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes)
            ? (row.attributes as Record<string, unknown>)
            : {};
        if (!data.products.some((existing) => existing.id === p.id)) {
          data.products.push({
            ...(row as Record<string, unknown>),
            id: p.id as string,
            sku: p.sku as string,
            brand: attrs.brand as string | undefined,
            material: p.material as string | undefined,
            color: p.color as string | undefined,
            grade: attrs.grade as string | undefined,
            size: p.size as string | undefined,
            units_per_box: attrs.units_per_box as number | undefined,
            boxes_per_case: attrs.boxes_per_case as number | undefined,
            total_units_per_case: attrs.total_units_per_case as number | undefined,
            title: (p.title as string) ?? (p.name as string),
            manufacturer_part_number: attrs.mpn as string | undefined,
            parse_confidence: 1.0,
          } as ProductRecord);
        }
      }
    }
  } catch (err) {
    logger.warn('Error loading products', { error: String(err) });
  }
}

async function loadMatches(since: string, data: AuditDataSet): Promise<void> {
  try {
    const { data: matches, error } = await supabaseAdmin
      .from('product_matches')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      logger.warn('Failed to load product matches', { error: error.message });
      return;
    }

    if (matches) {
      data.matches = matches.map(m => ({
        incoming_supplier_product_id: m.supplier_product_id ?? m.incoming_supplier_product_id,
        match_result: m.match_result ?? m.match_type,
        canonical_product_id: m.canonical_product_id,
        match_confidence: m.match_confidence ?? m.confidence,
        matched_fields: m.matched_fields ?? [],
        conflicting_fields: m.conflicting_fields ?? [],
        reasoning: m.reasoning ?? m.match_reasoning,
        ...m,
      }));
    }
  } catch (err) {
    logger.warn('Error loading matches', { error: String(err) });
  }
}

async function loadPricingData(since: string, data: AuditDataSet): Promise<void> {
  try {
    // Load pricing recommendations
    const { data: recommendations, error: recError } = await supabaseAdmin
      .from('pricing_recommendations')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!recError && recommendations) {
      for (const rec of recommendations) {
        data.pricing.push({
          canonical_product_id: rec.canonical_product_id ?? rec.product_id,
          current_price: rec.current_price,
          recommended_price: rec.recommended_price,
          current_cost: rec.current_cost ?? rec.cost,
          map_price: rec.map_price,
          estimated_margin_percent_after_change: rec.margin_percent ?? rec.estimated_margin_percent,
          estimated_margin_dollars_after_change: rec.margin_dollars,
          confidence: rec.confidence,
          auto_publish_eligible: rec.auto_publish_eligible ?? rec.auto_publish,
          review_reasons: rec.review_reasons ?? [],
          competitor_offers: [],
          last_competitor_update: rec.last_competitor_check,
          ...rec,
        });
      }
    }

    // Load competitor offers for context
    const { data: offers, error: offError } = await supabaseAdmin
      .from('competitor_offers')
      .select('*')
      .gte('created_at', since)
      .limit(500);

    if (!offError && offers) {
      // Attach offers to their pricing records
      for (const offer of offers) {
        const pricingRecord = data.pricing.find(
          p => p.canonical_product_id === offer.canonical_product_id
        );
        if (pricingRecord && pricingRecord.competitor_offers) {
          pricingRecord.competitor_offers.push({
            source_name: offer.source_name ?? offer.competitor_name,
            visible_price: offer.price ?? offer.visible_price,
            shipping_estimate: offer.shipping_estimate,
            offer_confidence: offer.confidence ?? offer.match_confidence ?? 0.8,
            same_pack: offer.same_pack ?? false,
            same_brand: offer.same_brand ?? false,
            ...offer,
          });
        }
      }
    }
  } catch (err) {
    logger.warn('Error loading pricing data', { error: String(err) });
  }
}

async function loadActionQueue(since: string, data: AuditDataSet): Promise<void> {
  try {
    // Load from daily_actions or action_queue table
    const { data: actions, error } = await supabaseAdmin
      .from('daily_actions')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      // Try alternative table name
      const { data: altActions, error: altError } = await supabaseAdmin
        .from('action_queue')
        .select('*')
        .gte('created_at', since)
        .limit(500);

      if (!altError && altActions) {
        data.actions = altActions.map(a => ({
          product_id: a.product_id ?? a.canonical_product_id,
          sku: a.sku,
          action_type: a.action_type ?? a.type,
          recommended_change: a.recommended_change ?? a.change,
          reason: a.reason,
          priority: a.priority,
          details: a.details ?? {},
          ...a,
        }));
      }
      return;
    }

    if (actions) {
      data.actions = actions.map(a => ({
        product_id: a.product_id ?? a.canonical_product_id,
        sku: a.sku,
        action_type: a.action_type ?? a.type,
        recommended_change: a.recommended_change ?? a.change,
        reason: a.reason,
        priority: a.priority,
        details: a.details ?? {},
        ...a,
      }));
    }
  } catch (err) {
    logger.warn('Error loading action queue', { error: String(err) });
  }
}

/**
 * Load operational health data (job queue, review queue)
 */
export async function loadOpsHealthData(since: Date): Promise<{
  jobs: { status: string; job_type: string; blocked_reason?: string; id: string; created_at: string }[];
  reviews: { status: string; priority: string; source_table?: string; source_id?: string; issue_category: string; created_at: string; id: string }[];
}> {
  const sinceISO = since.toISOString();
  
  const [jobsResult, reviewsResult] = await Promise.all([
    supabaseAdmin
      .from('job_queue')
      .select('id, status, job_type, blocked_reason, created_at')
      .gte('created_at', sinceISO)
      .limit(500),
    supabaseAdmin
      .from('review_queue')
      .select('id, status, priority, source_table, source_id, issue_category, created_at')
      .eq('status', 'open')
      .limit(500),
  ]);

  return {
    jobs: jobsResult.data ?? [],
    reviews: reviewsResult.data ?? [],
  };
}
