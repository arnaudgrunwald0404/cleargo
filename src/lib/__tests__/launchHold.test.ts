import { evaluateLaunchHold, revOpsHasCleared } from '../launchHold';

const base = {
  epicDate: '2026-09-01',
  launchDate: '2026-09-15',
  revOpsStatus: 'NOT_SET',
};

describe('revOpsHasCleared', () => {
  it('clears only on GO', () => {
    expect(revOpsHasCleared('GO')).toBe(true);
    expect(revOpsHasCleared('NOT_SET')).toBe(false);
    expect(revOpsHasCleared('NO_GO')).toBe(false);
  });

  it('does not clear on a Conditional Go', () => {
    // The caveat on a pricing sign-off is usually the unresolved part of how it
    // gets sold, which is the exact thing the hold exists for.
    expect(revOpsHasCleared('CONDITIONAL_GO')).toBe(false);
    expect(revOpsHasCleared('CONDITIONAL')).toBe(false);
  });
});

describe('evaluateLaunchHold', () => {
  it('holds an epic shipping before its launch without RevOps', () => {
    const h = evaluateLaunchHold(base);
    expect(h).not.toBeNull();
    expect(h!.daysEarly).toBe(14);
    expect(h!.reason).toContain('RevOps has not signed off');
  });

  it('does not hold once RevOps has cleared', () => {
    expect(evaluateLaunchHold({ ...base, revOpsStatus: 'GO' })).toBeNull();
  });

  it('holds on a conditional sign-off, and says which', () => {
    const h = evaluateLaunchHold({ ...base, revOpsStatus: 'CONDITIONAL_GO' });
    expect(h!.reason).toContain('conditionally');
  });

  it('names a No Go distinctly', () => {
    const h = evaluateLaunchHold({ ...base, revOpsStatus: 'NO_GO' });
    expect(h!.reason).toContain('No Go');
  });

  it('does not hold when the epic ships with or after its launch', () => {
    // Same day is the normal simultaneous case.
    expect(evaluateLaunchHold({ ...base, epicDate: '2026-09-15' })).toBeNull();
    expect(evaluateLaunchHold({ ...base, epicDate: '2026-09-20' })).toBeNull();
  });

  it('does not hold an epic with no launch', () => {
    // Most epics: 28 of 38 active ones have no launch at all.
    expect(evaluateLaunchHold({ ...base, launchDate: null })).toBeNull();
  });

  it('does not hold when either date is missing', () => {
    expect(evaluateLaunchHold({ ...base, epicDate: null })).toBeNull();
    expect(evaluateLaunchHold({ ...base, epicDate: undefined, launchDate: undefined })).toBeNull();
  });

  it('tolerates timestamps where dates are expected', () => {
    const h = evaluateLaunchHold({
      ...base,
      epicDate: '2026-09-01T00:00:00Z',
      launchDate: '2026-09-08T12:00:00Z',
    });
    expect(h!.daysEarly).toBe(7);
  });

  it('reads naturally for a single day', () => {
    const h = evaluateLaunchHold({ ...base, launchDate: '2026-09-02' });
    expect(h!.reason).toContain('1 day before');
  });
});
