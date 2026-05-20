import {
  isTaskSuccessRateType,
  computeTwoEventCompletionPercent,
  buildSingleEventTaskSuccessDescription,
  hasTaskSuccessPeriodPercentageRaw,
} from '../taskSuccessMetric';

describe('taskSuccessMetric', () => {
  describe('isTaskSuccessRateType', () => {
    it('returns true for completion_rate and success_rate', () => {
      expect(isTaskSuccessRateType('completion_rate')).toBe(true);
      expect(isTaskSuccessRateType('success_rate')).toBe(true);
    });

    it('returns false for other measurement types', () => {
      expect(isTaskSuccessRateType('unique_users_percentage')).toBe(false);
      expect(isTaskSuccessRateType('events_per_user')).toBe(false);
    });
  });

  describe('computeTwoEventCompletionPercent', () => {
    it('computes completion / start as percentage', () => {
      expect(computeTwoEventCompletionPercent(100, 75)).toBe(75);
    });

    it('returns 0 when start count is 0', () => {
      expect(computeTwoEventCompletionPercent(0, 50)).toBe(0);
    });
  });

  describe('buildSingleEventTaskSuccessDescription', () => {
    it('describes % of users with counts', () => {
      const text = buildSingleEventTaskSuccessDescription(30, 1000, 3);
      expect(text).toContain('30');
      expect(text).toContain('1,000');
      expect(text).toContain('3.0%');
    });
  });

  describe('hasTaskSuccessPeriodPercentageRaw', () => {
    it('identifies single-event percentage raw payload', () => {
      expect(
        hasTaskSuccessPeriodPercentageRaw({
          uniqueVisitors: 30,
          totalAppVisitors: 1000,
          completionCount: 120,
        })
      ).toBe(true);
    });

    it('rejects two-event funnel raw payload', () => {
      expect(
        hasTaskSuccessPeriodPercentageRaw({
          startCount: 100,
          completeCount: 75,
        })
      ).toBe(false);
    });

    it('rejects missing denominator', () => {
      expect(
        hasTaskSuccessPeriodPercentageRaw({
          uniqueVisitors: 30,
          totalAppVisitors: 0,
        })
      ).toBe(false);
    });
  });
});
