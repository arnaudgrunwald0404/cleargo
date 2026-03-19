import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEpic } from '@/lib/epics';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  getEpicScorecards,
  createEpicScorecard,
} from '@/lib/services/successMeasurementService';
import {
  calculateMetricResults,
  determineOverallStatus,
} from '@/lib/services/scorecardCalculation';

export async function GET(
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

    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const scorecards = await getEpicScorecards(epicId, limit);
    return NextResponse.json(scorecards);
  } catch (error: any) {
    console.error('Error fetching epic scorecards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scorecards', details: error.message },
      { status: 500 }
    );
  }
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if success config exists
    const { getEpicSuccessConfig } = await import('@/lib/services/successMeasurementService');
    const config = await getEpicSuccessConfig(epicId);
    if (!config) {
      return NextResponse.json(
        { error: 'Success configuration not found. Please configure success measurement first.' },
        { status: 400 }
      );
    }

    // Parse request body for optional snapshot date
    const body = await req.json().catch(() => ({}));
    const snapshotDate = body.snapshot_date || new Date().toISOString().split('T')[0];

    // Calculate metric results
    const metricResults = await calculateMetricResults(epicId, snapshotDate);
    const overallStatus = determineOverallStatus(metricResults);

    // Create scorecard
    const scorecard = await createEpicScorecard(
      epicId,
      snapshotDate,
      metricResults,
      overallStatus
    );

    // Fire-and-forget backfill from launch-90 to min(launch+120, today)
    try {
      if (epic.target_launch_date) {
        const { generateScorecardsForRange } = await import('@/lib/services/scorecardGenerationService');
        const launch = new Date(epic.target_launch_date);
        const today = new Date(); today.setHours(0,0,0,0);
        const start = new Date(launch); start.setDate(start.getDate() - 90); start.setHours(0,0,0,0);
        const endCap = new Date(launch); endCap.setDate(endCap.getDate() + 120); endCap.setHours(0,0,0,0);
        const end = new Date(Math.min(endCap.getTime(), today.getTime()));
        // Do not await to return response faster; log errors only
        generateScorecardsForRange(epicId, start.toISOString().split('T')[0], end.toISOString().split('T')[0])
          .catch((err) => console.warn('Backfill after scorecard creation failed:', err));
      }
    } catch (e) {
      console.warn('Error scheduling backfill after scorecard creation:', e);
    }

    return NextResponse.json(scorecard, { status: 201 });
  } catch (error: any) {
    console.error('Error creating epic scorecard:', error);
    return NextResponse.json(
      { error: 'Failed to create scorecard', details: error.message },
      { status: 500 }
    );
  }
}

