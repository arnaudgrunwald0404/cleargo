import {
  allowedTrainMonthKeysForPlanVsActualReport,
  DELAYED_BEYOND_QUARTER_KEY,
} from '../planVsActualStatus';
import {
  internalExternalLabel,
  comparePlanVsActualItems,
  comparePlanVsActualItemsInGroup,
  groupSortKeysForPlanVsActual,
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
  it('uses end release train label for net-new rows', () => {
    const item = baseItem({
      inStart: false,
      inEnd: true,
      endRelease: 'Release 2026.5',
      startRelease: null,
    });
    expect(releaseKey(item)).toBe('2026.5');
    expect(releaseKeyLabel(EMPTY_RELEASE)).toBe('(No release)');
  });

  it('uses delayed-beyond-quarter bucket when plan train was in quarter but end train is not', () => {
    const scope = {
      allowedTrainMonthKeys: allowedTrainMonthKeysForPlanVsActualReport(
        'quarter_progress',
        '2026-04-01',
        '2026-04-30',
      ),
    };
    const item = baseItem({
      inStart: true,
      inEnd: true,
      startRelease: '2026.6',
      endRelease: '2026.9',
    });
    expect(releaseKey(item, scope)).toBe(DELAYED_BEYOND_QUARTER_KEY);
    expect(releaseKeyLabel(DELAYED_BEYOND_QUARTER_KEY, 'Delayed Beyond Q2')).toBe(
      'Delayed Beyond Q2',
    );
  });

  it('keeps quarter-start plan train for in-quarter rows', () => {
    const scope = {
      allowedTrainMonthKeys: allowedTrainMonthKeysForPlanVsActualReport(
        'quarter_progress',
        '2026-04-01',
        '2026-04-30',
      ),
    };
    const item = baseItem({
      inStart: true,
      inEnd: true,
      startRelease: '2026.6',
      endRelease: '2026.6',
    });
    expect(releaseKey(item, scope)).toBe('2026.6');
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

describe('comparePlanVsActualItemsInGroup', () => {
  it('uses release then gtm then feature when grouped by goal', () => {
    expect(groupSortKeysForPlanVsActual('goal')).toEqual(['release', 'gtmModule', 'feature']);
    const earlierRelease = baseItem({ ahaKey: 'A', endRelease: '2026.4', productArea: 'Mod' });
    const laterRelease = baseItem({ ahaKey: 'B', endRelease: '2026.6', productArea: 'Mod' });
    expect(comparePlanVsActualItemsInGroup('goal', earlierRelease, laterRelease, '', '')).toBeLessThan(
      0,
    );
  });

  it('uses release then goal when grouped by gtm', () => {
    expect(groupSortKeysForPlanVsActual('gtm')).toEqual(['release', 'goal', 'feature']);
  });

  it('uses gtm then goal when grouped by release', () => {
    expect(groupSortKeysForPlanVsActual('release')).toEqual(['gtmModule', 'goal', 'feature']);
  });
});
