import type { PlanVsActualItem, PlanVsActualStatusCategory } from '@/types/roadmap';
import { isExternalCause } from '@/lib/roadmap/pmNoteCause';
import {
  DELAYED_BEYOND_QUARTER_KEY,
  formatPlanVsActualReleaseLabel,
  isDelayedBeyondQuarter,
  type ReportingReleaseScope,
} from '@/lib/roadmap/planVsActualStatus';

export type PlanVsActualGroupBy = 'goal' | 'gtm' | 'release';

export type PlanVsActualSortKey =
  | 'goal'
  | 'gtmModule'
  | 'release'
  | 'feature'
  | 'arr'
  | 'status';

export const EMPTY_GOAL = '__none_goal__';
export const EMPTY_GTM = '__none_gtm__';
export const EMPTY_RELEASE = '__none_release__';

export function goalKey(item: PlanVsActualItem): string {
  const g = item.goal?.trim();
  return g ? g : EMPTY_GOAL;
}

export function gtmModuleKey(item: PlanVsActualItem): string {
  const a = item.productArea?.trim();
  return a ? a : EMPTY_GTM;
}

/**
 * Release bucket for filter/group.
 * - Slips past the quarter → {@link DELAYED_BEYOND_QUARTER_KEY}
 * - Removed from pivot → quarter-start plan train
 * - Otherwise → current end train (e.g. 2026.5 → 2026.6 shows under 2026.6)
 */
export function releaseKey(item: PlanVsActualItem, scope?: ReportingReleaseScope): string {
  if (scope && isDelayedBeyondQuarter(item, scope)) {
    return DELAYED_BEYOND_QUARTER_KEY;
  }
  const raw =
    item.inStart && !item.inEnd
      ? (item.startRelease ?? item.endRelease)
      : (item.endRelease ?? item.startRelease);
  const label = formatPlanVsActualReleaseLabel(raw);
  return label ?? EMPTY_RELEASE;
}

export function releaseKeyLabel(key: string, delayedBeyondSectionLabel?: string): string {
  if (key === DELAYED_BEYOND_QUARTER_KEY) {
    return delayedBeyondSectionLabel ?? 'Delayed beyond quarter';
  }
  if (key === EMPTY_RELEASE) return '(No release)';
  return key.startsWith('Release ') ? key : `Release ${key}`;
}

export function internalExternalLabel(pmNoteCause: string | null | undefined): string {
  if (!pmNoteCause?.trim()) return '—';
  return isExternalCause(pmNoteCause) ? 'External' : 'Internal';
}

function statusOrder(cat: PlanVsActualStatusCategory): number {
  const order: PlanVsActualStatusCategory[] = ['green', 'yellow', 'red', 'neutral'];
  return order.indexOf(cat);
}

function compareBySortKey(
  a: PlanVsActualItem,
  b: PlanVsActualItem,
  arrA: string,
  arrB: string,
  key: PlanVsActualSortKey,
  scope?: ReportingReleaseScope,
): number {
  const cmp = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });

  switch (key) {
    case 'goal':
      return cmp(goalKey(a), goalKey(b));
    case 'gtmModule':
      return cmp(gtmModuleKey(a), gtmModuleKey(b));
    case 'release':
      return cmp(releaseKey(a, scope), releaseKey(b, scope));
    case 'feature':
      return cmp(a.featureName, b.featureName);
    case 'arr':
      return cmp(arrA.trim(), arrB.trim());
    case 'status':
      return (
        statusOrder(a.statusCategory) - statusOrder(b.statusCategory) ||
        cmp(a.statusLabel, b.statusLabel)
      );
    default:
      return 0;
  }
}

/** Row order inside a grouped section (ascending). */
export function groupSortKeysForPlanVsActual(groupBy: PlanVsActualGroupBy): PlanVsActualSortKey[] {
  switch (groupBy) {
    case 'goal':
      return ['release', 'gtmModule', 'feature'];
    case 'gtm':
      return ['release', 'goal', 'feature'];
    case 'release':
      return ['gtmModule', 'goal', 'feature'];
  }
}

export function comparePlanVsActualItemsInGroup(
  groupBy: PlanVsActualGroupBy,
  a: PlanVsActualItem,
  b: PlanVsActualItem,
  arrA: string,
  arrB: string,
  scope?: ReportingReleaseScope,
): number {
  const cmp = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });
  for (const key of groupSortKeysForPlanVsActual(groupBy)) {
    const c = compareBySortKey(a, b, arrA, arrB, key, scope);
    if (c !== 0) return c;
  }
  return cmp(a.ahaKey, b.ahaKey);
}

export function comparePlanVsActualItems(
  a: PlanVsActualItem,
  b: PlanVsActualItem,
  arrA: string,
  arrB: string,
  key: PlanVsActualSortKey,
  dir: 1 | -1,
  scope?: ReportingReleaseScope,
): number {
  const cmp = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });
  const primary = compareBySortKey(a, b, arrA, arrB, key, scope);
  if (primary !== 0) return primary * dir;
  return cmp(a.ahaKey, b.ahaKey) * dir;
}
