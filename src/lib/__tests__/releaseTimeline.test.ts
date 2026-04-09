import { describe, it, expect } from '@jest/globals';
import {
  computeStageEndDatesByStageId,
  parseUiLevelFromEpicAha,
  type ReleaseTimelineStage,
} from '../releaseTimeline';

describe('releaseTimeline', () => {
  describe('parseUiLevelFromEpicAha', () => {
    it('extracts 1–3 from uiux_impact name or string', () => {
      expect(
        parseUiLevelFromEpicAha({
          custom_fields: { uiux_impact: { name: 'Level 2 — something' } },
        })
      ).toBe(2);
      expect(
        parseUiLevelFromEpicAha({
          custom_fields: { uiux_impact: '3' },
        })
      ).toBe(3);
      expect(parseUiLevelFromEpicAha({})).toBeUndefined();
    });
  });

  describe('computeStageEndDatesByStageId', () => {
    it('maps traditional stages to segment end dates (calendar walk, anchor pin)', () => {
      const stages: ReleaseTimelineStage[] = [
        { id: 10, name: 'UX Preview', sort_order: 1, duration_days: 5 },
        { id: 11, name: 'Internal Readiness', sort_order: 2, duration_days: 3 },
        { id: 12, name: 'Cohort 1', sort_order: 3, duration_days: 2 },
        { id: 13, name: 'GA', sort_order: 4, duration_days: 1 },
      ];
      const map = computeStageEndDatesByStageId(stages, '2025-06-15', {
        useBusinessDayTimeline: false,
        uiLevel: null,
        cohort2Date: null,
      });
      // Pre-launch sum before "Cohort 1" = 5+3=8 → timeline starts 2025-06-07; segment ends follow chart rules.
      expect(map.get(10)).toBe('2025-06-12');
      expect(map.get(11)).toBe('2025-06-15');
      expect(map.get(12)).toBe('2025-06-17');
      expect(map.get(13)).toBe('2025-06-15');
    });

    it('returns empty map when target date missing', () => {
      const stages: ReleaseTimelineStage[] = [
        { id: 1, name: 'A', sort_order: 1, duration_days: 1 },
      ];
      expect(computeStageEndDatesByStageId(stages, null, {
        useBusinessDayTimeline: false,
      }).size).toBe(0);
    });
  });
});
