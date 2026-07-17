import { canRolesPerform } from '../permissions';

describe('launch capability defaults', () => {
  it('restricts launches.manage to PMM', () => {
    expect(canRolesPerform(['PMM'], 'launches.manage')).toBe(true);
    expect(canRolesPerform(['CPO'], 'launches.manage')).toBe(false);
    expect(canRolesPerform(['PRODUCT_OPS'], 'launches.manage')).toBe(false);
    expect(canRolesPerform(['PM'], 'launches.manage')).toBe(false);
    expect(canRolesPerform(['ENG'], 'launches.manage')).toBe(false);
  });

  it('always allows SUPERADMIN', () => {
    expect(canRolesPerform(['SUPERADMIN'], 'launches.manage')).toBe(true);
  });

  it('keeps launches.view broader than manage', () => {
    expect(canRolesPerform(['CPO'], 'launches.view')).toBe(true);
    expect(canRolesPerform(['PRODUCT_OPS'], 'launches.view')).toBe(true);
  });

  it('keeps task status updates open to launch task owners', () => {
    expect(canRolesPerform(['PM'], 'launchCriteria.status.update')).toBe(true);
    expect(canRolesPerform(['ENG'], 'launchCriteria.status.update')).toBe(true);
  });
});
