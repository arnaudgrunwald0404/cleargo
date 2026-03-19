import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEpic } from '@/lib/epics';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { lockEpicSuccessConfig, getEpicSuccessConfig } from '@/lib/services/successMeasurementService';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

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

    // Check if epic exists
    const epic = await getEpic(epicId);
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    // Check if config exists
    const existing = await getEpicSuccessConfig(epicId);
    if (!existing) {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }

    // Check if already locked
    if (existing.locked) {
      return NextResponse.json({ error: 'Configuration is already locked' }, { status: 400 });
    }

    // Check permissions - PM or admin
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles, id')
      .eq('email', user.email)
      .single();

    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }

    const userRoles = (me?.roles as string[]) || [];
    const rules = await getEffectivePermissionRules();
    const canConfigure = canRolesPerformWithRules(userRoles, 'settings.successMeasurement.update', rules);
    const isPM = userRoles.includes('PM');
    const isEpicOwner = epic.owner_id === me?.id;

    if (!canConfigure && !(isPM && isEpicOwner)) {
      return forbid();
    }

    const config = await lockEpicSuccessConfig(epicId);
    return NextResponse.json(config);
  } catch (error: any) {
    console.error('Error locking epic success config:', error);
    if (error.message === 'Epic success config not found') {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to lock success configuration', details: error.message },
      { status: 500 }
    );
  }
}

