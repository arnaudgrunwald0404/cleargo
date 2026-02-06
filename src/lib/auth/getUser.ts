import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getSettings } from '@/lib/settings-db';
import { syncUserSlackHandle } from '@/lib/slack/notifications';
import type { Role } from './roles';
import type { Role as SystemRole } from '@/lib/roles-constants';
import { getEffectiveUserEmail, IMPERSONATE_COOKIE_NAME } from '@/lib/auth/impersonation';

const DEFAULT_AUTO_PROVISION_ROLE = 'PMM';

/**
 * Get current user with roles
 * Integrates with existing Supabase auth system
 * Maps system roles to success measurement roles:
 * - PRODUCT_OPS, CPO, SUPERADMIN -> ADMIN
 * - PM -> PM
 * - PMM -> PMM
 * - SUPPORT -> CS
 * - CPO -> EXEC (also ADMIN)
 * If the user is authenticated but has no app_user row and their email domain
 * is allowlisted, an app_user is created automatically (no approval required).
 */
export async function getUser(): Promise<{ id: string; roles: Role[] }> {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user?.email) {
    throw new Error('Unauthorized');
  }

  const realEmailLower = user.email.toLowerCase();
  const cookieStore = await cookies();
  const impersonateCookie = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
  const effectiveEmail = await getEffectiveUserEmail(realEmailLower, impersonateCookie);

  let appUser: { id: string; roles: string[] | null; role?: string } | null = null;
  let userError: { code?: string } | null = null;
  const { data: appUserData, error: appUserError } = await supabase
    .from('app_user')
    .select('id, roles, role')
    .eq('email', effectiveEmail)
    .single();

  appUser = appUserData;
  userError = appUserError;

  if (!appUser && userError?.code === 'PGRST116' && effectiveEmail === realEmailLower) {
    const domain = user.email?.split('@')[1]?.toLowerCase();
    if (domain) {
      const settings = await getSettings();
      const allowlisted = settings.allowlisted_domains?.some(
        (d) => d?.toLowerCase().trim() === domain
      );
      if (allowlisted) {
        const firstName = (user.user_metadata?.first_name as string) || null;
        const lastName = (user.user_metadata?.last_name as string) || null;
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
        const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (secretKey) {
          const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            secretKey
          );
          const { error: insertError } = await adminClient
            .from('app_user')
            .insert({
              id: user.id,
              email: realEmailLower,
              first_name: firstName,
              last_name: lastName,
              name: fullName,
              roles: [DEFAULT_AUTO_PROVISION_ROLE],
              is_active: true,
            });
          if (insertError) {
            if (insertError.code !== '23505') {
              console.error('[getUser] Auto-provision insert failed:', insertError);
            }
          } else {
            syncUserSlackHandle(realEmailLower).catch((err) => {
              console.error(`Failed to sync Slack handle for ${realEmailLower}:`, err);
            });
          }
        }
        const { data: created } = await supabase
          .from('app_user')
          .select('id, roles, role')
          .eq('email', realEmailLower)
          .single();
        if (created) appUser = created;
      }
    }
  }

  if (!appUser) {
    return { id: user.id, roles: [] };
  }

  const userId = appUser.id;

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
    } else if (upperRole === 'SUPPORT' && !mappedRoles.includes('CS')) {
      mappedRoles.push('CS');
    }
  }

  return { id: userId, roles: mappedRoles };
}

