import { describe, it, expect } from '@jest/globals';
import { hasReachedGtmAccessPhase } from '../epic-rollout-dates';

describe('hasReachedGtmAccessPhase', () => {
  it('returns true once today is on/after the planned GTM Access date', () => {
    expect(
      hasReachedGtmAccessPhase({
        plannedGtmAccessYmd: '2026-06-01',
        todayYmd: '2026-06-21',
      })
    ).toBe(true);

    // Boundary day counts as reached.
    expect(
      hasReachedGtmAccessPhase({
        plannedGtmAccessYmd: '2026-06-21',
        todayYmd: '2026-06-21',
      })
    ).toBe(true);
  });

  it('returns false before the planned GTM Access date', () => {
    expect(
      hasReachedGtmAccessPhase({
        plannedGtmAccessYmd: '2026-07-15',
        todayYmd: '2026-06-21',
      })
    ).toBe(false);
  });

  it('prefers the confirmed actual date over the planned date', () => {
    // Actual already passed even though planned is in the future.
    expect(
      hasReachedGtmAccessPhase({
        gtmAccessConfirmed: true,
        actualGtmAccessYmd: '2026-06-10',
        plannedGtmAccessYmd: '2026-08-01',
        todayYmd: '2026-06-21',
      })
    ).toBe(true);
  });

  it('treats explicit confirmation as reached even with no computable date', () => {
    expect(
      hasReachedGtmAccessPhase({
        gtmAccessConfirmed: true,
        actualGtmAccessYmd: null,
        plannedGtmAccessYmd: null,
        todayYmd: '2026-06-21',
      })
    ).toBe(true);
  });

  it('returns false (pre-phase / soft) when no date is known and not confirmed', () => {
    expect(
      hasReachedGtmAccessPhase({
        gtmAccessConfirmed: false,
        actualGtmAccessYmd: null,
        plannedGtmAccessYmd: null,
        todayYmd: '2026-06-21',
      })
    ).toBe(false);
  });

  it('falls back to the planned date when confirmed but no actual date is set', () => {
    expect(
      hasReachedGtmAccessPhase({
        gtmAccessConfirmed: true,
        actualGtmAccessYmd: null,
        plannedGtmAccessYmd: '2026-06-01',
        todayYmd: '2026-06-21',
      })
    ).toBe(true);
  });
});
