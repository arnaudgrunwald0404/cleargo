import {
  internalExternalLabel,
  comparePlanVsActualItems,
  releaseKey,
  releaseKeyLabel,
  EMPTY_RELEASE,
} from '../planVsActualTableHelpers';
import type { PlanVsActualItem } from '@/types/roadmap';

function baseItem(partial: Partial<PlanVsActualItem>): PlanVsActualItem {
  return {
    ahaKey: 'K-1',
    goal: 'G',
    productArea: 'Mod',
    pmNoteCause: null,
    featureName: 'Feat',
    startSnapshotDate: null,
    endSnapshotDate: null,
    inStart: true,
    inEnd: true,
    startRelease: null,
    endRelease: null,
    startProgress: null,
    endProgress: null,
    startStatus: null,
    endStatus: null,
    firstScanRelease: null,
    statusCategory: 'green',
    statusLabel: 'On track',
    ...partial,
  };
}

describe('internalExternalLabel', () => {
  it('classifies granular causes', () => {
    expect(internalExternalLabel('Internal, Engineering')).toBe('Internal');
    expect(internalExternalLabel('External, Third-party')).toBe('External');
    expect(internalExternalLabel('Internal')).toBe('Internal');
  });

  it('returns em dash when missing', () => {
    expect(internalExternalLabel(null)).toBe('—');
  });
});

describe('releaseKey', () => {
  it('uses end release train label', () => {
    const item = baseItem({ endRelease: 'Release 2026.5', startRelease: '2026.4' });
    expect(releaseKey(item)).toBe('2026.5');
    expect(releaseKeyLabel(EMPTY_RELEASE)).toBe('(No release)');
  });
});

describe('comparePlanVsActualItems', () => {
  it('sorts by feature name', () => {
    const a = baseItem({ ahaKey: 'A', featureName: 'Zebra' });
    const b = baseItem({ ahaKey: 'B', featureName: 'Apple' });
    expect(comparePlanVsActualItems(a, b, '', '', 'feature', 1)).toBeGreaterThan(0);
    expect(comparePlanVsActualItems(a, b, '', '', 'feature', -1)).toBeLessThan(0);
  });
});
