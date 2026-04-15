import type { Epic } from '@/types/epics';

export function isUiFrameworkEpic(epic: Epic): boolean {
  const raw = epic.aha_fields?.custom_fields?.cleargo_candidate;
  const v =
    typeof raw === 'object' && raw !== null && 'name' in raw
      ? String((raw as { name?: unknown }).name ?? '')
      : typeof raw === 'string'
        ? raw
        : undefined;
  return v === 'Yes - UI Framework';
}

export function parseUiLevelFromEpic(epic: Epic): number | null {
  const uiuxImpact = epic.aha_fields?.custom_fields?.uiux_impact;
  const s =
    typeof uiuxImpact === 'object' && uiuxImpact !== null && 'name' in uiuxImpact
      ? String((uiuxImpact as { name?: unknown }).name ?? '')
      : uiuxImpact != null
        ? String(uiuxImpact)
        : '';
  const m = s.match(/\b([123])\b/);
  return m ? parseInt(m[1], 10) : null;
}
