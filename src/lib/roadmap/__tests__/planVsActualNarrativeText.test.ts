import { buildAhaKeyNameMap, linkifyAhaKeysInText } from '@/components/analytics/PlanVsActualNarrativeText';

describe('PlanVsActualNarrativeText helpers', () => {
  it('buildAhaKeyNameMap maps keys to feature names', () => {
    const m = buildAhaKeyNameMap([
      { ahaKey: 'APP-E-1', featureName: 'Payments uplift' },
    ]);
    expect(m.get('APP-E-1')).toBe('Payments uplift');
  });

  it('linkifyAhaKeysInText splits on epic keys', () => {
    const parts = linkifyAhaKeysInText('Shift on APP-E-42 and APP-E-99.', buildAhaKeyNameMap([
      { ahaKey: 'APP-E-42', featureName: 'Alpha' },
    ]));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toBe('Shift on ');
  });
});
