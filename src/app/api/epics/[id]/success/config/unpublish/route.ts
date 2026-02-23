import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEpic } from '@/lib/epics';
import { getEpicSuccessConfig, setEpicSuccessMetricsPublished } from '@/lib/services/successMeasurementService';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * POST - Unpublish success metrics for this epic (draft; only configurers see).
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

    const existing = await getEpicSuccessConfig(epicId);
    if (!existing) {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }

    const rules = await getEffectivePermissionRules();
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();

    if (userError || !me) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const canUnpublish = canRolesPerformWithRules(
      (me.roles as string[]) || [],
      'settings.successMeasurement.update',
      rules
    );
    if (!canUnpublish) {
      return forbid();
    }

    const config = await setEpicSuccessMetricsPublished(epicId, false);
    return NextResponse.json(config);
  } catch (error: any) {
    console.error('Error unpublishing success metrics:', error);
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to unpublish success metrics', details: error.message },
      { status: 500 }
    );
  }
}
