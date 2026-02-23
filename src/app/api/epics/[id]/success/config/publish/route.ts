import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEpic } from '@/lib/epics';
import { getEpicSuccessConfig, createEpicSuccessConfig, setEpicSuccessMetricsPublished } from '@/lib/services/successMeasurementService';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * POST - Publish success metrics for this epic (visible to all users).
 * Requires Configure Success Metrics permission (CPO, PRODUCT, PRODUCT_OPS).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const epic = await getEpic(epicId);
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    const rules = await getEffectivePermissionRules();
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('id, roles')
      .eq('email', user.email)
      .single();

    if (userError || !me) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const canPublish = canRolesPerformWithRules(
      (me.roles as string[]) || [],
      'settings.successMeasurement.update',
      rules
    );
    if (!canPublish) {
      return forbid();
    }

    let existing = await getEpicSuccessConfig(epicId);
    if (!existing) {
      try {
        existing = await createEpicSuccessConfig(epicId, {});
      } catch (createErr: any) {
        if (createErr?.message?.includes('Post-launch owner is required') && me.id) {
          existing = await createEpicSuccessConfig(epicId, { post_launch_owner: me.id });
        } else {
          throw createErr;
        }
      }
    }

    const config = await setEpicSuccessMetricsPublished(epicId, true);
    return NextResponse.json(config);
  } catch (error: any) {
    console.error('Error publishing success metrics:', error);
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }
    if (error.message?.includes('epic_success_configs') && error.message?.includes('schema cache')) {
      return NextResponse.json(
        {
          error: 'Failed to publish success metrics',
          details: 'Database table epic_success_configs is missing. Run Supabase migrations (e.g. npx supabase db push or apply migrations from supabase/migrations in the Supabase dashboard).',
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to publish success metrics', details: error.message },
      { status: 500 }
    );
  }
}
