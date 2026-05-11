import type { PeriodShiftAnalysis, PlanVsActualItem } from '@/types/roadmap';

/** Ensures every roadmap row has a line-level narrative (fallback if the model omits keys). */
export function mergeItemInsightsWithItems(
  items: Pick<PlanVsActualItem, 'ahaKey' | 'statusLabel'>[],
  insights: PeriodShiftAnalysis['itemInsights'],
): PeriodShiftAnalysis['itemInsights'] {
  const byKey = new Map(insights.map((i) => [i.ahaKey, i]));
  return items.map((item) => {
    const existing = byKey.get(item.ahaKey);
    if (existing) return existing;
    return {
      ahaKey: item.ahaKey,
      summary: item.statusLabel,
      likelyReasons:
        'No matching PM note for this item; narrative reflects snapshot status only.',
    };
  });
}
