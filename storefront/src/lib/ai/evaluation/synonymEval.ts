/**
 * AI Synonym Evaluator
 * 
 * Measures quality of synonym resolution.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveSynonym, loadSynonyms } from '../reasoning';
import type { SynonymDatasetEntry, SynonymEvalResult } from './types';

// ============================================================================
// DATASET LOADING
// ============================================================================

export function loadSynonymDataset(datasetPath?: string): SynonymDatasetEntry[] {
  const defaultPath = join(process.cwd(), '..', 'data', 'ai-evals', 'synonym_dataset.json');
  const path = datasetPath || defaultPath;
  
  if (!existsSync(path)) {
    console.warn(`Synonym dataset not found at ${path}, using sample data`);
    return getSampleSynonymDataset();
  }
  
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as SynonymDatasetEntry[];
}

// ============================================================================
// EVALUATION
// ============================================================================

export async function evaluateSynonyms(
  dataset?: SynonymDatasetEntry[]
): Promise<{
  results: SynonymEvalResult[];
  resolution_rate: number;
  accuracy: number;
  missing_synonyms: string[];
  by_field: Record<string, { correct: number; total: number; accuracy: number }>;
}> {
  const entries = dataset || loadSynonymDataset();
  const results: SynonymEvalResult[] = [];
  const missing_synonyms: string[] = [];
  
  // Field tracking
  const fieldStats: Record<string, { correct: number; total: number }> = {};
  
  // Preload synonyms
  await loadSynonyms();
  
  for (const entry of entries) {
    const result = await evaluateSingleSynonym(entry);
    results.push(result);
    
    // Track field stats
    if (!fieldStats[entry.input.field_name]) {
      fieldStats[entry.input.field_name] = { correct: 0, total: 0 };
    }
    fieldStats[entry.input.field_name].total++;
    if (result.correct) {
      fieldStats[entry.input.field_name].correct++;
    }
    
    // Track missing synonyms
    if (entry.expected.should_resolve && !result.was_resolved) {
      missing_synonyms.push(`${entry.input.field_name}:${entry.input.raw_term}`);
    }
  }
  
  // Calculate metrics
  const total = results.length;
  const resolved = results.filter(r => r.was_resolved).length;
  const correct = results.filter(r => r.correct).length;
  
  const resolution_rate = total > 0 ? resolved / total : 0;
  const accuracy = total > 0 ? correct / total : 0;
  
  // Per-field accuracy
  const by_field: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [field, stats] of Object.entries(fieldStats)) {
    by_field[field] = {
      ...stats,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
    };
  }
  
  return {
    results,
    resolution_rate,
    accuracy,
    missing_synonyms,
    by_field,
  };
}

async function evaluateSingleSynonym(
  entry: SynonymDatasetEntry
): Promise<SynonymEvalResult> {
  const { resolved, was_synonym } = await resolveSynonym(
    entry.input.field_name,
    entry.input.raw_term
  );
  
  // Determine correctness
  let correct: boolean;
  if (entry.expected.should_resolve) {
    // Should have resolved to expected term
    correct = was_synonym && 
      resolved.toLowerCase() === entry.expected.normalized_term.toLowerCase();
  } else {
    // Should not have resolved (or return unchanged)
    correct = !was_synonym || 
      resolved.toLowerCase() === entry.input.raw_term.toLowerCase();
  }
  
  return {
    entry_id: entry.id,
    resolved_term: was_synonym ? resolved : null,
    expected_term: entry.expected.normalized_term,
    correct,
    was_resolved: was_synonym,
    should_have_resolved: entry.expected.should_resolve,
  };
}

// ============================================================================
// SAMPLE DATASET
// ============================================================================

function getSampleSynonymDataset(): SynonymDatasetEntry[] {
  return [
    // Material synonyms
    {
      id: 'syn_001',
      input: { field_name: 'material', raw_term: 'nitril' },
      expected: { normalized_term: 'nitrile', should_resolve: true },
    },
    {
      id: 'syn_002',
      input: { field_name: 'material', raw_term: 'nitirle' },
      expected: { normalized_term: 'nitrile', should_resolve: true },
    },
    {
      id: 'syn_003',
      input: { field_name: 'material', raw_term: 'nbr' },
      expected: { normalized_term: 'nitrile', should_resolve: true },
    },
    {
      id: 'syn_004',
      input: { field_name: 'material', raw_term: 'nitrile' },
      expected: { normalized_term: 'nitrile', should_resolve: false },
    },
    
    // Color synonyms
    {
      id: 'syn_005',
      input: { field_name: 'color', raw_term: 'blk' },
      expected: { normalized_term: 'black', should_resolve: true },
    },
    {
      id: 'syn_006',
      input: { field_name: 'color', raw_term: 'wht' },
      expected: { normalized_term: 'white', should_resolve: true },
    },
    {
      id: 'syn_007',
      input: { field_name: 'color', raw_term: 'safety orange' },
      expected: { normalized_term: 'orange', should_resolve: true },
    },
    
    // Grade synonyms
    {
      id: 'syn_008',
      input: { field_name: 'grade', raw_term: 'exam' },
      expected: { normalized_term: 'exam_grade', should_resolve: true },
    },
    {
      id: 'syn_009',
      input: { field_name: 'grade', raw_term: 'medical' },
      expected: { normalized_term: 'medical_grade', should_resolve: true },
    },
    {
      id: 'syn_010',
      input: { field_name: 'grade', raw_term: 'food service' },
      expected: { normalized_term: 'food_safe', should_resolve: true },
    },
    
    // Pack type synonyms
    {
      id: 'syn_011',
      input: { field_name: 'pack_type', raw_term: 'bx' },
      expected: { normalized_term: 'box', should_resolve: true },
    },
    {
      id: 'syn_012',
      input: { field_name: 'pack_type', raw_term: '/cs' },
      expected: { normalized_term: 'per_case', should_resolve: true },
    },
    
    // Texture synonyms
    {
      id: 'syn_013',
      input: { field_name: 'texture', raw_term: 'txtrd' },
      expected: { normalized_term: 'textured', should_resolve: true },
    },
    {
      id: 'syn_014',
      input: { field_name: 'texture', raw_term: 'micro-textured' },
      expected: { normalized_term: 'microtextured', should_resolve: true },
    },
    
    // Non-existent synonyms (should not resolve)
    {
      id: 'syn_015',
      input: { field_name: 'material', raw_term: 'unknown_material' },
      expected: { normalized_term: 'unknown_material', should_resolve: false },
    },
  ];
}

export { getSampleSynonymDataset };
