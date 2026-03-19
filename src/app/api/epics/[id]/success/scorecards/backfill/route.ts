import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/epics';
import { generateScorecardsForRange } from '@/lib/services/scorecardGenerationService';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

function isYMD(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
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

    // Load epic
    const epic = await getEpic(epicId);
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }
    if (!epic.target_launch_date) {
      return NextResponse.json({ error: 'Epic is missing target_launch_date' }, { status: 400 });
    }

    // Permissions: admin or (PM and epic owner)
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles, id')
      .eq('email', user.email)
      .single();
    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) throw userError;

    const userRoles = (me?.roles as string[]) || [];
    const rules = await getEffectivePermissionRules();
    const canConfigure = canRolesPerformWithRules(userRoles, 'settings.successMeasurement.update', rules);
    const isPM = userRoles.includes('PM');
    const isEpicOwner = epic.owner_id === me?.id;

    if (!canConfigure && !(isPM && isEpicOwner)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ensure success config exists
    const { getEpicSuccessConfig } = await import('@/lib/services/successMeasurementService');
    const config = await getEpicSuccessConfig(epicId);
    if (!config) {
      return NextResponse.json({ error: 'Success configuration not found. Configure success measurement first.' }, { status: 400 });
    }

    // Parse optional range
    const body = await req.json().catch(() => ({} as any));
    let { start_date, end_date } = body as { start_date?: string; end_date?: string };

    const launch = new Date(epic.target_launch_date);
    const today = new Date(); today.setHours(0,0,0,0);

    const defaultStart = new Date(launch); defaultStart.setDate(defaultStart.getDate() - 90); defaultStart.setHours(0,0,0,0);
    const defaultEndCap = new Date(launch); defaultEndCap.setDate(defaultEndCap.getDate() + 120); defaultEndCap.setHours(0,0,0,0);
    const defaultEnd = new Date(Math.min(defaultEndCap.getTime(), today.getTime()));

    if (!isYMD(start_date)) start_date = defaultStart.toISOString().split('T')[0];
    if (!isYMD(end_date)) end_date = defaultEnd.toISOString().split('T')[0];

    const start = new Date(start_date);
    const end = new Date(end_date);
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);

    if (end < start) {
      return NextResponse.json({ error: 'end_date must be >= start_date' }, { status: 400 });
    }

    const results = await generateScorecardsForRange(epicId, start_date, end_date);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      epicId,
      start_date,
      end_date,
      total_days: results.length,
      succeeded: successCount,
      failed: failureCount,
      results,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error backfilling scorecards:', error);
    return NextResponse.json(
      { error: 'Failed to backfill scorecards', details: error.message },
      { status: 500 }
    );
  }
}