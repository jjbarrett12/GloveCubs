"use client";

/**
 * Agent Config Client Component
 * 
 * Interactive agent configuration with expandable panels
 */

import { useState } from "react";
import { StatusBadge, SlideOver, SlideOverSection } from "@/components/admin";

interface AgentConfig {
  id: string;
  agent_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AgentRule {
  id: string;
  agent_name: string;
  rule_key: string;
  rule_value: unknown;
  description: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function AgentConfigClient({
  configs,
  rules,
}: {
  configs: AgentConfig[];
  rules: AgentRule[];
}) {
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const rulesByAgent = rules.reduce((acc, rule) => {
    if (!acc[rule.agent_name]) acc[rule.agent_name] = [];
    acc[rule.agent_name].push(rule);
    return acc;
  }, {} as Record<string, AgentRule[]>);

  const toggleExpanded = (agentName: string) => {
    const next = new Set(expandedAgents);
    if (next.has(agentName)) {
      next.delete(agentName);
    } else {
      next.add(agentName);
    }
    setExpandedAgents(next);
  };

  const formatAgentName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <>
      <div className="space-y-3">
        {configs.map((config) => {
          const agentRules = rulesByAgent[config.agent_name] || [];
          const isExpanded = expandedAgents.has(config.agent_name);
          const enabledRules = agentRules.filter((r) => r.is_enabled).length;

          return (
            <div
              key={config.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* Header */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpanded(config.agent_name)}
              >
                {/* Expand icon */}
                <button className="text-gray-400 hover:text-gray-600">
                  <svg
                    className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>

                {/* Status indicator */}
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    config.is_enabled ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                />

                {/* Agent name */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">
                    {formatAgentName(config.agent_name)}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {agentRules.length} rules ({enabledRules} active)
                  </p>
                </div>

                {/* Status badge */}
                <StatusBadge status={config.is_enabled ? "enabled" : "disabled"} />

                {/* View button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAgent(config);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Edit
                </button>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50">
                  {/* Config JSON preview */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Configuration
                    </h4>
                    <div className="bg-white rounded border border-gray-200 p-2 overflow-x-auto">
                      <pre className="text-xs text-gray-700 font-mono">
                        {JSON.stringify(config.config, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* Rules table */}
                  {agentRules.length > 0 && (
                    <div className="px-4 py-3">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Rules
                      </h4>
                      <div className="bg-white rounded border border-gray-200 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-8">
                                On
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                                Rule
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                                Value
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                                Description
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {agentRules.map((rule) => (
                              <tr key={rule.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-center">
                                  <div
                                    className={`w-4 h-4 rounded ${
                                      rule.is_enabled
                                        ? "bg-emerald-100 text-emerald-600"
                                        : "bg-gray-100 text-gray-400"
                                    } flex items-center justify-center`}
                                  >
                                    {rule.is_enabled ? (
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                          fillRule="evenodd"
                                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    ) : (
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                          fillRule="evenodd"
                                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                    {rule.rule_key}
                                  </code>
                                </td>
                                <td className="px-3 py-2">
                                  <code className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                    {JSON.stringify(rule.rule_value)}
                                  </code>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">
                                  {rule.description || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Slide-Over */}
      <SlideOver
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        title={selectedAgent ? formatAgentName(selectedAgent.agent_name) : "Agent Config"}
        subtitle="Edit agent configuration"
        width="lg"
        footer={
          <div className="flex gap-2">
            <button
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md ${
                selectedAgent?.is_enabled
                  ? "text-red-700 bg-red-100 hover:bg-red-200"
                  : "text-green-700 bg-green-100 hover:bg-green-200"
              }`}
            >
              {selectedAgent?.is_enabled ? "Disable Agent" : "Enable Agent"}
            </button>
            <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
              Save Changes
            </button>
            <button
              onClick={() => setSelectedAgent(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        }
      >
        {selectedAgent && (
          <>
            <SlideOverSection title="Status">
              <div className="flex items-center gap-3">
                <StatusBadge
                  status={selectedAgent.is_enabled ? "enabled" : "disabled"}
                  size="md"
                />
                <span className="text-sm text-gray-600">
                  Last updated:{" "}
                  {new Date(selectedAgent.updated_at).toLocaleDateString()}
                </span>
              </div>
            </SlideOverSection>

            <SlideOverSection title="Configuration JSON">
              <div className="bg-gray-50 rounded-md border border-gray-200 p-3 overflow-x-auto">
                <pre className="text-xs text-gray-700 font-mono">
                  {JSON.stringify(selectedAgent.config, null, 2)}
                </pre>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Edit the JSON above to modify agent behavior
              </p>
            </SlideOverSection>

            {rulesByAgent[selectedAgent.agent_name]?.length > 0 && (
              <SlideOverSection title="Rules">
                <div className="space-y-2">
                  {rulesByAgent[selectedAgent.agent_name].map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200"
                    >
                      <div className="min-w-0 flex-1">
                        <code className="text-xs font-mono font-medium">
                          {rule.rule_key}
                        </code>
                        {rule.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {rule.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <code className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200">
                          {JSON.stringify(rule.rule_value)}
                        </code>
                        <button
                          className={`w-8 h-5 rounded-full transition-colors ${
                            rule.is_enabled ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                              rule.is_enabled ? "translate-x-3.5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </SlideOverSection>
            )}
          </>
        )}
      </SlideOver>
    </>
  );
}
