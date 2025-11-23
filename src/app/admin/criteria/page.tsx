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
    </main>
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
