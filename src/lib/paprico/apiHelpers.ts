import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

/**
 * PaPriCo access model (spec §2): reads are open to any authenticated user,
 * writes require the paprico.manage capability (defaults: PRODUCT_OPS, CPO —
 * same owners as Release Criteria). Data access uses the service-role client
 * after these app-level checks, like other admin surfaces.
 */
export async function requirePapricoReader(): Promise<
    { email: string } | { response: NextResponse }
> {
    const email = await getAuthenticatedUserEmail();
    if (!email) {
        return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    return { email };
}

export async function requirePapricoWriter(): Promise<
    { email: string } | { response: NextResponse }
> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth;

    const sb = createAdminClient();
    const { data: me, error } = await sb
        .from('app_user')
        .select('roles')
        .eq('email', auth.email)
        .single();
    if (error && (error as { code?: string }).code === 'PGRST116') {
        return { response: NextResponse.json({ error: 'User profile not found' }, { status: 404 }) };
    }
    if (error) {
        return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
    }

    const rules = await getEffectivePermissionRules();
    const allowed = canRolesPerformWithRules((me?.roles as string[]) || [], 'paprico.manage', rules);
    if (!allowed) {
        return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { email: auth.email };
}
