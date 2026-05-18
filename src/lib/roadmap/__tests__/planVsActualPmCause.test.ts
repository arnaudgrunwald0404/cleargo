import { shouldShowPlanVsActualPmCause } from '../planVsActualStatus';

describe('shouldShowPlanVsActualPmCause', () => {
  it('hides indicator for on-plan and clean delivered labels', () => {
    expect(shouldShowPlanVsActualPmCause('On Plan')).toBe(false);
    expect(shouldShowPlanVsActualPmCause('Delivered: On Time')).toBe(false);
    expect(shouldShowPlanVsActualPmCause('Delivered: Added')).toBe(false);
    expect(shouldShowPlanVsActualPmCause('Delivered: Early')).toBe(false);
  });

  it('shows indicator for slips and removals', () => {
    expect(shouldShowPlanVsActualPmCause('Delayed')).toBe(true);
    expect(shouldShowPlanVsActualPmCause('Postponed')).toBe(true);
    expect(shouldShowPlanVsActualPmCause('Removed')).toBe(true);
    expect(shouldShowPlanVsActualPmCause('Delivered: Delayed')).toBe(true);
  });
});
