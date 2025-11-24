"use client";
import { useEffect, useMemo, useState } from "react";

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

  if (loading) return <main className="centered"><p>Loading…</p></main>;

  return (
    <main className="centered">
      <h1>Criteria (Admin)</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={{ marginTop: 24 }}>
        <h2>Create new criterion</h2>
        <form onSubmit={submitCreate}>
          <label>
            Label
            <input value={form.label || ""} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
          </label>
          <label>
            Description
            <input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>
            Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Gate
            <input type="checkbox" checked={!!form.gate} onChange={(e) => setForm({ ...form, gate: e.target.checked })} />
          </label>
          <label>
            Tier applicability
            <select value={form.tier_applicability} onChange={(e) => setForm({ ...form, tier_applicability: e.target.value })}>
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Decision owner role
            <select value={form.decision_owner_role} onChange={(e) => setForm({ ...form, decision_owner_role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Sort order
            <input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          </label>
          <label>
            Active
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </label>
          <details>
            <summary>Status definitions (optional)</summary>
            <label>
              GO definition
              <textarea value={form.status_definition_go || ""} onChange={(e) => setForm({ ...form, status_definition_go: e.target.value })} />
            </label>
            <label>
              CONDITIONAL definition
              <textarea value={form.status_definition_conditional || ""} onChange={(e) => setForm({ ...form, status_definition_conditional: e.target.value })} />
            </label>
            <label>
              NO_GO definition
              <textarea value={form.status_definition_no_go || ""} onChange={(e) => setForm({ ...form, status_definition_no_go: e.target.value })} />
            </label>
          </details>
          <div style={{ marginTop: 12 }}>
            <button type="submit">Create</button>
          </div>
        </form>
      </section>

      <section style={{ marginTop: 32, padding: "16px", border: "1px solid #ccc", borderRadius: "8px" }}>
        <h2>Import from Excel</h2>
        <p>Upload a .xlsx file to bulk create or update criteria. Matches by Label.</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
          <button onClick={handlePreviewImport} disabled={!importFile || importLoading}>
            {importLoading ? "Processing..." : "Preview Import"}
          </button>
        </div>
        {importError && <p style={{ color: "red", marginTop: 8 }}>{importError}</p>}

        {importPreview && (
          <div style={{ marginTop: 16, background: "#f9f9f9", padding: 12 }}>
            <h3>Preview</h3>
            <p>Found {importPreview.count} items.</p>
            <div style={{ maxHeight: 200, overflowY: "auto", fontSize: "0.9em" }}>
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Category</th>
                    <th>Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.preview.slice(0, 10).map((item: any, i: number) => (
                    <tr key={i}>
                      <td>{item.label}</td>
                      <td>{item.category}</td>
                      <td>{item.gate ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.count > 10 && <p>...and {importPreview.count - 10} more</p>}
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={handleCommitImport} disabled={importLoading} style={{ backgroundColor: "#228be6", color: "white", border: "none", padding: "8px 16px", cursor: "pointer" }}>
                {importLoading ? "Importing..." : "Confirm & Import"}
              </button>
              <button onClick={() => setImportPreview(null)} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Existing criteria</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Sort</th>
              <th style={{ textAlign: "left" }}>Label</th>
              <th>Cat</th>
              <th>Gate</th>
              <th>Tier</th>
              <th>Owner role</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.sort_order}</td>
                <td>{c.label}</td>
                <td>{c.category}</td>
                <td>{c.gate ? "Yes" : "No"}</td>
                <td>{c.tier_applicability}</td>
                <td>{c.decision_owner_role}</td>
                <td>{c.is_active ? "Yes" : "No"}</td>
                <td>
                  {editingId === c.id ? (
                    <EditRow item={c} onSave={(patch) => submitEdit(c.id, patch)} onCancel={() => setEditingId(null)} />
                  ) : (
                    <button onClick={() => setEditingId(c.id)}>Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main >
  );
}

function EditRow({ item, onSave, onCancel }: { item: Item; onSave: (patch: Partial<Item>) => void; onCancel: () => void }) {
  const [patch, setPatch] = useState<Partial<Item>>({ ...item });
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label>
        Label
        <input value={patch.label || ""} onChange={(e) => setPatch({ ...patch, label: e.target.value })} />
      </label>
      <label>
        Sort
        <input type="number" value={patch.sort_order ?? 0} onChange={(e) => setPatch({ ...patch, sort_order: Number(e.target.value) })} />
      </label>
      <label>
        Active
        <input type="checkbox" checked={!!patch.is_active} onChange={(e) => setPatch({ ...patch, is_active: e.target.checked })} />
      </label>
      <button onClick={() => onSave(patch)}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}
