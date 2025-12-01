"use client";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Drawer, TextInput, Textarea, Select, Checkbox, Button, Group, Stack, SimpleGrid, Avatar } from "@mantine/core";

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
      const listRes = await fetch("/api/criteria");
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
          fetch("/api/criteria"),
          fetch("/api/launch-stages")
        ]);
        
        const criteriaData = await criteriaRes.json();
        setItems(criteriaData.items || []);
        
        if (stagesRes.ok) {
          const stagesData = await stagesRes.json();
          setLaunchStages(stagesData.stages || []);
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
    const res = await fetch(`/api/criteria/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update");
      return;
    }
    const { item } = await res.json();
    setItems((prev) => prev.map((c) => (c.id === id ? item : c)).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)));
    setEditingId(null);
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

    // Update all items in parallel
    try {
      await Promise.all(
        updates.map((update) =>
          fetch(`/api/criteria/${update.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: update.sort_order }),
          })
        )
      );

      // Update local state
      setItems(newItems.map((item, index) => ({ ...item, sort_order: index })));
    } catch (error) {
      console.error("Failed to reorder:", error);
      setError("Failed to reorder items");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
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
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rating Timing</th>
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
                                <td className="px-3 py-2 text-sm text-gray-600">{item.decision_owner_email || <span className="text-gray-400">—</span>}</td>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
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
                    <td className="px-4 py-4 whitespace-nowrap">
                      {c.gate ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">Gate</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{c.tier_applicability}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {c.is_active ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">Active</span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">Inactive</span>
                      )}
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
            launchStages={launchStages}
          />
        ) : null;
      })()}
    </div>
  );
}

function EditDrawer({ item, opened, onClose, onSave, launchStages }: { item: Item; opened: boolean; onClose: () => void; onSave: (patch: Partial<Item>) => void; launchStages: LaunchStage[] }) {
  const [patch, setPatch] = useState<Partial<Item>>({ ...item });
  const [users, setUsers] = useState<Array<{ email: string; first_name?: string | null; last_name?: string | null; avatar_url?: string | null }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (opened) {
      fetchUsers();
    }
  }, [opened]);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error: any) {
      console.error("Failed to fetch users:", error);
    } finally {
      setUsersLoading(false);
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
  const isCustomEmail = patch.decision_owner_email && !selectedUser;

  const userSelectData = [
    { value: "", label: "None" },
    ...users.map(u => ({
      value: u.email,
      label: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email,
    }))
  ];

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Edit Criterion"
      position="right"
      size="xl"
      padding="lg"
    >
      <Stack gap="md">
        <TextInput
          label="Label"
          value={patch.label || ""}
          onChange={(e) => setPatch({ ...patch, label: e.target.value })}
          required
        />

        <TextInput
          label="Category"
          value={patch.category || ""}
          onChange={(e) => setPatch({ ...patch, category: e.target.value })}
          required
          description="Category from the table"
        />

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
          label="Rating Timing"
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Decision Owner
          </label>
          {selectedUser ? (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
              <Avatar
                src={selectedUser.avatar_url || undefined}
                alt={selectedUser.email}
                radius="xl"
                size={40}
                color={getColor(selectedUser.email)}
              >
                {getInitials(selectedUser.email, selectedUser.first_name, selectedUser.last_name)}
              </Avatar>
              <div>
                <div className="font-medium text-gray-900">
                  {selectedUser.first_name || ""} {selectedUser.last_name || ""}
                </div>
                <div className="text-sm text-gray-500">{selectedUser.email}</div>
              </div>
            </div>
          ) : isCustomEmail ? (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600">{patch.decision_owner_email}</div>
            </div>
          ) : null}
          <Select
            label="Select User"
            placeholder="Choose a user from the system"
            value={selectedUser ? patch.decision_owner_email : ""}
            onChange={(value) => {
              if (value) {
                setPatch({ ...patch, decision_owner_email: value });
              } else {
                setPatch({ ...patch, decision_owner_email: undefined });
              }
            }}
            data={userSelectData}
            searchable
            clearable
            disabled={usersLoading}
            description="Select a user from the system"
          />
          <div className="text-center text-sm text-gray-500 my-2">or</div>
          <TextInput
            label="Enter Custom Email/Placeholder"
            placeholder="e.g., email@example.com or [name of pod's product manager]"
            value={isCustomEmail ? (patch.decision_owner_email ?? "") : ""}
            onChange={(e) => {
              const value = e.target.value;
              setPatch({ ...patch, decision_owner_email: value || undefined });
            }}
            description="Enter a custom email address or placeholder text"
          />
        </div>

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

        <TextInput
          label="Sort Order"
          type="number"
          value={(patch.sort_order ?? 0) + 1}
          onChange={(e) => setPatch({ ...patch, sort_order: Math.max(0, Number(e.target.value) - 1) })}
        />

        <Checkbox
          label="Active"
          checked={!!patch.is_active}
          onChange={(e) => setPatch({ ...patch, is_active: e.target.checked })}
        />

        <Group justify="flex-end" mt="xl">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(patch)}>
            Save Changes
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
