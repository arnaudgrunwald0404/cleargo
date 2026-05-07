import { mapPivotRowToRoadmapSnapshot } from '../pivotMapping';
import type { NormalizedPivotRow } from '../pivotNormalizer';

describe('mapPivotRowToRoadmapSnapshot', () => {
  const emptyMap = new Map<string, string | null>();

  it('maps GTM Module, GTM Name, and promoted-ideas vote count', () => {
    const row: NormalizedPivotRow = {
      'Epic key': 'FOO-BAR-1',
      'Epic name': 'Engineering title',
      'GTM Module': 'Payments',
      'GTM Name': 'Customer-facing title',
      'Epic promoted ideas vote count': '128',
    };

    const out = mapPivotRowToRoadmapSnapshot(row, '2026-05-06', emptyMap);

    expect(out.aha_key).toBe('FOO-BAR-1');
    expect(out.aha_name).toBe('Engineering title');
    expect(out.gtm_module).toBe('Payments');
    expect(out.gtm_name).toBe('Customer-facing title');
    expect(out.aha_promoted_ideas_votes).toBe(128);
  });

  it('parses numeric vote count cells', () => {
    const row: NormalizedPivotRow = {
      'Epic key': 'FOO-BAR-2',
      'Epic promoted ideas vote count': 7,
    };

    const out = mapPivotRowToRoadmapSnapshot(row, '2026-05-06', emptyMap);

    expect(out.aha_promoted_ideas_votes).toBe(7);
  });

  it('matches GTM and vote columns case-insensitively', () => {
    const row: NormalizedPivotRow = {
      'Epic key': 'X-1',
      'gtm module': 'Alpha',
      'GTM NAME': 'Beta',
      'EPIC PROMOTED IDEAS VOTE COUNT': '3',
    };

    const out = mapPivotRowToRoadmapSnapshot(row, '2026-05-06', emptyMap);

    expect(out.gtm_module).toBe('Alpha');
    expect(out.gtm_name).toBe('Beta');
    expect(out.aha_promoted_ideas_votes).toBe(3);
  });

  it('maps epic.custom_gtm style header keys', () => {
    const row: NormalizedPivotRow = {
      'Epic key': 'X-2',
      'epic.gtm_module': 'M1',
      'epic.gtm_name': 'N1',
    };

    const out = mapPivotRowToRoadmapSnapshot(row, '2026-05-06', emptyMap);

    expect(out.gtm_module).toBe('M1');
    expect(out.gtm_name).toBe('N1');
  });
});
