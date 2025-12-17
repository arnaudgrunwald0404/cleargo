// AUTH DISABLED: Helper functions to check if user is superadmin and bypass all checks

const SUPERADMIN_EMAIL = 'agrunwald@clearcompany.com';

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
}

export function getSuperAdminRoles(): string[] {
  return ['SUPERADMIN', 'CPO', 'PRODUCT_OPS'];
}

// Helper to check if user should bypass all permission checks
export async function shouldBypassAuth(email: string | null | undefined): Promise<boolean> {
  return isSuperAdmin(email);
}
