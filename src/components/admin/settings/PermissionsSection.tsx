"use client";
import React from "react";
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
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-500">
            Configure which roles may perform each capability. Defaults come from code; overrides are saved in app settings.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
              onClick={() => {
                const next = { ...defaultRules } as Record<string, string[]>;
                setRules(next);
                autoSavePermissions(next);
              }}
            >
              Reset All to Defaults
            </button>
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
              <table className="min-w-full divide-y divide-gray-200">
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
                  {capabilities.map((cap) => {
                    const isOverridden = (() => {
                      const a = new Set((rules[cap.id] || []).slice().sort());
                      const b = new Set((defaultRules[cap.id] || []).slice().sort());
                      if (a.size !== b.size) return true;
                      for (const v of a) if (!b.has(v)) return true;
                      return false;
                    })();
                    return (
                      <tr key={cap.id}>
                        <td className="px-4 py-2 text-sm">
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                            {cap.label}
                            {isOverridden && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">Overridden</span>
                            )}
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
