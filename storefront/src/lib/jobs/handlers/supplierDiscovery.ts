/**
 * Supplier Discovery Job Handler
 * 
 * Processes supplier leads and converts high-confidence leads to suppliers.
 * 
 * Sources:
 * 1. Existing supplier_leads from manual or automated discovery
 * 2. Supplier onboarding requests
 * 
 * Flow:
 * 1. Load pending supplier leads
 * 2. Validate and score each lead
 * 3. Create supplier records for high-confidence leads
 * 4. Create review items for uncertain leads
 * 5. Trigger ingestion jobs for approved suppliers with feeds
 * 
 * Schedule: Weekly
 */

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { getAgentRule } from '../../agents/config';
import { createReviewItem } from '../../review/createReviewItem';
import { emitSystemEvent } from '../../events/emit';
import type { 
  JobExecutionResult, 
  SupplierDiscoveryPayload,
  ReviewQueueCreateInput,
  EnqueueJobInput 
} from '../../agents/types';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierLead {
  id: string;
  company_name: string;
  domain?: string;
  website?: string;
  lead_score?: number;
  status: string;
  catalog_signals?: Record<string, unknown>;
  contact_email?: string;
  phone?: string;
  categories?: string[];
  supplier_type?: string;
  created_at: string;
}

interface DiscoveryResult {
  lead_id: string;
  company_name: string;
  action: 'approved' | 'review' | 'rejected';
  reason: string;
  supplier_id?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function handleSupplierDiscovery(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as SupplierDiscoveryPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];
  const followupJobs: EnqueueJobInput[] = [];

  // Load agent rules
  const minTrustScore = await getAgentRule<number>('supplier_discovery', 'min_trust_score', 0.6);
  const autoApproveThreshold = await getAgentRule<number>('supplier_discovery', 'auto_approve_threshold', 0.85);
  const requireWebsite = await getAgentRule<boolean>('supplier_discovery', 'require_website', true);
  const requireContact = await getAgentRule<boolean>('supplier_discovery', 'require_contact', true);
  const blockRetailMarketplaces = await getAgentRule<boolean>('supplier_discovery', 'block_retail_marketplaces', true);
  const maxLeadsPerRun = await getAgentRule<number>('supplier_discovery', 'max_leads_per_run', 100);

  try {
    logger.info('Starting supplier discovery', {
      search_terms: input.search_terms,
      categories: input.categories,
      max_results: input.max_results,
    });

    // =========================================================================
    // LOAD PENDING SUPPLIER LEADS
    // =========================================================================
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('supplier_leads')
      .select('*')
      .eq('status', 'pending')
      .order('lead_score', { ascending: false })
      .limit(maxLeadsPerRun);

    if (leadsError) {
      logger.warn('Failed to load supplier leads', { error: leadsError.message });
    }

    // Also check onboarding requests
    const { data: onboardingRequests } = await supabaseAdmin
      .from('supplier_onboarding_requests')
      .select('*')
      .eq('status', 'pending_review')
      .limit(50);

    // Combine leads and onboarding requests
    const allLeads: SupplierLead[] = [
      ...(leads || []).map((l: Record<string, unknown>) => ({
        id: l.id as string,
        company_name: l.company_name as string,
        domain: l.domain as string | undefined,
        website: l.website as string | undefined,
        lead_score: l.lead_score as number | undefined,
        status: l.status as string,
        catalog_signals: l.catalog_signals as Record<string, unknown> | undefined,
        contact_email: l.contact_email as string | undefined,
        phone: l.phone as string | undefined,
        categories: l.categories as string[] | undefined,
        supplier_type: l.supplier_type as string | undefined,
        created_at: l.created_at as string,
      })),
      ...(onboardingRequests || []).map((r: Record<string, unknown>) => ({
        id: `onboard_${r.id}`,
        company_name: r.company_name as string,
        domain: undefined,
        website: r.website as string | undefined,
        lead_score: 0.7, // Default score for self-submitted
        status: 'pending',
        contact_email: r.contact_email as string | undefined,
        phone: r.phone as string | undefined,
        categories: [],
        supplier_type: 'distributor',
        created_at: r.created_at as string,
      })),
    ];

    if (allLeads.length === 0) {
      return {
        success: true,
        output: {
          message: 'No pending supplier leads to process',
          discovered: 0,
          approved: 0,
          sent_to_review: 0,
          rejected: 0,
        },
      };
    }

    // =========================================================================
    // PROCESS EACH LEAD
    // =========================================================================
    const results: DiscoveryResult[] = [];
    let approvedCount = 0;
    let reviewCount = 0;
    let rejectedCount = 0;

    for (const lead of allLeads) {
      const validation = validateLead(lead, {
        minTrustScore,
        requireWebsite,
        requireContact,
        blockRetailMarketplaces,
      });

      // Check for existing supplier with same domain
      const isDuplicate = await checkDuplicateSupplier(lead);
      if (isDuplicate) {
        results.push({
          lead_id: lead.id,
          company_name: lead.company_name,
          action: 'rejected',
          reason: 'Duplicate - supplier already exists',
        });
        rejectedCount++;
        
        await updateLeadStatus(lead.id, 'duplicate');
        continue;
      }

      if (!validation.valid) {
        if (validation.reviewable) {
          // Send to review
          const reviewInput: ReviewQueueCreateInput = {
            review_type: 'supplier',
            priority: validation.priority,
            source_table: 'supplier_leads',
            source_id: lead.id,
            title: `Supplier Lead: ${lead.company_name}`,
            issue_category: validation.issues[0]?.category || 'validation_required',
            issue_summary: validation.issues.map(i => i.message).join('; '),
            recommended_action: 'VERIFY - Manual validation required before approval',
            agent_name: 'supplier_discovery',
            confidence: lead.lead_score,
            details: {
              lead,
              validation_issues: validation.issues,
            },
          };

          const created = await createReviewItem(reviewInput);
          if (created) {
            reviewItems.push(reviewInput);
          }

          results.push({
            lead_id: lead.id,
            company_name: lead.company_name,
            action: 'review',
            reason: validation.issues.map(i => i.message).join('; '),
          });
          reviewCount++;

          await updateLeadStatus(lead.id, 'in_review');
        } else {
          // Reject
          results.push({
            lead_id: lead.id,
            company_name: lead.company_name,
            action: 'rejected',
            reason: validation.issues.map(i => i.message).join('; '),
          });
          rejectedCount++;

          await updateLeadStatus(lead.id, 'rejected');
        }
        continue;
      }

      // High-confidence lead - auto-approve
      if ((lead.lead_score ?? 0) >= autoApproveThreshold) {
        const supplierId = await createSupplierFromLead(lead);
        
        if (supplierId) {
          results.push({
            lead_id: lead.id,
            company_name: lead.company_name,
            action: 'approved',
            reason: `High confidence (${((lead.lead_score ?? 0) * 100).toFixed(0)}%) - auto-approved`,
            supplier_id: supplierId,
          });
          approvedCount++;

          await updateLeadStatus(lead.id, 'approved', supplierId);

          // If lead has feed info, trigger ingestion
          if (lead.catalog_signals?.feed_url) {
            followupJobs.push({
              job_type: 'supplier_ingestion',
              payload: {
                supplier_id: supplierId,
                file_url: lead.catalog_signals.feed_url as string,
              },
              dedupe_key: `supplier_ingestion:${supplierId}`,
              priority: 50,
            });
          }
        }
      } else {
        // Medium confidence - send to review
        const reviewInput: ReviewQueueCreateInput = {
          review_type: 'supplier',
          priority: 'medium',
          source_table: 'supplier_leads',
          source_id: lead.id,
          title: `New Supplier: ${lead.company_name}`,
          issue_category: 'approval_required',
          issue_summary: `Lead score ${((lead.lead_score ?? 0) * 100).toFixed(0)}% - requires approval`,
          recommended_action: 'APPROVE or REJECT - Verify supplier legitimacy',
          agent_name: 'supplier_discovery',
          confidence: lead.lead_score,
          details: { lead },
        };

        const created = await createReviewItem(reviewInput);
        if (created) {
          reviewItems.push(reviewInput);
        }

        results.push({
          lead_id: lead.id,
          company_name: lead.company_name,
          action: 'review',
          reason: 'Moderate confidence - manual approval required',
        });
        reviewCount++;

        await updateLeadStatus(lead.id, 'in_review');
      }
    }

    // =========================================================================
    // EMIT COMPLETION EVENT
    // =========================================================================
    await emitSystemEvent({
      event_type: 'supplier_discovery_completed',
      payload: {
        leads_processed: allLeads.length,
        approved: approvedCount,
        sent_to_review: reviewCount,
        rejected: rejectedCount,
      },
    });

    // =========================================================================
    // RETURN RESULT
    // =========================================================================
    return {
      success: true,
      output: {
        leads_processed: allLeads.length,
        approved: approvedCount,
        sent_to_review: reviewCount,
        rejected: rejectedCount,
        results: results.slice(0, 20), // Limit output size
        config: {
          min_trust_score: minTrustScore,
          auto_approve_threshold: autoApproveThreshold,
        },
      },
      reviewItems,
      followupJobs,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Supplier discovery failed', { error: message });
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

interface ValidationIssue {
  category: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  reviewable: boolean;
  priority: 'low' | 'medium' | 'high';
  issues: ValidationIssue[];
}

function validateLead(
  lead: SupplierLead,
  rules: {
    minTrustScore: number;
    requireWebsite: boolean;
    requireContact: boolean;
    blockRetailMarketplaces: boolean;
  }
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check for retail marketplaces
  if (rules.blockRetailMarketplaces) {
    const site = (lead.website || lead.domain || '').toLowerCase();
    const marketplaces = ['amazon.', 'ebay.', 'walmart.', 'alibaba.', 'aliexpress.'];
    if (marketplaces.some(m => site.includes(m))) {
      issues.push({
        category: 'retail_marketplace',
        message: 'Website is a retail marketplace, not a wholesale supplier',
        severity: 'error',
      });
    }
  }

  // Check website requirement
  if (rules.requireWebsite && !lead.website && !lead.domain) {
    issues.push({
      category: 'missing_website',
      message: 'No website or domain provided',
      severity: 'warning',
    });
  }

  // Check contact requirement
  if (rules.requireContact && !lead.contact_email && !lead.phone) {
    issues.push({
      category: 'missing_contact',
      message: 'No contact information provided',
      severity: 'warning',
    });
  }

  // Check trust score
  if ((lead.lead_score ?? 0) < rules.minTrustScore) {
    issues.push({
      category: 'low_trust_score',
      message: `Trust score ${((lead.lead_score ?? 0) * 100).toFixed(0)}% below minimum ${(rules.minTrustScore * 100).toFixed(0)}%`,
      severity: 'warning',
    });
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    valid: !hasErrors && warningCount === 0,
    reviewable: !hasErrors, // Errors are not reviewable, warnings are
    priority: hasErrors ? 'high' : warningCount >= 2 ? 'high' : warningCount === 1 ? 'medium' : 'low',
    issues,
  };
}

async function checkDuplicateSupplier(lead: SupplierLead): Promise<boolean> {
  // Check by domain
  if (lead.domain) {
    const { data: existing } = await supabaseAdmin
      .from('suppliers')
      .select('id')
      .ilike('website', `%${lead.domain}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      return true;
    }
  }

  // Check by normalized company name
  const normalizedName = lead.company_name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const { data: byName } = await supabaseAdmin
    .from('suppliers')
    .select('id, name')
    .limit(100);

  if (byName) {
    for (const supplier of byName) {
      const existingNormalized = (supplier.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (existingNormalized === normalizedName) {
        return true;
      }
    }
  }

  return false;
}

async function createSupplierFromLead(lead: SupplierLead): Promise<string | null> {
  const supplierId = crypto.randomUUID();

  const { error } = await supabaseAdmin
    .from('suppliers')
    .insert({
      id: supplierId,
      name: lead.company_name,
      slug: lead.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      website: lead.website || (lead.domain ? `https://${lead.domain}` : null),
      settings: {
        lead_source: lead.id,
        lead_score: lead.lead_score,
        categories: lead.categories,
        supplier_type: lead.supplier_type,
      },
      is_active: true,
      created_at: new Date().toISOString(),
    });

  if (error) {
    logger.warn('Failed to create supplier from lead', { error: error.message });
    return null;
  }

  // Create contact if available
  if (lead.contact_email || lead.phone) {
    await supabaseAdmin
      .from('supplier_contacts')
      .insert({
        supplier_id: supplierId,
        name: 'Primary Contact',
        email: lead.contact_email,
        phone: lead.phone,
        role: 'primary',
        is_primary: true,
      });
  }

  return supplierId;
}

async function updateLeadStatus(
  leadId: string,
  status: string,
  supplierId?: string
): Promise<void> {
  // Handle onboarding requests differently
  if (leadId.startsWith('onboard_')) {
    const realId = leadId.replace('onboard_', '');
    await supabaseAdmin
      .from('supplier_onboarding_requests')
      .update({
        status: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending_review',
        supplier_id: supplierId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', realId);
    return;
  }

  await supabaseAdmin
    .from('supplier_leads')
    .update({
      status,
      supplier_id: supplierId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
}
