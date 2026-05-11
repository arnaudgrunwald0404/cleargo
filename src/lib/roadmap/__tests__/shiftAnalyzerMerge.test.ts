import { mergeItemInsightsWithItems } from '../planVsActualAnalysisMerge';
import type { PlanVsActualItem } from '@/types/roadmap';

describe('mergeItemInsightsWithItems', () => {
  it('fills missing keys', () => {
    const items: Pick<PlanVsActualItem, 'ahaKey' | 'statusLabel'>[] = [
      { ahaKey: 'A', statusLabel: 'On track' },
      { ahaKey: 'B', statusLabel: 'Delayed' },
    ];
    const merged = mergeItemInsightsWithItems(items, [
      { ahaKey: 'A', summary: 'ok', likelyReasons: 'fine' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].ahaKey).toBe('A');
    expect(merged[1].ahaKey).toBe('B');
    expect(merged[1].summary).toBe('Delayed');
    expect(merged[1].likelyReasons).toContain('snapshot');
  });
});
