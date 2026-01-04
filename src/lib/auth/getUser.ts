import { createClient } from '@/lib/supabase/server';
import type { Role } from './roles';
import type { Role as SystemRole } from '@/lib/roles-constants';

/**
 * Get current user with roles
 * Integrates with existing Supabase auth system
 * Maps system roles to success measurement roles:
 * - PRODUCT_OPS, CPO, SUPERADMIN -> ADMIN
 * - PM -> PM
 * - PMM -> PMM
 * - SUPPORT_LEAD -> CS
 * - CPO -> EXEC (also ADMIN)
 */
export async function getUser(): Promise<{ id: string; roles: Role[] }> {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user?.email) {
    throw new Error('Unauthorized');
  }

  // Get user roles from app_user table
  const { data: appUser, error: userError } = await supabase
    .from('app_user')
    .select('roles, role')
    .eq('email', user.email.toLowerCase())
    .single();

  if (userError || !appUser) {
    // Default to empty roles if user not found
    return { id: user.id, roles: [] };
  }

  // Handle both 'roles' array and legacy 'role' string field
  const systemRoles = (appUser.roles as SystemRole[] | null) || 
                     (appUser.role ? [appUser.role as SystemRole] : []);

  // Map system roles to success measurement roles
  const mappedRoles: Role[] = [];
  
  for (const systemRole of systemRoles) {
    const upperRole = systemRole.toUpperCase() as SystemRole;
    
    if (upperRole === 'PRODUCT_OPS' || upperRole === 'CPO' || upperRole === 'SUPERADMIN') {
      if (!mappedRoles.includes('ADMIN')) {
        mappedRoles.push('ADMIN');
      }
      if (upperRole === 'CPO' && !mappedRoles.includes('EXEC')) {
        mappedRoles.push('EXEC');
      }
    } else if (upperRole === 'PM' && !mappedRoles.includes('PM')) {
      mappedRoles.push('PM');
    } else if (upperRole === 'PMM' && !mappedRoles.includes('PMM')) {
      mappedRoles.push('PMM');
    } else if (upperRole === 'SUPPORT_LEAD' && !mappedRoles.includes('CS')) {
      mappedRoles.push('CS');
    }
  }

  return { id: user.id, roles: mappedRoles };
}

