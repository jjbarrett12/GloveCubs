/**
 * Agent Configuration and Rules
 * 
 * Provides access to agent config and business rules from the database.
 */

import { supabaseAdmin } from '../jobs/supabase';
import type { AgentName, AgentConfigRow, AgentRuleRow } from './types';

// In-memory cache with TTL
const configCache = new Map<string, { value: unknown; expiry: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Get agent configuration
 */
export async function getAgentConfig(agentName: AgentName): Promise<AgentConfigRow | null> {
  const cacheKey = `config:${agentName}`;
  const cached = configCache.get(cacheKey);
  
  if (cached && cached.expiry > Date.now()) {
    return cached.value as AgentConfigRow;
  }

  const { data, error } = await supabaseAdmin
    .from('agent_config')
    .select('*')
    .eq('agent_name', agentName)
    .single();

  if (error || !data) {
    return null;
  }

  configCache.set(cacheKey, {
    value: data,
    expiry: Date.now() + CACHE_TTL_MS,
  });

  return data as AgentConfigRow;
}

/**
 * Check if an agent is enabled
 */
export async function isAgentEnabled(agentName: AgentName): Promise<boolean> {
  const config = await getAgentConfig(agentName);
  return config?.is_enabled ?? false;
}

/**
 * Get a specific agent rule value
 */
export async function getAgentRule<T = unknown>(
  agentName: string,
  ruleKey: string,
  defaultValue: T
): Promise<T> {
  const cacheKey = `rule:${agentName}:${ruleKey}`;
  const cached = configCache.get(cacheKey);
  
  if (cached && cached.expiry > Date.now()) {
    return cached.value as T;
  }

  const { data, error } = await supabaseAdmin
    .from('agent_rules')
    .select('rule_value, is_enabled')
    .eq('agent_name', agentName)
    .eq('rule_key', ruleKey)
    .single();

  if (error || !data || !data.is_enabled) {
    return defaultValue;
  }

  const value = data.rule_value as T;
  
  configCache.set(cacheKey, {
    value,
    expiry: Date.now() + CACHE_TTL_MS,
  });

  return value;
}

/**
 * Get all rules for an agent
 */
export async function getAgentRules(agentName: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('agent_rules')
    .select('rule_key, rule_value')
    .eq('agent_name', agentName)
    .eq('is_enabled', true);

  if (error || !data) {
    return {};
  }

  return data.reduce((acc, rule) => {
    acc[rule.rule_key] = rule.rule_value;
    return acc;
  }, {} as Record<string, unknown>);
}

/**
 * Update agent configuration
 */
export async function updateAgentConfig(
  agentName: AgentName,
  updates: { is_enabled?: boolean; config?: Record<string, unknown> }
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('agent_config')
    .update(updates)
    .eq('agent_name', agentName);

  if (error) {
    return false;
  }

  // Invalidate cache
  configCache.delete(`config:${agentName}`);
  return true;
}

/**
 * Update an agent rule
 */
export async function updateAgentRule(
  agentName: string,
  ruleKey: string,
  ruleValue: unknown,
  isEnabled: boolean = true
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('agent_rules')
    .upsert({
      agent_name: agentName,
      rule_key: ruleKey,
      rule_value: ruleValue,
      is_enabled: isEnabled,
    }, {
      onConflict: 'agent_name,rule_key',
    });

  if (error) {
    return false;
  }

  // Invalidate cache
  configCache.delete(`rule:${agentName}:${ruleKey}`);
  return true;
}

/**
 * Clear the config cache
 */
export function clearConfigCache(): void {
  configCache.clear();
}

/**
 * Get all agent configurations
 */
export async function getAllAgentConfigs(): Promise<AgentConfigRow[]> {
  const { data, error } = await supabaseAdmin
    .from('agent_config')
    .select('*')
    .order('agent_name');

  if (error) {
    return [];
  }

  return data as AgentConfigRow[];
}

/**
 * Get all agent rules grouped by agent
 */
export async function getAllAgentRules(): Promise<Record<string, AgentRuleRow[]>> {
  const { data, error } = await supabaseAdmin
    .from('agent_rules')
    .select('*')
    .order('agent_name')
    .order('rule_key');

  if (error) {
    return {};
  }

  return (data as AgentRuleRow[]).reduce((acc, rule) => {
    if (!acc[rule.agent_name]) {
      acc[rule.agent_name] = [];
    }
    acc[rule.agent_name].push(rule);
    return acc;
  }, {} as Record<string, AgentRuleRow[]>);
}
