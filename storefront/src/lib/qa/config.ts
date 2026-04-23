/**
 * QA Supervisor - Configuration Loader
 * 
 * Loads QA configuration from agent_rules with fallback defaults.
 */

import { getAgentRule } from '../agents/config';
import type { QAConfig } from './types';

// Default configuration (matches lib/qaSupervisor.js)
const DEFAULT_CONFIG: QAConfig = {
  min_confidence_auto_publish: 0.90,
  min_confidence_auto_fix: 0.85,
  confidence_downgrade_step: 0.10,
  
  min_margin_percent: 0.15,
  min_margin_dollars: 1.00,
  
  max_auto_publish_price_change: 0.05,
  max_price_swing_without_review: 0.07,
  
  max_competitor_data_age_days: 7,
  max_cost_data_age_days: 30,
  
  enable_safe_auto_fixes: true,
  systemic_issue_threshold: 5,
  
  color_normalize: {
    'blk': 'black', 'blu': 'blue', 'wht': 'white', 'clr': 'clear',
    'grn': 'green', 'org': 'orange', 'pnk': 'pink', 'pur': 'purple'
  },
  material_normalize: {
    'nitril': 'nitrile', 'nit': 'nitrile', 'vin': 'vinyl',
    'lat': 'latex', 'ltx': 'latex', 'poly': 'polyethylene'
  },
  grade_normalize: {
    'exam': 'exam', 'examination': 'exam', 'med': 'medical',
    'ind': 'industrial', 'indust': 'industrial', 'food': 'foodservice'
  }
};

let cachedConfig: QAConfig | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Load QA configuration from database with defaults
 */
export async function loadQAConfig(): Promise<QAConfig> {
  const now = Date.now();
  
  if (cachedConfig && (now - cacheTime) < CACHE_TTL_MS) {
    return cachedConfig;
  }
  
  const config: QAConfig = { ...DEFAULT_CONFIG };
  
  // Load numeric rules from database
  const numericRules = [
    'min_confidence_auto_publish',
    'min_confidence_auto_fix',
    'confidence_downgrade_step',
    'min_margin_percent',
    'min_margin_dollars',
    'max_auto_publish_price_change',
    'max_price_swing_without_review',
    'max_competitor_data_age_days',
    'max_cost_data_age_days',
    'systemic_issue_threshold',
  ] as const;
  
  for (const rule of numericRules) {
    const defaultVal = DEFAULT_CONFIG[rule];
    const value = await getAgentRule<number>('audit_supervisor', rule, defaultVal);
    if (value !== undefined && value !== defaultVal) {
      (config as unknown as Record<string, number>)[rule] = value;
    }
  }
  
  // Load boolean rules
  const enableFixes = await getAgentRule<boolean>('audit_supervisor', 'enable_safe_auto_fixes', DEFAULT_CONFIG.enable_safe_auto_fixes);
  if (enableFixes !== undefined) {
    config.enable_safe_auto_fixes = enableFixes;
  }
  
  cachedConfig = config;
  cacheTime = now;
  
  return config;
}

/**
 * Clear cached config (useful after rule updates)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}

/**
 * Get a specific config value
 */
export async function getQAConfigValue<K extends keyof QAConfig>(
  key: K
): Promise<QAConfig[K]> {
  const config = await loadQAConfig();
  return config[key];
}
