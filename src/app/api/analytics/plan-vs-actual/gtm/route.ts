import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: appUser } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'roadmap.planVsActual.gtm.write', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json()) as {
      aha_key?: string;
      gtm_module?: string;
      gtm_name?: string | null;
    };

    const ahaKey = body.aha_key?.trim();
    const gtmModule = body.gtm_module?.trim();
    if (!ahaKey || !gtmModule) {
      return NextResponse.json({ error: 'aha_key and gtm_module are required' }, { status: 400 });
    }

    const gtmName =
      body.gtm_name === undefined || body.gtm_name === null
        ? null
        : String(body.gtm_name).trim() || null;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('apply_roadmap_snapshot_gtm_from_pivot', {
      p_updates: [{ aha_key: ahaKey, gtm_module: gtmModule, gtm_name: gtmName }],
      p_force: false,
    });

    if (error) {
      console.error('[plan-vs-actual/gtm] rpc', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      aha_key: ahaKey,
      gtm_module: gtmModule,
      gtm_name: gtmName,
      rows_updated: typeof data === 'number' ? data : Number(data ?? 0),
    });
  } catch (error: unknown) {
    console.error('[plan-vs-actual/gtm]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to update GTM module', details: message }, { status: 500 });
  }
}
