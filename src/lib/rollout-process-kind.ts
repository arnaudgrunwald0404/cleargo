import type { Epic } from '@/types/epics';

export type RolloutProcessKind = 'single_ga' | 'dual_cohort';

/** Coerce stored Aha picklist value (string, object, array) to a display string. */
export function normalizeRolloutProcessRaw(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (Array.isArray(raw)) {
    return raw.length ? normalizeRolloutProcessRaw(raw[0]) : null;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.value === 'string' && o.value.trim()) return o.value.trim();
    if (typeof o.name === 'string' && /single|dual/i.test(o.name)) return o.name.trim();
  }
  const s = String(raw).trim();
  return s && s !== '[object Object]' ? s : null;
}

/** Normalize Aha picklist value to internal kind. Missing/unknown defaults to dual_cohort. */
export function parseRolloutProcess(raw: unknown): RolloutProcessKind {
  const normalized = normalizeRolloutProcessRaw(raw);
  if (!normalized) return 'dual_cohort';
  const s = normalized.toLowerCase();
  if (s.includes('single') && s.includes('ga')) return 'single_ga';
  if (s === 'single ga' || s === 'single_ga') return 'single_ga';
  if (s.includes('dual') && s.includes('cohort')) return 'dual_cohort';
  if (s === 'dual cohort' || s === 'dual_cohort') return 'dual_cohort';
  return 'dual_cohort';
}

export function getRolloutProcessRaw(
  epic: Pick<Epic, 'aha_fields'>
): unknown {
  const cf = (epic.aha_fields as { custom_fields?: Record<string, unknown> } | null)?.custom_fields;
  return cf?.rollout_process ?? null;
}

export function getRolloutProcess(
  epic: Pick<Epic, 'aha_fields'>
): RolloutProcessKind {
  return parseRolloutProcess(getRolloutProcessRaw(epic));
}

export function isSingleGaRollout(epic: Pick<Epic, 'aha_fields'>): boolean {
  return getRolloutProcess(epic) === 'single_ga';
}
