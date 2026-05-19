const STORAGE_PREFIX = 'cleargo:pva-arr:v1';

export function planVsActualArrStorageKey(periodType: string, periodDate: string): string {
  return `${STORAGE_PREFIX}:${periodType}:${periodDate}`;
}

function readArrMapFromStorageKey(storageKey: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadLocalPlanVsActualArrMap(periodKey: string): Record<string, string> {
  const current = readArrMapFromStorageKey(periodKey);
  if (Object.keys(current).length > 0) return current;

  // Migrate legacy keys (`quarter_progress:2026-04-01`) to prefixed v1 keys.
  const prefix = `${STORAGE_PREFIX}:`;
  if (!periodKey.startsWith(prefix)) return {};
  const legacyKey = periodKey.slice(prefix.length);
  const legacy = readArrMapFromStorageKey(legacyKey);
  if (Object.keys(legacy).length === 0) return {};
  try {
    window.localStorage.setItem(periodKey, JSON.stringify(legacy));
    window.localStorage.removeItem(legacyKey);
  } catch {
    /* ignore quota / private mode */
  }
  return legacy;
}

export function saveLocalPlanVsActualArr(periodKey: string, ahaKey: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    const map = loadLocalPlanVsActualArrMap(periodKey);
    const trimmed = value.trim();
    if (!trimmed) {
      delete map[ahaKey];
    } else {
      map[ahaKey] = trimmed;
    }
    if (Object.keys(map).length === 0) {
      window.localStorage.removeItem(periodKey);
    } else {
      window.localStorage.setItem(periodKey, JSON.stringify(map));
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLocalPlanVsActualArrKey(periodKey: string, ahaKey: string): void {
  saveLocalPlanVsActualArr(periodKey, ahaKey, '');
}
