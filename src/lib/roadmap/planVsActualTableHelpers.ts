import type { PlanVsActualItem, PlanVsActualStatusCategory } from '@/types/roadmap';
import { isExternalCause } from '@/lib/roadmap/pmNoteCause';
import { formatPlanVsActualReleaseLabel } from '@/lib/roadmap/planVsActualStatus';

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

/** End-of-period release train for filter/group (short label when parseable). */
export function releaseKey(item: PlanVsActualItem): string {
  const label = formatPlanVsActualReleaseLabel(item.endRelease ?? item.startRelease);
  return label ?? EMPTY_RELEASE;
}

export function releaseKeyLabel(key: string): string {
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

export function comparePlanVsActualItems(
  a: PlanVsActualItem,
  b: PlanVsActualItem,
  arrA: string,
  arrB: string,
  key: PlanVsActualSortKey,
  dir: 1 | -1,
): number {
  const cmp = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });

  let primary = 0;
  switch (key) {
    case 'goal':
      primary = cmp(goalKey(a), goalKey(b));
      break;
    case 'gtmModule':
      primary = cmp(gtmModuleKey(a), gtmModuleKey(b));
      break;
    case 'release':
      primary = cmp(releaseKey(a), releaseKey(b));
      break;
    case 'feature':
      primary = cmp(a.featureName, b.featureName);
      break;
    case 'arr':
      primary = cmp(arrA.trim(), arrB.trim());
      break;
    case 'status':
      primary =
        statusOrder(a.statusCategory) - statusOrder(b.statusCategory) ||
        cmp(a.statusLabel, b.statusLabel);
      break;
    default:
      primary = 0;
  }
  if (primary !== 0) return primary * dir;
  return cmp(a.ahaKey, b.ahaKey) * dir;
}
