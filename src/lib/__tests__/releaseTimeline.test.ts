import { describe, it, expect } from '@jest/globals';
import {
  buildTimelineStageStarts,
  computeStageEndDatesByStageId,
  parseUiLevelFromEpicAha,
  type ReleaseTimelineStage,
} from '../releaseTimeline';
import { getEpicTimelineStageOverrides } from '../epic-rollout-dates';

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

    it('re-walks pre-launch stages when GTM and Internal manual dates are set', () => {
      const stages: ReleaseTimelineStage[] = [
        { id: 1, name: 'Product Definition Complete', sort_order: 0, duration_days: 31 },
        { id: 2, name: 'GTM Access and Prep', sort_order: 1, duration_days: 14 },
        { id: 3, name: 'Internal Readiness', sort_order: 2, duration_days: 21 },
        { id: 4, name: 'Cohort 1 Live', sort_order: 3, duration_days: 28 },
        { id: 5, name: 'GA · Cohort 2', sort_order: 4, duration_days: null },
      ];
      const { starts } = buildTimelineStageStarts(stages, '2026-08-30', {
        useBusinessDayTimeline: false,
        stageOverrides: {
          gtmAccessYmd: '2026-06-11',
          internalReadinessYmd: '2026-06-25',
        },
      });

      const ymd = (i: number) =>
        starts[i].date.toISOString().slice(0, 10);

      expect(ymd(1)).toBe('2026-06-11');
      expect(ymd(2)).toBe('2026-06-25');
      expect(ymd(3)).toBe('2026-08-30');
      expect(ymd(0) < ymd(1)).toBe(true);
      expect(ymd(1) < ymd(2)).toBe(true);
      expect(ymd(2) < ymd(3)).toBe(true);

      const map = computeStageEndDatesByStageId(stages, '2026-08-30', {
        useBusinessDayTimeline: false,
        stageOverrides: {
          gtmAccessYmd: '2026-06-11',
          internalReadinessYmd: '2026-06-25',
        },
      });
      expect(map.get(1)).toBe('2026-06-11');
      expect(map.get(2)).toBe('2026-06-25');
      expect(map.get(3)).toBe('2026-08-30');
    });
  });

  describe('getEpicTimelineStageOverrides', () => {
    const releaseStages: ReleaseTimelineStage[] = [
      { id: 1, name: 'Product Definition Complete', sort_order: 0, duration_days: 31 },
      { id: 2, name: 'GTM Access and Prep', sort_order: 1, duration_days: 14 },
      { id: 3, name: 'Internal Readiness', sort_order: 2, duration_days: 21 },
      { id: 4, name: 'Cohort 1 Live', sort_order: 3, duration_days: 28 },
      { id: 5, name: 'GA · Cohort 2', sort_order: 4, duration_days: null },
    ];

    it('returns pins when actual manual dates differ from the default walk', () => {
      expect(
        getEpicTimelineStageOverrides(
          {
            actual_gtm_access_date: '2026-06-11',
            gtm_access_na: false,
            actual_internal_readiness_date: '2026-06-25',
            internal_readiness_na: false,
            aha_fields: {},
            target_launch_date: null,
          },
          {
            anchorYmd: '2026-08-30',
            timelineStages: releaseStages,
            useBusinessDayTimeline: false,
            releaseScheduleStages: releaseStages,
          }
        )
      ).toEqual({
        gtmAccessYmd: '2026-06-11',
        internalReadinessYmd: '2026-06-25',
      });
    });

    it('returns null when display dates match the default walk', () => {
      const anchor = '2026-08-30';
      const { starts } = buildTimelineStageStarts(releaseStages, anchor, {
        useBusinessDayTimeline: false,
      });
      const gtmYmd = starts[1].date.toISOString().slice(0, 10);
      const internalYmd = starts[2].date.toISOString().slice(0, 10);

      expect(
        getEpicTimelineStageOverrides(
          {
            actual_gtm_access_date: gtmYmd,
            gtm_access_na: false,
            actual_internal_readiness_date: internalYmd,
            internal_readiness_na: false,
            aha_fields: {},
            target_launch_date: null,
          },
          {
            anchorYmd: anchor,
            timelineStages: releaseStages,
            useBusinessDayTimeline: false,
            releaseScheduleStages: releaseStages,
          }
        )
      ).toBeNull();
    });

    it('returns null overrides when marked N/A', () => {
      expect(
        getEpicTimelineStageOverrides(
          {
            actual_gtm_access_date: '2026-06-11',
            gtm_access_na: true,
            actual_internal_readiness_date: null,
            internal_readiness_na: true,
            aha_fields: {},
            target_launch_date: null,
          },
          {
            anchorYmd: '2026-08-30',
            timelineStages: releaseStages,
            useBusinessDayTimeline: false,
            releaseScheduleStages: releaseStages,
          }
        )
      ).toBeNull();
    });

    it('pins GTM from Aha phase 3 cutoff when it differs from the default walk', () => {
      expect(
        getEpicTimelineStageOverrides(
          {
            actual_gtm_access_date: null,
            gtm_access_na: false,
            actual_internal_readiness_date: null,
            internal_readiness_na: false,
            aha_fields: {
              custom_fields: { phase_3_gtm_activation_cutoff: '2026-06-11' },
            },
            target_launch_date: null,
          },
          {
            anchorYmd: '2026-08-30',
            timelineStages: releaseStages,
            useBusinessDayTimeline: false,
            releaseScheduleStages: releaseStages,
          }
        )
      ).toEqual({
        gtmAccessYmd: '2026-06-11',
        internalReadinessYmd: null,
      });
    });
  });
});
