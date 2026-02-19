import { findRelatedEvents, findRelatedEntities } from '@/lib/heart/pendo-context';
import type { PendoContextForAgent } from '@/lib/heart/types';

describe('findRelatedEvents (legacy wrapper)', () => {
  it('matches connect/connection variants in epic and event names', () => {
    const events = [
      {
        name: 'Document Cloud Connect - Setup storage button',
        productArea: null,
        description: 'Setup button click in connection flow',
        userCount: 3,
        eventCount: 12,
      },
      {
        name: 'Totally Unrelated Event',
        productArea: null,
        description: 'Not related',
        userCount: 100,
        eventCount: 1000,
      },
    ];

    const related = findRelatedEvents('Document Cloud Connection', null, events);

    expect(related.length).toBeGreaterThan(0);
    expect(related[0].name).toBe('Document Cloud Connect - Setup storage button');
  });
});

describe('findRelatedEntities', () => {
  const buildContext = (overrides: Partial<PendoContextForAgent> = {}): PendoContextForAgent => ({
    events: [],
    features: [],
    pages: [],
    segments: [],
    apps: [],
    ...overrides,
  });

  it('finds ClearInsights pages when epic mentions "CI Dashboard"', () => {
    const context = buildContext({
      pages: [
        { id: 'page-1', name: 'ClearInsights - Recruiting - Reports', appId: 'app1' },
        { id: 'page-2', name: 'ClearInsights - People Analytics - Headcount', appId: 'app1' },
        { id: 'page-3', name: 'Settings - Notifications', appId: 'app1' },
      ],
    });

    const related = findRelatedEntities(
      'Port CI Dashboard to RFF [RnA]',
      'Migrate the ClearInsights analytics dashboards from the legacy framework to React Feature Flags',
      context
    );

    const pageNames = related.filter(e => e.entityType === 'page').map(e => e.name);
    expect(pageNames.length).toBeGreaterThan(0);
    expect(pageNames.some(n => n.includes('ClearInsights'))).toBe(true);
  });

  it('matches abbreviation "CI" against "ClearInsights"', () => {
    const context = buildContext({
      features: [
        { id: 'feat-1', name: 'ClearInsights - Search', appId: 'app1', kind: 'Feature', group: null },
        { id: 'feat-2', name: 'Recruiting - Job Board', appId: 'app1', kind: 'Feature', group: null },
      ],
    });

    const related = findRelatedEntities(
      'Port CI Dashboard to RFF',
      null,
      context
    );

    const featureNames = related.filter(e => e.entityType === 'feature').map(e => e.name);
    expect(featureNames).toContain('ClearInsights - Search');
    expect(featureNames).not.toContain('Recruiting - Job Board');
  });

  it('searches across events, features, and pages simultaneously', () => {
    const context = buildContext({
      events: [
        { name: 'App.Analytics.Export', productArea: null, description: 'Export analytics report', userCount: 50, eventCount: 200 },
        { name: 'App.Settings.Save', productArea: null, description: null, userCount: 10, eventCount: 30 },
      ],
      features: [
        { id: 'feat-1', name: 'Analytics - Filter Panel', appId: 'app1', kind: 'Feature', group: null },
        { id: 'feat-2', name: 'Settings - Notification Bell', appId: 'app1', kind: 'Feature', group: null },
      ],
      pages: [
        { id: 'page-1', name: 'Analytics Dashboard', appId: 'app1' },
        { id: 'page-2', name: 'User Profile', appId: 'app1' },
        { id: 'page-3', name: 'Home Feed', appId: 'app1' },
      ],
    });

    const related = findRelatedEntities('Analytics Dashboard Redesign', null, context);

    const types = new Set(related.map(e => e.entityType));
    expect(types.size).toBeGreaterThanOrEqual(2);
    expect(related.some(e => e.name.includes('Analytics'))).toBe(true);
  });
});
