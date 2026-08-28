import { describe, it, expect } from '@jest/globals';
import { getCadenceHours, shouldNotifyNow } from '@/lib/services/storyBriefNotificationService';

describe('getCadenceHours', () => {
  it('returns weekly (168h) for 30+ days out', () => {
    expect(getCadenceHours(30)).toBe(168);
    expect(getCadenceHours(60)).toBe(168);
    expect(getCadenceHours(365)).toBe(168);
  });

  it('returns 2x/week (84h) for 14-29 days', () => {
    expect(getCadenceHours(14)).toBe(84);
    expect(getCadenceHours(20)).toBe(84);
    expect(getCadenceHours(29)).toBe(84);
  });

  it('returns every-other-day (48h) for 7-13 days', () => {
    expect(getCadenceHours(7)).toBe(48);
    expect(getCadenceHours(10)).toBe(48);
    expect(getCadenceHours(13)).toBe(48);
  });

  it('returns daily (24h) for 0-6 days', () => {
    expect(getCadenceHours(0)).toBe(24);
    expect(getCadenceHours(3)).toBe(24);
    expect(getCadenceHours(6)).toBe(24);
  });

  it('returns weekly for null (no launch date)', () => {
    expect(getCadenceHours(null)).toBe(168);
  });

  it('returns daily for negative days (past launch)', () => {
    expect(getCadenceHours(-1)).toBe(24);
    expect(getCadenceHours(-5)).toBe(24);
  });
});

describe('shouldNotifyNow', () => {
  it('returns true when there is no last_notified_at', () => {
    expect(shouldNotifyNow(null, 24)).toBe(true);
    expect(shouldNotifyNow(undefined, 24)).toBe(true);
  });

  it('returns true when enough time has passed', () => {
    const past = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // 25 hours ago
    expect(shouldNotifyNow(past, 24)).toBe(true);
  });

  it('returns false when not enough time has passed', () => {
    const recent = new Date(Date.now() - 10 * 3600 * 1000).toISOString(); // 10 hours ago
    expect(shouldNotifyNow(recent, 24)).toBe(false);
  });

  it('returns true exactly at the cadence boundary', () => {
    const exact = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // exactly 24 hours
    expect(shouldNotifyNow(exact, 24)).toBe(true);
  });

  it('respects weekly cadence', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
    expect(shouldNotifyNow(sixDaysAgo, 168)).toBe(false);

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    expect(shouldNotifyNow(eightDaysAgo, 168)).toBe(true);
  });
});