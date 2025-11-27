"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  label: string;
  description?: string;
  category: string;
  gate: boolean;
  tier_applicability: string;
  decision_owner_role: string;
  status_definition_go?: string;
  status_definition_conditional?: string;
  status_definition_no_go?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const CATEGORIES = [
  "PRODUCT_TECH",
  "GTM",
  "SUPPORT",
  "DATA_ANALYTICS",
  "LEGAL_SECURITY",
  "OPS",
  "OTHER",
];
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

export default function CriteriaAdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Item>>({
    label: "",
    category: "PRODUCT_TECH",
    gate: false,
    tier_applicability: "ALL",
    decision_owner_role: "PRODUCT_OPS",
    is_active: true,
    sort_order: 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{ preview: any[], count: number } | null>(null);

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

      alert(`Import successful! Created: ${data.created}, Updated: ${data.updated}`);
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
        const res = await fetch("/api/criteria");
        const data = await res.json();
        setItems(data.items || []);
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
      decision_owner_role: form.decision_owner_role,
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
      decision_owner_role: "PRODUCT_OPS",
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
    setItems((prev) => prev.map((c) => (c.id === id ? item : c)));
    setEditingId(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">Loading criteria...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Criteria Admin</h1>
                <p className="text-sm text-gray-500">Manage launch readiness criteria</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 font-medium transition-all shadow-sm hover:shadow-md"
            >
              + New Criterion
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Criterion</h2>
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
                  <input
                    value={form.label || ""}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tier Applicability</label>
                  <select
                    value={form.tier_applicability}
                    onChange={(e) => setForm({ ...form, tier_applicability: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {TIERS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Decision Owner Role</label>
                  <select
                    value={form.decision_owner_role}
                    onChange={(e) => setForm({ ...form, decision_owner_role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order ?? 0}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.gate}
                    onChange={(e) => setForm({ ...form, gate: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Gate Criterion</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                >
                  Create Criterion
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Import Section */}
        <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Import from Excel</h2>
          <p className="text-sm text-gray-600 mb-4">Upload a .xlsx file to bulk create or update criteria. Matches by Label.</p>

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
              <div className="max-h-64 overflow-y-auto mb-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Gate</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {importPreview.preview.slice(0, 10).map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.label}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{item.category}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{item.gate ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.count > 10 && (
                  <p className="text-sm text-gray-500 mt-2 px-3">...and {importPreview.count - 10} more</p>
                )}
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

        {/* Criteria List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Existing Criteria ({items.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sort</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Label</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{c.sort_order}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{c.label}</div>
                      {c.description && <div className="text-gray-500 text-xs mt-1">{c.description}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{c.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {c.gate ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">Gate</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{c.tier_applicability}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{c.decision_owner_role}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {c.is_active ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">Active</span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">Inactive</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingId === c.id ? (
                        <EditRow item={c} onSave={(patch) => submitEdit(c.id, patch)} onCancel={() => setEditingId(null)} />
                      ) : (
                        <button
                          onClick={() => setEditingId(c.id)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function EditRow({ item, onSave, onCancel }: { item: Item; onSave: (patch: Partial<Item>) => void; onCancel: () => void }) {
  const [patch, setPatch] = useState<Partial<Item>>({ ...item });
  return (
    <div className="flex gap-2 items-center">
      <input
        value={patch.label || ""}
        onChange={(e) => setPatch({ ...patch, label: e.target.value })}
        className="px-2 py-1 border border-gray-300 rounded text-sm"
        placeholder="Label"
      />
      <input
        type="number"
        value={patch.sort_order ?? 0}
        onChange={(e) => setPatch({ ...patch, sort_order: Number(e.target.value) })}
        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
      />
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={!!patch.is_active}
          onChange={(e) => setPatch({ ...patch, is_active: e.target.checked })}
          className="w-4 h-4"
        />
        <span className="text-xs">Active</span>
      </label>
      <button
        onClick={() => onSave(patch)}
        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
      >
        Cancel
      </button>
    </div>
  );
}
