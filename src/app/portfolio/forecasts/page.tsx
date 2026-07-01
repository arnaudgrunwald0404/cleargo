'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { SegmentedControl } from '@mantine/core';
import type { ForecastEpicSummary, ForecastLink } from '@/app/api/forecasts/summary/route';

function formatUSD(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function tierBadgeStyle(tier: string | null): React.CSSProperties {
  if (!tier) return { background: '#e5e7eb', color: '#6b7280' };
  const t = tier.toLowerCase();
  if (t.includes('1')) return { background: '#fee2e2', color: '#991b1b' };
  if (t.includes('2')) return { background: '#fef3c7', color: '#92400e' };
  if (t.includes('3')) return { background: '#dbeafe', color: '#1e40af' };
  return { background: '#f3f4f6', color: '#374151' };
}

export default function ForecastsPage() {
  const [epics, setEpics] = useState<ForecastEpicSummary[]>([]);
  const [order, setOrder] = useState<string[]>([]); // epic_aha_id order; empty = default
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scenario, setScenario] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [renamingLinkId, setRenamingLinkId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const dragSrc = useRef<string | null>(null);

  const ORDER_KEY = 'cleargo_forecasts_row_order';

  useEffect(() => {
    fetch('/api/forecasts/summary', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list: ForecastEpicSummary[] = d.epics ?? [];
        setEpics(list);

        // Restore saved order, falling back to API order for any new epics
        try {
          const saved: string[] = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]');
          const ids = new Set(list.map((e: ForecastEpicSummary) => e.epic_aha_id));
          // Keep saved positions for known epics, append new ones at the end
          const restored = [
            ...saved.filter(id => ids.has(id)),
            ...list.map((e: ForecastEpicSummary) => e.epic_aha_id).filter(id => !saved.includes(id)),
          ];
          setOrder(restored);
        } catch {
          setOrder(list.map((e: ForecastEpicSummary) => e.epic_aha_id));
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const scenarios = useMemo(() => {
    const s = new Set<string>();
    for (const e of epics) for (const l of e.links) s.add(l.scenario);
    return ['all', ...Array.from(s).sort()];
  }, [epics]);

  // For each epic, pick the most-recent link matching the active scenario filter.
  const displayLinks = useMemo(() => {
    const map = new Map<string, ForecastLink | null>();
    for (const e of epics) {
      const candidates = scenario === 'all'
        ? e.links
        : e.links.filter(l => l.scenario === scenario);
      map.set(e.epic_aha_id, candidates[0] ?? null);
    }
    return map;
  }, [epics, scenario]);

  // Respect manual drag-and-drop order
  const orderedEpics = useMemo(() => {
    if (order.length === 0) return epics;
    const map = new Map(epics.map(e => [e.epic_aha_id, e]));
    return order.map(id => map.get(id)).filter(Boolean) as ForecastEpicSummary[];
  }, [epics, order]);

  const selectedEpics = orderedEpics.filter(e => selected.has(e.epic_aha_id));

  // Aggregate ARR for selected epics
  const aggregatedARR = useMemo(() => {
    let incr27 = 0, incr28 = 0, churn27 = 0, churn28 = 0;
    let hasIncr27 = false, hasIncr28 = false, hasChurn27 = false, hasChurn28 = false;
    for (const e of selectedEpics) {
      const link = displayLinks.get(e.epic_aha_id);
      if (link?.arr_incremental_2027_usd != null) { incr27 += link.arr_incremental_2027_usd; hasIncr27 = true; }
      if (link?.arr_incremental_2028_usd != null) { incr28 += link.arr_incremental_2028_usd; hasIncr28 = true; }
      if (link?.arr_churn_reduction_2027_usd != null) { churn27 += link.arr_churn_reduction_2027_usd; hasChurn27 = true; }
      if (link?.arr_churn_reduction_2028_usd != null) { churn28 += link.arr_churn_reduction_2028_usd; hasChurn28 = true; }
    }
    return {
      incr27: hasIncr27 ? incr27 : null,
      incr28: hasIncr28 ? incr28 : null,
      churn27: hasChurn27 ? churn27 : null,
      churn28: hasChurn28 ? churn28 : null,
    };
  }, [selectedEpics, displayLinks]);

  const handleDragStart = (id: string) => { dragSrc.current = id; };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!dragSrc.current || dragSrc.current === id) return;
    setOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(dragSrc.current!);
      const to = next.indexOf(id);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, dragSrc.current!);
      return next;
    });
  };
  const handleDragEnd = () => {
    dragSrc.current = null;
    // Read the latest order from state via the updater pattern to avoid stale closure
    setOrder(latest => {
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(latest)); } catch {}
      return latest;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === orderedEpics.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orderedEpics.map(e => e.epic_aha_id)));
    }
  };

  const expandEpic = (epicId: string, linkId: string) => {
    if (expandedId === epicId && expandedLinkId === linkId) {
      setExpandedId(null);
      setExpandedLinkId(null);
    } else {
      setExpandedId(epicId);
      setExpandedLinkId(linkId);
    }
  };

  // Build tab label: show date, add time only when two tabs share the same calendar day
  function tabLabel(link: ForecastLink, siblings: ForecastLink[]): string {
    const d = new Date(link.created_at);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const sameDay = siblings.filter(
      s => s.id !== link.id && new Date(s.created_at).toDateString() === d.toDateString()
    );
    if (sameDay.length > 0) {
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${dateStr} ${timeStr}`;
    }
    return dateStr;
  }

  async function deleteLink(epicAhaId: string, linkId: string) {
    if (!confirm('Delete this forecast version? This cannot be undone.')) return;
    const res = await fetch(`/api/forecasts/${encodeURIComponent(epicAhaId)}/link/${linkId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) { alert('Failed to delete version.'); return; }
    setEpics(prev => prev.map(e =>
      e.epic_aha_id === epicAhaId
        ? { ...e, links: e.links.filter(l => l.id !== linkId) }
        : e
    ));
    setOrder(prev => {
      // If the epic has no more links, remove it from the order
      const updated = epics.find(e => e.epic_aha_id === epicAhaId);
      if (updated && updated.links.length <= 1) return prev.filter(id => id !== epicAhaId);
      return prev;
    });
    if (expandedLinkId === linkId) setExpandedLinkId(null);
  }

  async function saveRename(epicAhaId: string, linkId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingLinkId(null); return; }
    const res = await fetch(`/api/forecasts/${encodeURIComponent(epicAhaId)}/link/${linkId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: trimmed }),
    });
    if (!res.ok) { alert('Failed to rename version.'); return; }
    setEpics(prev => prev.map(e =>
      e.epic_aha_id === epicAhaId
        ? { ...e, links: e.links.map(l => l.id === linkId ? { ...l, scenario: trimmed } : l) }
        : e
    ));
    setRenamingLinkId(null);
  }

  if (loading) {
    return (
      <div style={{ padding: '48px 32px', color: 'var(--color-text-secondary, #6b7280)' }}>
        Loading forecasts…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px 32px', color: '#dc2626' }}>
        Failed to load forecasts: {error}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface, #f9fafb)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--color-card, #ffffff)',
        borderBottom: '1px solid var(--color-border, #e5e7eb)',
        padding: '20px 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text, #111827)' }}>
              Forecasts
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary, #6b7280)' }}>
              {epics.length} epic{epics.length !== 1 ? 's' : ''} with forecasts
            </p>
          </div>

          {/* Scenario filter */}
          <SegmentedControl
            value={scenario}
            onChange={setScenario}
            data={scenarios.map(s => ({ value: s, label: s === 'all' ? 'All Scenarios' : s.charAt(0).toUpperCase() + s.slice(1) }))}
            size="sm"
            style={{ fontFamily: 'var(--font-body)' }}
          />
        </div>
      </div>

      {/* Aggregation bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#1e3a5f',
          color: '#fff',
          padding: '12px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {selected.size} epic{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incr. 2027</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{aggregatedARR.incr27 !== null ? formatUSD(aggregatedARR.incr27) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incr. 2028</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{aggregatedARR.incr28 !== null ? formatUSD(aggregatedARR.incr28) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Churn Red. 2027</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{aggregatedARR.churn27 !== null ? formatUSD(aggregatedARR.churn27) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Churn Red. 2028</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{aggregatedARR.churn28 !== null ? formatUSD(aggregatedARR.churn28) : '—'}</div>
            </div>
          </div>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              marginLeft: 'auto',
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '24px 32px' }}>
        {epics.length === 0 ? (
          <div style={{
            background: 'var(--color-card, #fff)',
            borderRadius: 10,
            border: '1px solid var(--color-border, #e5e7eb)',
            padding: '48px 32px',
            textAlign: 'center',
            color: 'var(--color-text-secondary, #6b7280)',
          }}>
            No forecasts have been published yet.
          </div>
        ) : (
          <div style={{
            background: 'var(--color-card, #fff)',
            borderRadius: 10,
            border: '1px solid var(--color-border, #e5e7eb)',
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '24px 40px 120px 1fr 90px 105px 105px 120px 120px 110px 80px',
              padding: '10px 16px',
              borderBottom: '1px solid var(--color-border, #e5e7eb)',
              background: 'var(--color-surface, #f9fafb)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--color-text-secondary, #6b7280)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              gap: 8,
              alignItems: 'center',
            }}>
              <div></div>{/* drag handle */}
              <div>
                <input
                  type="checkbox"
                  checked={selected.size === orderedEpics.length && orderedEpics.length > 0}
                  ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < orderedEpics.length; }}
                  onChange={toggleAll}
                  style={{ cursor: 'pointer' }}
                />
              </div>
              <div>GTM Module</div>
              <div>Epic</div>
              <div>Tier</div>
              <div>Incr. 2027</div>
              <div>Incr. 2028</div>
              <div>Churn Red. 2027</div>
              <div>Churn Red. 2028</div>
              <div>Generated</div>
              <div></div>
            </div>

            {/* Rows */}
            {orderedEpics.map((epic, idx) => {
              const activeLink = displayLinks.get(epic.epic_aha_id);
              const isSelected = selected.has(epic.epic_aha_id);
              const isExpanded = expandedId === epic.epic_aha_id;
              const allLinksForExpand = isExpanded
                ? (scenario === 'all' ? epic.links : epic.links.filter(l => l.scenario === scenario))
                : [];

              return (
                <div key={epic.epic_aha_id}>
                  {/* Main row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 40px 120px 1fr 90px 105px 105px 120px 120px 110px 80px',
                      padding: '12px 16px',
                      borderBottom: idx < orderedEpics.length - 1 || isExpanded
                        ? '1px solid var(--color-border, #e5e7eb)'
                        : 'none',
                      background: isSelected
                        ? 'rgba(59, 130, 246, 0.05)'
                        : 'var(--color-card, #fff)',
                      gap: 8,
                      alignItems: 'center',
                      transition: 'background 0.1s',
                      cursor: 'grab',
                    }}
                    draggable
                    onDragStart={() => handleDragStart(epic.epic_aha_id)}
                    onDragOver={e => handleDragOver(e, epic.epic_aha_id)}
                    onDragEnd={handleDragEnd}
                  >
                    {/* drag handle */}
                    <div style={{ color: '#d1d5db', fontSize: 14, textAlign: 'center', cursor: 'grab', userSelect: 'none' }}>⠿</div>

                    <div onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(epic.epic_aha_id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', fontWeight: 500 }}>
                      {epic.gtm_module ?? <span style={{ color: '#d1d5db' }}>—</span>}
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text, #111827)' }}>
                        {epic.epic_name ?? epic.epic_aha_id}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', marginTop: 2 }}>
                        {epic.epic_id ? (
                          <a
                            href={`/epics/${epic.epic_id}`}
                            onClick={e => e.stopPropagation()}
                            style={{ color: 'var(--color-text-secondary, #6b7280)', textDecoration: 'underline', textDecorationColor: '#d1d5db' }}
                          >
                            {epic.epic_aha_id}
                          </a>
                        ) : epic.epic_aha_id}
                        {epic.links.length > 1 && (
                          <span style={{ marginLeft: 8, color: '#9ca3af' }}>
                            {epic.links.length} versions
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {epic.launch_tier ? (
                        <span style={{
                          ...tierBadgeStyle(epic.launch_tier),
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}>
                          {epic.launch_tier}
                        </span>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 700, color: activeLink?.arr_incremental_2027_usd != null ? '#111827' : '#d1d5db' }}>
                      {activeLink ? formatUSD(activeLink.arr_incremental_2027_usd) : '—'}
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 700, color: activeLink?.arr_incremental_2028_usd != null ? '#111827' : '#d1d5db' }}>
                      {activeLink ? formatUSD(activeLink.arr_incremental_2028_usd) : '—'}
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 700, color: activeLink?.arr_churn_reduction_2027_usd != null ? '#111827' : '#d1d5db' }}>
                      {activeLink ? formatUSD(activeLink.arr_churn_reduction_2027_usd) : '—'}
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 700, color: activeLink?.arr_churn_reduction_2028_usd != null ? '#111827' : '#d1d5db' }}>
                      {activeLink ? formatUSD(activeLink.arr_churn_reduction_2028_usd) : '—'}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)' }}>
                      {activeLink?.generation_date
                        ? new Date(activeLink.generation_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </div>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {activeLink && (
                        <a
                          href={activeLink.url}
                          target="_blank"
                          rel="noreferrer"
                          title="Open forecast in new tab"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--color-border, #e5e7eb)',
                            color: 'var(--color-text-secondary, #6b7280)',
                            textDecoration: 'none',
                            fontSize: 14,
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          ↗
                        </a>
                      )}
                      {activeLink && (
                        <button
                          onClick={() => expandEpic(epic.epic_aha_id, activeLink.id)}
                          title={isExpanded ? 'Collapse' : 'Preview forecast'}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--color-border, #e5e7eb)',
                            background: isExpanded ? 'var(--color-primary, #3b82f6)' : 'transparent',
                            color: isExpanded ? '#fff' : 'var(--color-text-secondary, #6b7280)',
                            cursor: 'pointer',
                            fontSize: 14,
                          }}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded forecast HTML */}
                  {isExpanded && allLinksForExpand.length > 0 && (() => {
                    // Sort newest first
                    const sortedLinks = [...allLinksForExpand].sort(
                      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                    const activePreviewLink = sortedLinks.find(l => l.id === expandedLinkId) ?? sortedLinks[0];

                    return (
                      <div style={{
                        borderBottom: idx < orderedEpics.length - 1 ? '1px solid var(--color-border, #e5e7eb)' : 'none',
                        background: '#f8fafc',
                      }}>
                        {/* Version tabs — always shown (even for 1 link, so delete/rename are accessible) */}
                        <div style={{
                          display: 'flex',
                          gap: 4,
                          padding: '10px 16px 0',
                          borderBottom: '1px solid var(--color-border, #e5e7eb)',
                          background: '#fff',
                          flexWrap: 'wrap',
                          alignItems: 'flex-end',
                        }}>
                          {sortedLinks.map(link => {
                            const isActive = link.id === activePreviewLink.id;
                            const isRenaming = renamingLinkId === link.id;
                            return (
                              <div
                                key={link.id}
                                onClick={() => { if (!isRenaming) setExpandedLinkId(link.id); }}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px 6px 0 0',
                                  border: '1px solid var(--color-border, #e5e7eb)',
                                  borderBottom: isActive ? '2px solid #3b82f6' : '1px solid transparent',
                                  background: isActive ? '#fff' : 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 2,
                                  minWidth: 160,
                                }}
                              >
                                {/* Scenario name — editable */}
                                {isRenaming ? (
                                  <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={e => setRenameValue(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveRename(epic.epic_aha_id, link.id);
                                      if (e.key === 'Escape') setRenamingLinkId(null);
                                    }}
                                    onBlur={() => saveRename(epic.epic_aha_id, link.id)}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                      fontSize: 13, fontWeight: 600,
                                      border: '1px solid #3b82f6', borderRadius: 4,
                                      padding: '2px 6px', width: '100%', outline: 'none',
                                    }}
                                  />
                                ) : (
                                  <span style={{
                                    fontSize: 13,
                                    fontWeight: isActive ? 600 : 500,
                                    color: isActive ? '#1d4ed8' : '#374151',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}>
                                    {link.scenario}
                                    <span
                                      title="Rename"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setRenamingLinkId(link.id);
                                        setRenameValue(link.scenario);
                                        setExpandedLinkId(link.id);
                                      }}
                                      style={{ opacity: 0.4, fontSize: 11, cursor: 'text' }}
                                    >
                                      ✎
                                    </span>
                                  </span>
                                )}
                                {/* Date / time */}
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                  {tabLabel(link, sortedLinks)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* iframe */}
                        <div style={{ position: 'relative' }}>
                          <iframe
                            key={activePreviewLink.id}
                            src={activePreviewLink.url}
                            title={`Forecast for ${epic.epic_aha_id} — ${activePreviewLink.scenario}`}
                            style={{ width: '100%', height: 600, border: 'none', display: 'block' }}
                            sandbox="allow-scripts allow-same-origin"
                          />
                          {/* Delete link — floats above the iframe bottom bar */}
                          <div style={{
                            position: 'absolute',
                            bottom: 12,
                            right: 16,
                            zIndex: 5,
                          }}>
                            <button
                              onClick={() => deleteLink(epic.epic_aha_id, activePreviewLink.id)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                border: '1px solid #fca5a5',
                                background: '#fff',
                                color: '#dc2626',
                                fontSize: 12,
                                cursor: 'pointer',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                              }}
                            >
                              Delete this version
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
