'use client';
import React from 'react';
import type { AppSettings } from '@/lib/settings-db';

type AhaField = { alias: string; label: string; key: string | null; type?: string };

type SyncResult = {
  success: boolean;
  message: string;
  synced: number;
  failed: number;
  total: number;
  errors?: Array<{ aha_id: string; name: string; error: string }>;
};

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  availableAhaFields: AhaField[];
  loading: boolean;
  draggedFieldAlias: string | null;
  setDraggedFieldAlias: (alias: string | null) => void;
  saving: boolean;
  syncing: boolean;
  syncResult: SyncResult | null;
  onAutoSaveFields: (fields: string[]) => void;
  onSynchronize: () => void;
};

export default function AhaFieldsSection({
  settings,
  setSettings,
  availableAhaFields,
  loading,
  draggedFieldAlias,
  setDraggedFieldAlias,
  saving,
  syncing,
  syncResult,
  onAutoSaveFields,
  onSynchronize,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">AHA Epic Fields</h2>
              <p className="text-sm text-gray-500">
                Configure which AHA fields (standard and custom) should be loaded with each epic
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSynchronize}
            disabled={syncing}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {syncing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Synchronizing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Synchronize
              </>
            )}
          </button>
        </div>

        {syncResult && (
          <div
            className={`mb-6 p-4 rounded-lg border ${syncResult.failed > 0 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-green-50 border-green-200 text-green-800'}`}
          >
            <div className="flex items-start gap-2">
              {syncResult.failed > 0 ? (
                <svg
                  className="w-5 h-5 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              <div className="flex-1">
                <p className="font-medium">{syncResult.message}</p>
                <p className="text-sm mt-1">
                  {syncResult.synced} succeeded, {syncResult.failed} failed out of{' '}
                  {syncResult.total} total epics.
                </p>
                {syncResult.errors && syncResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer hover:underline">
                      Show errors
                    </summary>
                    <ul className="mt-2 text-sm list-disc list-inside space-y-1">
                      {syncResult.errors.map((err, idx) => (
                        <li key={idx}>
                          <strong>{err.name}</strong> ({err.aha_id}): {err.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading available fields...</div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              Select the fields that should be loaded from AHA and stored with each epic. Standard
              fields (like ID, Name, Release) are always available from AHA. Custom fields can be
              added or removed without schema changes.
            </p>

            {/* Selected fields (draggable) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Selected Fields ({settings.aha_fields_to_load?.length || 0})
              </h3>
              <div className="border-2 border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                {settings.aha_fields_to_load && settings.aha_fields_to_load.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200 table-fixed">
                    <colgroup>
                      <col className="w-16" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-16"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                          Alias
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-24">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {settings.aha_fields_to_load
                        ?.map((alias) => availableAhaFields.find((f) => f.alias === alias))
                        .filter(Boolean)
                        .map((field) => field as AhaField)
                        .map((field) => (
                          <tr
                            key={field.alias}
                            draggable
                            onDragStart={() => setDraggedFieldAlias(field.alias)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (draggedFieldAlias !== field.alias) {
                                e.currentTarget.classList.add('bg-blue-100');
                              }
                            }}
                            onDragLeave={(e) => {
                              e.currentTarget.classList.remove('bg-blue-100');
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.classList.remove('bg-blue-100');
                              if (draggedFieldAlias && draggedFieldAlias !== field.alias) {
                                const currentFields = settings.aha_fields_to_load || [];
                                const draggedIndex = currentFields.indexOf(draggedFieldAlias);
                                const targetIndex = currentFields.indexOf(field.alias);
                                if (draggedIndex !== -1 && targetIndex !== -1) {
                                  const newFields = [...currentFields];
                                  const [draggedItem] = newFields.splice(draggedIndex, 1);
                                  newFields.splice(targetIndex, 0, draggedItem);
                                  setSettings({ ...settings, aha_fields_to_load: newFields });
                                  onAutoSaveFields(newFields);
                                }
                              }
                              setDraggedFieldAlias(null);
                            }}
                            className={`cursor-move hover:bg-indigo-50 transition-colors ${draggedFieldAlias === field.alias ? 'opacity-50' : ''}`}
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <svg
                                  className="w-5 h-5 text-gray-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 8h16M4 16h16"
                                  />
                                </svg>
                                <input
                                  type="checkbox"
                                  checked={true}
                                  onChange={() => {
                                    const currentFields = settings.aha_fields_to_load || [];
                                    const newFields = currentFields.filter(
                                      (f) => f !== field.alias
                                    );
                                    setSettings({ ...settings, aha_fields_to_load: newFields });
                                    onAutoSaveFields(newFields);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-medium text-gray-900">{field.label}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700">
                                {field.alias}
                              </code>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap w-24">
                              {field.type === 'standard' ? (
                                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                  Standard
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                                  Custom
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-gray-400 italic text-center py-4">
                    No fields selected. Select fields from the list below.
                  </div>
                )}
              </div>
            </div>

            {/* Unselected Standard Fields */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Available Standard Fields (
                {
                  availableAhaFields.filter(
                    (f) => f.type === 'standard' && !settings.aha_fields_to_load?.includes(f.alias)
                  ).length
                }
                )
              </h3>
              <div className="border-2 border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                {availableAhaFields.filter(
                  (f) => f.type === 'standard' && !settings.aha_fields_to_load?.includes(f.alias)
                ).length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200 table-fixed">
                    <colgroup>
                      <col className="w-16" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-16"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                          Alias
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-24">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {availableAhaFields
                        .filter(
                          (field) =>
                            field.type === 'standard' &&
                            !settings.aha_fields_to_load?.includes(field.alias)
                        )
                        .map((field) => (
                          <tr key={field.alias} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={false}
                                onChange={() => {
                                  const currentFields = settings.aha_fields_to_load || [];
                                  // Prevent duplicates
                                  if (currentFields.includes(field.alias)) return;
                                  const newFields = [...currentFields, field.alias];
                                  setSettings({ ...settings, aha_fields_to_load: newFields });
                                  onAutoSaveFields(newFields);
                                }}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-medium text-gray-900">{field.label}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700">
                                {field.alias}
                              </code>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap w-24">
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                Standard
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-gray-400 italic text-center py-4">
                    All standard fields are selected.
                  </div>
                )}
              </div>
            </div>

            {/* Unselected Custom Fields */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Available Custom Fields (
                {
                  availableAhaFields.filter(
                    (f) => f.type !== 'standard' && !settings.aha_fields_to_load?.includes(f.alias)
                  ).length
                }
                )
              </h3>
              <div className="border-2 border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                {availableAhaFields.filter(
                  (f) => f.type !== 'standard' && !settings.aha_fields_to_load?.includes(f.alias)
                ).length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200 table-fixed">
                    <colgroup>
                      <col className="w-16" />
                      <col className="w-auto" />
                      <col className="w-auto" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-16"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                          Label
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                          Alias
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-24">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {availableAhaFields
                        .filter(
                          (field) =>
                            field.type !== 'standard' &&
                            !settings.aha_fields_to_load?.includes(field.alias)
                        )
                        .map((field) => (
                          <tr key={field.alias} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={false}
                                onChange={() => {
                                  const currentFields = settings.aha_fields_to_load || [];
                                  // Prevent duplicates
                                  if (currentFields.includes(field.alias)) return;
                                  const newFields = [...currentFields, field.alias];
                                  setSettings({ ...settings, aha_fields_to_load: newFields });
                                  onAutoSaveFields(newFields);
                                }}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-medium text-gray-900">{field.label}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700">
                                {field.alias}
                              </code>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap w-24">
                              {field.type === 'standard' ? (
                                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                  Standard
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                                  Custom
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-sm text-gray-400 italic text-center py-4">
                    All fields are selected.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
