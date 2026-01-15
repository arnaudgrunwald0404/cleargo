"use client";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Drawer, TextInput, Textarea, Select, Checkbox, Button, Group, Stack, SimpleGrid, Avatar, Modal, Alert, Text, Tabs, Combobox, useCombobox, InputBase } from "@mantine/core";
import { IconTrash, IconAlertCircle } from '@tabler/icons-react';
import { createClient } from "@/lib/supabase/client";
import { UserDisplay } from "../UserDisplay";
import { fetchWithRateLimit, batchFetchWithRateLimit } from "@/lib/fetch-with-rate-limit";
import { PurpleLoader } from '../PurpleLoader';

const POD_PM_PLACEHOLDER = "[name of pod's product manager]";

type DataSource = {
  type: "aha_field" | "aha_description_part" | "url" | "jira_jql" | "success_metrics_defined";
  value: string;
  label?: string; // Optional label for URL sources (e.g., "Figma designs", "PRD")
};

type Item = {
  id: string;
  label: string;
  description?: string;
  category: string;
  gate: boolean;
  tier_applicability: string;
  decision_owner_email?: string | null;
  rating_timing?: number | null; // Foreign key to launch_stages.id
  status_definition_go?: string;
  status_definition_conditional?: string;
  status_definition_no_go?: string;
  is_active: boolean;
  sort_order: number;
  data_sources?: DataSource[] | null;
  created_at: string;
  updated_at: string;
};

interface LaunchStage {
  id: number;
  name: string;
  sort_order: number;
  duration_days: number | null;
  details?: string | null;
}

const TIERS = ["ALL", "TIER_1_ONLY", "TIER_1_AND_2"];
const ROLES = [
  "CPO",
  "PRODUCT_LEAD",
  "PM",
  "PMM",
  "ENG_LEAD",
  "SUPPORT_LEAD",
  "SECURITY",
  "LEARNING",
  "PRODUCT_OPS",
  "OTHER",
];

export function CriteriaManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Item>>({
    label: "",
    category: "PRODUCT_TECH",
    gate: false,
    tier_applicability: "ALL",
    is_active: true,
    sort_order: 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{ preview: any[], count: number } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [launchStages, setLaunchStages] = useState<LaunchStage[]>([]);
  const [userInfoMap, setUserInfoMap] = useState<Record<string, {
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  }>>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [criteriaToDelete, setCriteriaToDelete] = useState<Item | null>(null);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const groupedPreview = useMemo(() => {
    if (!importPreview) return {};
    return importPreview.preview.reduce((acc: Record<string, { overall: any[], details: any[] }>, item: any) => {
      const category = item.category || "OTHER";
      if (!acc[category]) {
        acc[category] = { overall: [], details: [] };
      }
      const labelLower = (item.label || "").toLowerCase();
      if (labelLower.startsWith("overall")) {
        acc[category].overall.push(item);
      } else {
        acc[category].details.push(item);
      }
      return acc;
    }, {});
  }, [importPreview]);

  // Helper function to get launch stage name by ID
  const getLaunchStageName = (stageId: number | null | undefined): string => {
    if (!stageId) return "—";
    const stage = launchStages.find(s => s.id === stageId);
    return stage?.name || `Unknown (${stageId})`;
  };

  async function handlePreviewImport() {
    if (!importFile) return;
    setImportLoading(true);
    setImportError(null);
    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const res = await fetch("/api/criteria/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to preview");
      setImportPreview(data);
    } catch (e: any) {
      setImportError(e.message);
    } finally {
      setImportLoading(false);
    }
  }

  async function handleCommitImport() {
    if (!importFile) return;
    setImportLoading(true);
    setImportError(null);
    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const res = await fetch("/api/criteria/import?commit=true", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import");

      let message = `Import successful! Created: ${data.created}, Updated: ${data.updated}`;
      if (data.errors && data.errors.length > 0) {
        message += `\n\nErrors: ${data.errors.length} item(s) failed:\n${data.errors.map((e: any) => `- ${e.item}: ${e.error}`).join('\n')}`;
      }
      if (data.parseErrors && data.parseErrors.length > 0) {
        message += `\n\nParse Errors: ${data.parseErrors.length} row(s) failed:\n${data.parseErrors.map((e: any) => `- Row ${e.row} (${e.label}): ${e.error}`).join('\n')}`;
      }
      alert(message);
      setImportPreview(null);
      setImportFile(null);
      // Refresh list
      const listRes = await fetchWithRateLimit("/api/criteria", { maxRetries: 1 });
      const listData = await listRes.json();
      setItems(listData.items || []);
    } catch (e: any) {
      setImportError(e.message);
    } finally {
      setImportLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [criteriaRes, stagesRes] = await Promise.all([
          fetchWithRateLimit("/api/criteria", { maxRetries: 1 }),
          fetchWithRateLimit("/api/launch-stages", { maxRetries: 1 })
        ]);

        const criteriaData = await criteriaRes.json();
        const loadedItems = criteriaData.items || [];
        setItems(loadedItems);

        if (stagesRes.ok) {
          const stagesData = await stagesRes.json();
          setLaunchStages(stagesData.stages || []);
        }

        // Fetch user info for all decision_owner_email values
        const emails = new Set<string>();
        loadedItems.forEach((item: Item) => {
          if (item.decision_owner_email && !item.decision_owner_email.includes('[') && !item.decision_owner_email.includes('pod')) {
            emails.add(item.decision_owner_email);
          }
        });

        if (emails.size > 0) {
          const supabase = createClient();
          const { data: users } = await supabase
            .from('app_user')
            .select('email, first_name, last_name, avatar_url')
            .in('email', Array.from(emails));

          if (users) {
            const userMap: Record<string, { first_name?: string | null; last_name?: string | null; avatar_url?: string | null }> = {};
            users.forEach(user => {
              if (user.email) {
                userMap[user.email] = {
                  first_name: user.first_name || null,
                  last_name: user.last_name || null,
                  avatar_url: user.avatar_url || null
                };
              }
            });
            setUserInfoMap(userMap);
          }
        }
      } catch (e: any) {
        setError("Failed to load criteria");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      label: form.label,
      description: form.description || "",
      category: form.category,
      gate: !!form.gate,
      tier_applicability: form.tier_applicability,
      status_definition_go: form.status_definition_go || "",
      status_definition_conditional: form.status_definition_conditional || "",
      status_definition_no_go: form.status_definition_no_go || "",
      is_active: !!form.is_active,
      sort_order: Number(form.sort_order || 0),
    };
    const res = await fetch("/api/criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create");
      return;
    }
    const { item } = await res.json();
    setItems((prev) => [...prev, item].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)));
    setForm({
      label: "",
      category: "PRODUCT_TECH",
      gate: false,
      tier_applicability: "ALL",
      is_active: true,
      sort_order: 0,
    });
    setShowCreateForm(false);
  }

  async function submitEdit(id: string, patch: Partial<Item>) {
    setError(null);
    
    // Ensure data_sources have value field for all items, and preserve label
    const cleanedPatch = { ...patch };
    if (cleanedPatch.data_sources) {
      cleanedPatch.data_sources = cleanedPatch.data_sources.map(ds => ({
        type: ds.type,
        value: ds.value ?? '', // Ensure value is always a string
        ...(ds.label !== undefined && { label: ds.label }), // Preserve label if present
      }));
    }
    
    const res = await fetch(`/api/criteria/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanedPatch),
    });
    if (!res.ok) {
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { error: `Failed to update (${res.status}): ${text.substring(0, 100)}` };
      }
      const errorMsg = data.error || "Failed to update";
      const details = data.details ? ` Details: ${JSON.stringify(data.details)}` : '';
      const errors = data.errors ? ` Errors: ${JSON.stringify(data.errors)}` : '';
      setError(errorMsg + details + errors);
      console.error('Validation error:', { status: res.status, statusText: res.statusText, data, text });
      return;
    }
    const { item } = await res.json();
    setItems((prev) => prev.map((c) => (c.id === id ? item : c)).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/criteria/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete criteria");
        return;
      }
      setItems((prev) => prev.filter((c) => c.id !== id));
      setDeleteModalOpen(false);
      setCriteriaToDelete(null);
      if (editingId === id) {
        setEditingId(null);
      }
    } catch (e: any) {
      setError(e.message || "Failed to delete criteria");
    }
  }

  async function handleReorder(draggedId: string, targetId: string, targetIndex: number) {
    const draggedIndex = items.findIndex((c) => c.id === draggedId);
    if (draggedIndex === -1) return;

    // Calculate new sort orders
    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    // Update sort_order for all affected items
    const updates = newItems.map((item, index) => ({
      id: item.id,
      sort_order: index,
    }));

    // Optimistically update local state immediately
    setItems(newItems.map((item, index) => ({ ...item, sort_order: index })));

    // Update items in batches to avoid rate limiting
    try {
      const batchSize = 5;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map((update) =>
            fetchWithRateLimit(`/api/criteria/${update.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sort_order: update.sort_order }),
              maxRetries: 1,
            })
          )
        );

        // Small delay between batches to avoid overwhelming the server
        if (i + batchSize < updates.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    } catch (error) {
      console.error("Failed to reorder:", error);
      setError("Failed to reorder items");
      // Revert optimistic update on error
      setItems(items);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <PurpleLoader size="lg" className="mb-4" />
          <p className="text-gray-600">Loading criteria...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Main ClearGO Criteria Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">ClearGO Criteria</h2>
            <p className="text-sm text-gray-500">Manage launch readiness criteria</p>
          </div>
        </div>

        {/* Import Section */}
        <div className="mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-md font-semibold text-gray-900">Import from Excel</h3>
                <p className="text-sm text-gray-500">Upload a .xlsx file to bulk create or update criteria. Matches by Label.</p>
              </div>
            </div>

            <div className="flex gap-3 items-center mb-4">
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="flex-1 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              <button
                onClick={handlePreviewImport}
                disabled={!importFile || importLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importLoading ? "Processing..." : "Preview Import"}
              </button>
            </div>

            {importError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {importError}
              </div>
            )}

            {importPreview && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-2">Preview ({importPreview.count} items)</h3>
                <div className="max-h-96 overflow-y-auto mb-4">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rating Stage</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stakeholder</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">GO Definition</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">CONDITIONAL GO</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">NO GO</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(groupedPreview).map(([category, { overall, details }]) => {
                        const isExpanded = expandedCategories.has(category);
                        const hasDetails = details.length > 0;
                        const showOverall = overall.length > 0;

                        return (
                          <React.Fragment key={category}>
                            {showOverall ? overall.map((item: any, i: number) => (
                              <React.Fragment key={`${category}-overall-${i}`}>
                                <tr className="bg-gray-50 hover:bg-gray-100">
                                  <td className="px-3 py-2">
                                    {hasDetails && (
                                      <button
                                        onClick={() => toggleCategory(category)}
                                        className="text-gray-500 hover:text-gray-700 transition-transform"
                                        style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.category}</td>
                                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.label}</td>
                                  <td className="px-3 py-2 text-sm text-gray-600">{getLaunchStageName(item.rating_timing)}</td>
                                  <td className="px-3 py-2 text-sm text-gray-600">
                                    {item.decision_owner_email ? (
                                      <UserDisplay
                                        email={item.decision_owner_email}
                                        firstName={userInfoMap[item.decision_owner_email]?.first_name}
                                        lastName={userInfoMap[item.decision_owner_email]?.last_name}
                                        avatarUrl={userInfoMap[item.decision_owner_email]?.avatar_url}
                                        size="sm"
                                      />
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={item.status_definition_go || ""}>
                                    {item.status_definition_go || <span className="text-gray-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={item.status_definition_conditional || ""}>
                                    {item.status_definition_conditional || <span className="text-gray-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={item.status_definition_no_go || ""}>
                                    {item.status_definition_no_go || <span className="text-gray-400">—</span>}
                                  </td>
                                </tr>
                                {isExpanded && hasDetails && details.map((detailItem: any, j: number) => (
                                  <tr key={`${category}-detail-${j}`} className="bg-white">
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2 text-sm text-gray-500 pl-8">{detailItem.category}</td>
                                    <td className="px-3 py-2 text-sm text-gray-600 pl-8">{detailItem.label}</td>
                                    <td className="px-3 py-2 text-sm text-gray-600 pl-8">{getLaunchStageName(detailItem.rating_timing)}</td>
                                    <td className="px-3 py-2 text-sm text-gray-600 pl-8">{detailItem.decision_owner_email || <span className="text-gray-400">—</span>}</td>
                                    <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={detailItem.status_definition_go || ""}>
                                      {detailItem.status_definition_go || <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={detailItem.status_definition_conditional || ""}>
                                      {detailItem.status_definition_conditional || <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={detailItem.status_definition_no_go || ""}>
                                      {detailItem.status_definition_no_go || <span className="text-gray-400">—</span>}
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            )) : (
                              // No overall item - show all details directly without collapse
                              details.map((detailItem: any, j: number) => (
                                <tr key={`${category}-detail-${j}`} className="bg-white">
                                  <td className="px-3 py-2"></td>
                                  <td className="px-3 py-2 text-sm text-gray-600">{detailItem.category}</td>
                                  <td className="px-3 py-2 text-sm text-gray-900">{detailItem.label}</td>
                                  <td className="px-3 py-2 text-sm text-gray-600">{getLaunchStageName(detailItem.rating_timing)}</td>
                                  <td className="px-3 py-2 text-sm text-gray-600">{detailItem.decision_owner_email || <span className="text-gray-400">—</span>}</td>
                                  <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={detailItem.status_definition_go || ""}>
                                    {detailItem.status_definition_go || <span className="text-gray-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={detailItem.status_definition_conditional || ""}>
                                    {detailItem.status_definition_conditional || <span className="text-gray-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={detailItem.status_definition_no_go || ""}>
                                    {detailItem.status_definition_no_go || <span className="text-gray-400">—</span>}
                                  </td>
                                </tr>
                              ))
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCommitImport}
                    disabled={importLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50"
                  >
                    {importLoading ? "Importing..." : "Confirm & Import"}
                  </button>
                  <button
                    onClick={() => setImportPreview(null)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Existing Criteria List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-md font-semibold text-gray-900">Existing Criteria</h3>
                  <p className="text-sm text-gray-500">{items.length} criteria configured</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                + New
              </button>
            </div>
          </div>

          <div>
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Label/Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ready by</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((c, index) => (
                  <tr
                    key={c.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (draggedId !== c.id) {
                        e.currentTarget.classList.add("bg-blue-50");
                      }
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove("bg-blue-50");
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("bg-blue-50");
                      if (draggedId && draggedId !== c.id) {
                        await handleReorder(draggedId, c.id, index);
                      }
                      setDraggedId(null);
                    }}
                    className={`hover:bg-gray-50 cursor-pointer ${draggedId === c.id ? "opacity-50" : ""}`}
                    onClick={(e) => {
                      // Don't open drawer if dragging or clicking on drag handle
                      if (!draggedId && !(e.target as HTMLElement).closest('td:first-child')) {
                        setEditingId(c.id);
                      }
                    }}
                  >
                    <td
                      className="px-4 py-4 whitespace-nowrap text-gray-400 cursor-move"
                      onClick={(e) => e.stopPropagation()}
                      draggable
                      onDragStart={(e) => {
                        setDraggedId(c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-4 py-4 text-sm cursor-pointer">
                      <div className="font-medium text-gray-900">{c.label}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{c.category}</div>
                      {c.description && <div className="text-gray-400 text-xs mt-1">{c.description}</div>}
                    </td>
                    <td
                      className="px-4 py-4 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        size="xs"
                        checked={!!c.gate}
                        onChange={(e) => {
                          e.stopPropagation();
                          submitEdit(c.id, { gate: e.currentTarget.checked });
                        }}
                        aria-label="Gate"
                        title="Gate"
                      />
                    </td>
                    <td
                      className="px-4 py-4 whitespace-nowrap text-sm text-gray-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Select
                        value={c.tier_applicability}
                        onChange={(value) => {
                          if (!value) return;
                          submitEdit(c.id, { tier_applicability: value });
                        }}
                        data={TIERS}
                        size="xs"
                      />
                    </td>
                    <td
                      className="px-4 py-4 whitespace-nowrap text-sm text-gray-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Select
                        value={c.rating_timing?.toString() || launchStages[0]?.id.toString() || ""}
                        onChange={(value) => {
                          if (value) {
                            submitEdit(c.id, { rating_timing: Number(value) });
                          }
                        }}
                        data={launchStages.map(stage => ({ value: stage.id.toString(), label: stage.name }))}
                        size="xs"
                        allowDeselect={false}
                        comboboxProps={{ width: 250, position: 'bottom-start' }}
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      <svg className="w-5 h-5 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Drawer */}
      {editingId && (() => {
        const editingItem = items.find(i => i.id === editingId);
        return editingItem ? (
          <EditDrawer
            item={editingItem}
            opened={!!editingId}
            onClose={() => setEditingId(null)}
            onSave={(patch) => {
              submitEdit(editingId, patch);
              setEditingId(null);
            }}
            onDelete={() => {
              setCriteriaToDelete(editingItem);
              setDeleteModalOpen(true);
            }}
            launchStages={launchStages}
          />
        ) : null;
      })()}

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setCriteriaToDelete(null);
        }}
        title={
          <div className="flex items-center gap-2">
            <IconTrash size={20} className="text-red-600" />
            <span className="font-semibold" style={{ fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>Delete Criteria</span>
          </div>
        }
        centered
        size="md"
      >
        <div className="space-y-4">
          <Text size="sm" c="dimmed">
            Are you sure you want to delete <strong>"{criteriaToDelete?.label}"</strong>?
          </Text>
          <Alert icon={<IconAlertCircle size={16} />} title="Warning" color="red" variant="light">
            This action cannot be undone. This criteria will be permanently removed from all epics.
          </Alert>
          <Group justify="flex-end" mt="xl">
            <Button
              variant="subtle"
              onClick={() => {
                setDeleteModalOpen(false);
                setCriteriaToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (criteriaToDelete) {
                  handleDelete(criteriaToDelete.id);
                }
              }}
              leftSection={<IconTrash size={16} />}
            >
              Delete Criteria
            </Button>
          </Group>
        </div>
      </Modal>
    </div>
  );
}

function EditDrawer({ item, opened, onClose, onSave, onDelete, launchStages }: { item: Item; opened: boolean; onClose: () => void; onSave: (patch: Partial<Item>) => void; onDelete: () => void; launchStages: LaunchStage[] }) {
  const [patch, setPatch] = useState<Partial<Item>>({ ...item });
  const [users, setUsers] = useState<Array<{ email: string; first_name?: string | null; last_name?: string | null; avatar_url?: string | null }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [ahaFields, setAhaFields] = useState<Array<{ alias: string; label: string; type: string }>>([]);
  const [ahaFieldsLoading, setAhaFieldsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("details");
  
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  useEffect(() => {
    if (opened) {
      setPatch({ ...item });
      setActiveTab("details");
      fetchUsers();
      fetchAhaFields();
    }
  }, [opened, item]);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetchWithRateLimit("/api/users", { maxRetries: 1 });
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error: any) {
      console.error("Failed to fetch users:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchAhaFields = async () => {
    setAhaFieldsLoading(true);
    try {
      const res = await fetchWithRateLimit("/api/settings/aha-fields", { maxRetries: 1 });
      if (!res.ok) throw new Error("Failed to fetch Aha fields");
      const data = await res.json();
      setAhaFields(data.fields || []);
    } catch (error: any) {
      console.error("Failed to fetch Aha fields:", error);
    } finally {
      setAhaFieldsLoading(false);
    }
  };

  const getInitials = (email: string, firstName?: string | null, lastName?: string | null) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const getColor = (email: string) => {
    const colors = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'indigo'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const selectedUser = users.find(u => u.email === patch.decision_owner_email);
  const isCustomEmail = patch.decision_owner_email && !selectedUser && patch.decision_owner_email !== POD_PM_PLACEHOLDER;
  const isPodPmPlaceholder = patch.decision_owner_email === POD_PM_PLACEHOLDER;

  const userSelectData = [
    { value: "", label: "None", user: null },
    { value: POD_PM_PLACEHOLDER, label: "PM of the pod", user: null, isPlaceholder: true },
    ...users.map(u => ({
      value: u.email,
      label: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email,
      user: u,
    })),
    // Include custom email if it exists and doesn't match a user
    ...(isCustomEmail ? [{ value: patch.decision_owner_email!, label: patch.decision_owner_email!, user: null }] : [])
  ];

  const selectedOption = userSelectData.find(opt => opt.value === (patch.decision_owner_email || ""));
  const selectedLabel = selectedOption?.label || "";

  const dataSources = patch.data_sources || [];
  const canAddDataSource = dataSources.length < 5;

  const addDataSource = () => {
    if (canAddDataSource) {
      setPatch({
        ...patch,
        data_sources: [...dataSources, { type: "aha_field", value: "" }],
      });
    }
  };

  const updateDataSource = (index: number, updates: Partial<DataSource>) => {
    const updated = [...dataSources];
    updated[index] = { ...updated[index], ...updates };
    // For URL type, don't store the value in settings - it will be entered per epic
    if (updates.type === 'url' || updated[index].type === 'url') {
      updated[index].value = '';
    }
    setPatch({ ...patch, data_sources: updated });
  };

  const removeDataSource = (index: number) => {
    const updated = dataSources.filter((_, i) => i !== index);
    setPatch({ ...patch, data_sources: updated.length > 0 ? updated : null });
  };

  const ahaFieldSelectData = ahaFields.map(field => ({
    value: field.alias,
    label: `${field.label} (${field.type === 'standard' ? 'Standard' : 'Custom'})`,
  }));

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Edit Criterion"
      position="right"
      size="xl"
      padding={0}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 80px)',
          overflow: 'hidden',
        },
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--mantine-spacing-lg)', minHeight: 0 }}>
          <Stack gap="md">
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <TextInput
                  label="Label"
                  value={patch.label || ""}
                  onChange={(e) => setPatch({ ...patch, label: e.target.value })}
                  required
                />
              </div>
              <div style={{ width: '120px', flexShrink: 0 }}>
                <TextInput
                  label="Sort Order"
                  type="number"
                  value={(patch.sort_order ?? 0) + 1}
                  onChange={(e) => setPatch({ ...patch, sort_order: Math.max(0, Number(e.target.value) - 1) })}
                />
              </div>
            </div>

            <TextInput
              label="Category"
              value={patch.category || ""}
              onChange={(e) => setPatch({ ...patch, category: e.target.value })}
              required
            />

            <Tabs value={activeTab} onChange={(value) => setActiveTab(value || "details")}>
          <Tabs.List>
            <Tabs.Tab value="details">Details</Tabs.Tab>
            <Tabs.Tab value="data-source">Data Source</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="details" pt="md">
            <Stack gap="md">
              <Checkbox
                label="Gate (blocks launch if NO_GO)"
                checked={!!patch.gate}
                onChange={(e) => setPatch({ ...patch, gate: e.target.checked })}
              />

              <Select
                label="Tier Applicability"
                value={patch.tier_applicability || ""}
                onChange={(value) => setPatch({ ...patch, tier_applicability: value || "" })}
                data={TIERS}
                required
              />

              <Select
                label="Rating Stage"
                value={patch.rating_timing?.toString() || ""}
                onChange={(value) => setPatch({ ...patch, rating_timing: value ? Number(value) : undefined })}
                data={[
                  { value: "", label: "None" },
                  ...launchStages.map(stage => ({ value: stage.id.toString(), label: stage.name }))
                ]}
                placeholder="Select launch stage"
                description="Launch stage by which the criteria needs to be rated"
                clearable
              />

              <Combobox
                store={combobox}
                withinPortal={false}
                onOptionSubmit={(value) => {
                  setPatch({ ...patch, decision_owner_email: value === "" ? undefined : value });
                  combobox.closeDropdown();
                }}
              >
                <Combobox.Target>
                  <InputBase
                    component="button"
                    type="button"
                    pointer
                    rightSection={<Combobox.Chevron />}
                    rightSectionPointerEvents="none"
                    onClick={() => combobox.toggleDropdown()}
                    label="Decision Owner"
                    disabled={usersLoading}
                  >
                    {selectedLabel || (
                      <Text component="span" c="dimmed">
                        Select a user
                      </Text>
                    )}
                  </InputBase>
                </Combobox.Target>

                <Combobox.Dropdown>
                  <Combobox.Options>
                    {userSelectData.map((item) => {
                      const user = item.user;
                      const isPlaceholder = item.value === POD_PM_PLACEHOLDER;
                      return (
                        <Combobox.Option value={item.value} key={item.value}>
                          <Group gap="xs">
                            {user && (
                              <Avatar
                                src={user.avatar_url || undefined}
                                radius="xl"
                                size="sm"
                                color={getColor(user.email)}
                              >
                                {getInitials(user.email, user.first_name, user.last_name)}
                              </Avatar>
                            )}
                            {isPlaceholder && (
                              <Avatar radius="xl" size="sm" color="gray">
                                PM
                              </Avatar>
                            )}
                            {!user && !isPlaceholder && item.value !== "" && (
                              <Avatar radius="xl" size="sm" color="gray">
                                {item.value.substring(0, 2).toUpperCase()}
                              </Avatar>
                            )}
                            <span>{item.label}</span>
                          </Group>
                        </Combobox.Option>
                      );
                    })}
                  </Combobox.Options>
                </Combobox.Dropdown>
              </Combobox>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status Definitions</label>
                <SimpleGrid cols={3} spacing="md">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-green-900 mb-2">GO Definition</label>
                    <Textarea
                      value={patch.status_definition_go || ""}
                      onChange={(e) => setPatch({ ...patch, status_definition_go: e.target.value || undefined })}
                      placeholder="Definition for GO status"
                      minRows={8}
                      autosize
                      maxRows={20}
                      styles={{
                        input: {
                          backgroundColor: 'white',
                          border: '1px solid #D1D5DB',
                          borderRadius: '0.5rem',
                          padding: '0.75rem',
                        }
                      }}
                    />
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-orange-900 mb-2">CONDITIONAL GO Definition</label>
                    <Textarea
                      value={patch.status_definition_conditional || ""}
                      onChange={(e) => setPatch({ ...patch, status_definition_conditional: e.target.value || undefined })}
                      placeholder="Definition for CONDITIONAL GO status"
                      minRows={8}
                      autosize
                      maxRows={20}
                      styles={{
                        input: {
                          backgroundColor: 'white',
                          border: '1px solid #D1D5DB',
                          borderRadius: '0.5rem',
                          padding: '0.75rem',
                        }
                      }}
                    />
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-red-900 mb-2">NO GO Definition</label>
                    <Textarea
                      value={patch.status_definition_no_go || ""}
                      onChange={(e) => setPatch({ ...patch, status_definition_no_go: e.target.value || undefined })}
                      placeholder="Definition for NO GO status"
                      minRows={8}
                      autosize
                      maxRows={20}
                      styles={{
                        input: {
                          backgroundColor: 'white',
                          border: '1px solid #D1D5DB',
                          borderRadius: '0.5rem',
                          padding: '0.75rem',
                        }
                      }}
                    />
                  </div>
                </SimpleGrid>
              </div>

              <Checkbox
                label="Active"
                checked={!!patch.is_active}
                onChange={(e) => setPatch({ ...patch, is_active: e.target.checked })}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="data-source" pt="md">
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Add up to 5 data sources for this criterion. Each source can be an Aha field, an Aha Description part, or a URL.
              </Text>

              {dataSources.map((source, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <Group justify="space-between" mb="sm">
                    <Text size="sm" fw={500}>Data Source {index + 1}</Text>
                    <Button
                      variant="subtle"
                      color="red"
                      size="xs"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => removeDataSource(index)}
                    >
                      Remove
                    </Button>
                  </Group>

                  <Stack gap="sm">
                    <Select
                      label="Source Type"
                      value={source.type}
                      onChange={(value) => {
                        if (value) {
                          if (value === "jira_jql") {
                            updateDataSource(index, {
                              type: value as DataSource["type"],
                              label: "Open Jira tickets",
                              value: "parent = {{JIRA_EPIC}} and statusCategory != Done",
                            });
                          } else if (value === "success_metrics_defined") {
                            updateDataSource(index, {
                              type: value as DataSource["type"],
                              value: "",
                            });
                          } else {
                            updateDataSource(index, { type: value as DataSource["type"], value: "" });
                          }
                        }
                      }}
                      data={[
                        { value: "aha_field", label: "Aha Field" },
                        { value: "aha_description_part", label: "Aha Description Part" },
                        { value: "url", label: "URL" },
                        { value: "jira_jql", label: "Jira (open tickets in epic)" },
                        { value: "success_metrics_defined", label: "Success metrics defined" },
                      ]}
                      required
                    />

                    {source.type === "aha_field" && (
                      <Select
                        label="Aha Field"
                        value={source.value}
                        onChange={(value) => updateDataSource(index, { value: value || "" })}
                        data={ahaFieldSelectData}
                        placeholder="Select an Aha field"
                        searchable
                        disabled={ahaFieldsLoading}
                        required
                      />
                    )}

                    {source.type === "aha_description_part" && (
                      <TextInput
                        label="Description Part"
                        value={source.value}
                        onChange={(e) => updateDataSource(index, { value: e.target.value })}
                        placeholder="Enter the part/keyword from the Aha Description field"
                        required
                      />
                    )}

                    {source.type === "url" && (
                      <>
                        <TextInput
                          label="Expected link type (optional)"
                          value={source.label || ""}
                          onChange={(e) => updateDataSource(index, { label: e.target.value })}
                          placeholder="e.g., Figma designs, PRD, competitive analysis"
                          description="Examples: figma designs, PRD, competitive analysis"
                        />
                        <Text size="xs" c="dimmed" mt="xs">
                          URL will be entered in the epic detail page drawer
                        </Text>
                      </>
                    )}

                    {source.type === "jira_jql" && (
                      <>
                        <TextInput
                          label="Link label"
                          value={source.label || "Open Jira tickets"}
                          onChange={(e) => updateDataSource(index, { label: e.target.value })}
                        />
                        <TextInput
                          label="JQL template"
                          value={source.value || "parent = {{JIRA_EPIC}} and statusCategory != Done"}
                          onChange={(e) => updateDataSource(index, { value: e.target.value })}
                          description='Searches Jira API by epic name to find the epic key. Falls back to AHA “Integrations” field if not found. Use {{JIRA_EPIC}} as placeholder.'
                        />
                      </>
                    )}

                    {source.type === "success_metrics_defined" && (
                      <Text size="sm" c="dimmed">
                        This data source automatically checks if the epic has at least one success metric defined. The icon will show a 📊 emoji when metrics are present.
                      </Text>
                    )}
                  </Stack>
                </div>
              ))}

              {canAddDataSource && (
                <Button
                  variant="outline"
                  onClick={addDataSource}
                  fullWidth
                >
                  + Add Data Source
                </Button>
              )}

              {!canAddDataSource && (
                <Alert icon={<IconAlertCircle size={16} />} color="blue" title="Maximum Reached">
                  You have reached the maximum of 5 data sources.
                </Alert>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
          </Stack>
        </div>
        <div style={{ 
          borderTop: '1px solid var(--mantine-color-gray-3)', 
          padding: '20px var(--mantine-spacing-lg) 0',
          backgroundColor: 'var(--mantine-color-body)',
          flexShrink: 0
        }}>
          <Group justify="space-between">
            <Button 
              variant="outline" 
              color="red" 
              leftSection={<IconTrash size={16} />} 
              onClick={onDelete}
            >
              Delete
            </Button>
            <Group>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => onSave(patch)}>
                Save
              </Button>
            </Group>
          </Group>
        </div>
    </Drawer>
  );
}
