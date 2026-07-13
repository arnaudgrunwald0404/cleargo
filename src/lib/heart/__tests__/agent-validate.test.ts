/**
 * Tests for validateRecommendations name→id resolution.
 * Models sometimes return feature/page NAMES instead of ids (especially when
 * the user pastes feature names as context); those must resolve, not drop.
 */
jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn(() => jest.fn()) }));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));

import { validateRecommendations } from '../agent';
import type { PendoEventForAgent, PendoFeatureForAgent } from '../types';

const events: PendoEventForAgent[] = [
  { name: 'App.Recruiting.BulkOnboarding.Completed', productArea: null, description: null, userCount: 10, eventCount: 100 },
];

const features: PendoFeatureForAgent[] = [
  { id: 'dzdNa2lOVWh0dGk4VTNRYXV-auto', name: 'page_header', appId: '-323232', kind: 'Feature', group: null },
  { id: 'ZTRvV1ExRVRfUWh0RXRJMFZ-auto', name: 'secondary_nav', appId: '-323232', kind: 'Feature', group: null },
];

const pages = [
  { id: 'q18mixp4SKvmg92PTU7slEl10BM', name: 'Employee Landing Page' },
];

function rec(eventIds: string[]) {
  return {
    engagement: {
      eventIds,
      measurementType: 'events_per_user_per_week' as const,
      rationale: 'test',
    },
  };
}

describe('validateRecommendations', () => {
  it('keeps exact feature ids', () => {
    const result = validateRecommendations(rec(['dzdNa2lOVWh0dGk4VTNRYXV-auto']), events, features, pages);
    expect(result.engagement?.eventIds).toEqual(['dzdNa2lOVWh0dGk4VTNRYXV-auto']);
  });

  it('resolves feature names to ids', () => {
    const result = validateRecommendations(rec(['page_header']), events, features, pages);
    expect(result.engagement?.eventIds).toEqual(['dzdNa2lOVWh0dGk4VTNRYXV-auto']);
  });

  it('resolves feature names case-insensitively with whitespace', () => {
    const result = validateRecommendations(rec([' Page_Header ']), events, features, pages);
    expect(result.engagement?.eventIds).toEqual(['dzdNa2lOVWh0dGk4VTNRYXV-auto']);
  });

  it('resolves page names to page ids', () => {
    const result = validateRecommendations(rec(['Employee Landing Page']), events, features, pages);
    expect(result.engagement?.eventIds).toEqual(['q18mixp4SKvmg92PTU7slEl10BM']);
  });

  it('keeps exact track event names', () => {
    const result = validateRecommendations(rec(['App.Recruiting.BulkOnboarding.Completed']), events, features, pages);
    expect(result.engagement?.eventIds).toEqual(['App.Recruiting.BulkOnboarding.Completed']);
  });

  it('dedupes when a name and its id are both present', () => {
    const result = validateRecommendations(
      rec(['page_header', 'dzdNa2lOVWh0dGk4VTNRYXV-auto']),
      events, features, pages
    );
    expect(result.engagement?.eventIds).toEqual(['dzdNa2lOVWh0dGk4VTNRYXV-auto']);
  });

  it('drops unresolvable ids and removes empty categories', () => {
    const result = validateRecommendations(rec(['totally-made-up-id']), events, features, pages);
    expect(result.engagement).toBeUndefined();
  });

  it('mixes resolvable and unresolvable ids, keeping the valid ones', () => {
    const result = validateRecommendations(
      rec(['secondary_nav', 'hallucinated-id']),
      events, features, pages
    );
    expect(result.engagement?.eventIds).toEqual(['ZTRvV1ExRVRfUWh0RXRJMFZ-auto']);
  });
});
