import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEpic } from '@/lib/epics';
import {
  getEpicScorecards,
  createEpicScorecard,
} from '@/lib/services/successMeasurementService';
import {
  calculateMetricResults,
  calculateBenchmarkComparison,
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
    const { resolveRole } = await import('@/lib/roles');
    const role = await resolveRole(user.email);
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
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';
    const isPM = userRoles.includes('PM');
    const isEpicOwner = epic.owner_id === me?.id;

    if (!isAdmin && !(isPM && isEpicOwner)) {
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

    // Calculate metric results and benchmark comparison
    const metricResults = await calculateMetricResults(epicId, snapshotDate);
    const benchmarkComparison = await calculateBenchmarkComparison(epicId, snapshotDate);
    const overallStatus = determineOverallStatus(metricResults);

    // Create scorecard (benchmarkComparison can be null if no benchmark configured)
    const scorecard = await createEpicScorecard(
      epicId,
      snapshotDate,
      metricResults,
      benchmarkComparison || {
        horizons: [],
        expectedActivation: [],
        actualActivation: null,
        dataMissing: true,
      },
      overallStatus
    );

    return NextResponse.json(scorecard, { status: 201 });
  } catch (error: any) {
    console.error('Error creating epic scorecard:', error);
    return NextResponse.json(
      { error: 'Failed to create scorecard', details: error.message },
      { status: 500 }
    );
  }
}

