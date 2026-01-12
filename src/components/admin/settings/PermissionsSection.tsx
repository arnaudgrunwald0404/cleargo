"use client";
import React, { useState, useMemo } from "react";
import { PurpleLoader } from '../../PurpleLoader';

type Capability = { id: string; label: string; description: string };

type Props = {
  rolesList: string[];
  capabilities: Capability[];
  rules: Record<string, string[]>;
  defaultRules: Record<string, string[]>;
  setRules: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  loading: boolean;
  saving: boolean;
  autoSavePermissions: (mapping: Record<string, string[]>) => Promise<void> | void;
};

function getCapabilityCategory(capabilityId: string): string {
  if (capabilityId.startsWith("users.")) {
    return "Users";
  }
  if (capabilityId === "launchStages.manage" || capabilityId === "releases.manage") {
    return "Releases";
  }
  if (capabilityId.startsWith("criteria.")) {
    return "Go/no-go Criteria";
  }
  if (capabilityId.startsWith("launch.")) {
    return "Epics";
  }
  if (capabilityId.startsWith("settings.emailTemplates")) {
    return "Email Communication";
  }
  if (capabilityId.startsWith("settings.aha") || capabilityId.startsWith("settings.webhookUrl")) {
    return "Aha Integration";
  }
  return "Other";
}

export default function PermissionsSection({
  rolesList,
  capabilities,
  rules,
  defaultRules,
  setRules,
  loading,
  saving,
  autoSavePermissions,
}: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(["Users"])
  );

  const groupedCapabilities = useMemo(() => {
    const groups: Record<string, Capability[]> = {};
    capabilities.forEach((cap) => {
      const category = getCapabilityCategory(cap.id);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(cap);
    });
    return groups;
  }, [capabilities]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Permissions</h2>
            <p className="text-sm text-gray-500">Define which roles can perform each action</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4">
          <div className="text-sm text-gray-500">
            Configure which roles may perform each capability. Defaults come from code; overrides are saved in app settings.
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
            <PurpleLoader size="sm" />
            <span>Loading...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <colgroup>
                  <col style={{ width: '70%', minWidth: '300px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capability</th>
                    {rolesList.map((r) => (
                      <th key={r} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div className="flex flex-col items-center gap-1">
                          <div>{r}</div>
                          <div className="flex gap-2 text-[10px] text-indigo-700">
                            <button
                              className="underline"
                              onClick={() => {
                                const next: Record<string, string[]> = { ...rules };
                                for (const cap of capabilities) {
                                  const set = new Set(next[cap.id] || []);
                                  set.add(r);
                                  next[cap.id] = Array.from(set);
                                }
                                setRules(next);
                                autoSavePermissions(next);
                              }}
                            >All</button>
                            <span className="text-gray-300">|</span>
                            <button
                              className="underline"
                              onClick={() => {
                                const next: Record<string, string[]> = { ...rules };
                                for (const cap of capabilities) {
                                  const set = new Set(next[cap.id] || []);
                                  set.delete(r);
                                  next[cap.id] = Array.from(set);
                                }
                                setRules(next);
                                autoSavePermissions(next);
                              }}
                            >None</button>
                          </div>
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(groupedCapabilities)
                    .sort(([a], [b]) => {
                      const order = ["Users", "Releases", "Go/no-go Criteria", "Epics", "Email Communication", "Aha Integration", "Other"];
                      const indexA = order.indexOf(a);
                      const indexB = order.indexOf(b);
                      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                      if (indexA === -1) return 1;
                      if (indexB === -1) return -1;
                      return indexA - indexB;
                    })
                    .map(([category, categoryCapabilities]) => {
                    const isExpanded = expandedCategories.has(category);
                    return (
                      <React.Fragment key={category}>
                        <tr className="bg-gray-50 hover:bg-gray-100">
                          <td className="px-4 py-3" colSpan={rolesList.length + 2}>
                            <button
                              onClick={() => toggleCategory(category)}
                              className="flex items-center gap-2 w-full text-left hover:text-indigo-700 transition-colors"
                            >
                              <svg
                                className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="font-semibold text-gray-900">{category}</span>
                              <span className="text-sm text-gray-500">({categoryCapabilities.length})</span>
                            </button>
                          </td>
                        </tr>
                        {isExpanded &&
                          categoryCapabilities.map((cap) => {
                            return (
                              <tr key={cap.id}>
                                <td className="px-4 py-2 text-sm pl-8">
                                  <div className="font-medium text-gray-900">
                                    {cap.label}
                                  </div>
                                  <div className="text-xs text-gray-500">{cap.description}</div>
                                </td>
                                {rolesList.map((r) => {
                                  const enabled = (rules[cap.id] || []).includes(r);
                                  return (
                                    <td key={`${cap.id}-${r}`} className="px-4 py-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => {
                                          const next = { ...rules } as Record<string, string[]>;
                                          const current = new Set(next[cap.id] || []);
                                          if (e.target.checked) current.add(r); else current.delete(r);
                                          next[cap.id] = Array.from(current);
                                          setRules(next);
                                          autoSavePermissions(next);
                                        }}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-2 text-center text-xs">
                                  <div className="inline-flex items-center gap-3">
                                    <button
                                      className="text-indigo-700 underline"
                                      onClick={() => {
                                        const next = { ...rules } as Record<string, string[]>;
                                        next[cap.id] = rolesList.slice();
                                        setRules(next);
                                        autoSavePermissions(next);
                                      }}
                                    >All</button>
                                    <button
                                      className="text-indigo-700 underline"
                                      onClick={() => {
                                        const next = { ...rules } as Record<string, string[]>;
                                        next[cap.id] = [];
                                        setRules(next);
                                        autoSavePermissions(next);
                                      }}
                                    >None</button>
                                    <button
                                      className="text-gray-600 underline"
                                      onClick={() => {
                                        const next = { ...rules } as Record<string, string[]>;
                                        next[cap.id] = (defaultRules[cap.id] || []).slice();
                                        setRules(next);
                                        autoSavePermissions(next);
                                      }}
                                    >Reset</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {saving && (
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
