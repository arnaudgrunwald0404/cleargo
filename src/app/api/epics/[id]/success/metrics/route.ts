import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEpic } from '@/lib/epics';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  getEpicSuccessMetrics,
  getEpicSuccessConfig,
  addEpicSuccessMetric,
} from '@/lib/services/successMeasurementService';
import { createEpicSuccessMetricSchema } from '@/lib/success/validation';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

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

    const config = await getEpicSuccessConfig(epicId);
    const rules = await getEffectivePermissionRules();
    const { data: me } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();
    const canConfigure = canRolesPerformWithRules(
      (me?.roles as string[]) || [],
      'settings.successMeasurement.update',
      rules
    );
    // If not published, only users who can configure success metrics see the metrics
    if (config && config.success_metrics_published_at == null && !canConfigure) {
      return NextResponse.json([]);
    }

    const metrics = await getEpicSuccessMetrics(epicId);
    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('Error fetching epic success metrics:', error);
    console.error('Error stack:', error.stack);
    try {
      const { id: epicId } = await params;
      console.error('Epic ID:', epicId);
    } catch {
      // Ignore if params can't be accessed
    }
    return NextResponse.json(
      { 
        error: 'Failed to fetch success metrics', 
        details: error.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
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
      return forbid();
    }

    // Check if config exists and is locked
    const { getEpicSuccessConfig } = await import('@/lib/services/successMeasurementService');
    const config = await getEpicSuccessConfig(epicId);
    if (config?.locked && !canConfigure) {
      return NextResponse.json({ error: 'Configuration is locked. Only admins can modify locked configurations.' }, { status: 403 });
    }

    // Validate request body
    const body = await req.json();
    const parsed = createEpicSuccessMetricSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Validate metric exists
    const { getMetricById } = await import('@/lib/services/successMeasurementService');
    const metric = await getMetricById(parsed.data.metric_id);
    if (!metric) {
      return NextResponse.json({ error: 'Metric not found' }, { status: 404 });
    }

    // Validate epic-specific config based on metric source
    if (metric.source === 'PENDO') {
      // If metric doesn't have a default pendo_event_id, epic must provide one
      if (!metric.pendo_event_id && !parsed.data.pendo_event_id) {
        return NextResponse.json(
          { error: 'Pendo event ID is required. Either set it at the metric level or provide an epic-specific event ID.' },
          { status: 400 }
        );
      }
    } else if (metric.source === 'SNOWFLAKE') {
      // Snowflake queries are typically epic-specific, so require it
      if (!parsed.data.snowflake_query) {
        return NextResponse.json(
          { error: 'Snowflake query is required for Snowflake metrics.' },
          { status: 400 }
        );
      }
    }

    const mapping = await addEpicSuccessMetric(epicId, parsed.data);

    // Auto-generate scorecards for benchmark horizon days if epic is launched and has config
    try {
      const { generateScorecardsForRange } = await import('@/lib/services/scorecardGenerationService');
      // Note: Benchmark-based scorecard generation has been removed

      // Also kick off backfill from launch-90 to min(launch+120, today)
      if (epic.target_launch_date) {
        const launch = new Date(epic.target_launch_date);
        const today = new Date(); today.setHours(0,0,0,0);
        const start = new Date(launch); start.setDate(start.getDate() - 90); start.setHours(0,0,0,0);
        const endCap = new Date(launch); endCap.setDate(endCap.getDate() + 120); endCap.setHours(0,0,0,0);
        const end = new Date(Math.min(endCap.getTime(), today.getTime()));
        generateScorecardsForRange(epicId, start.toISOString().split('T')[0], end.toISOString().split('T')[0])
          .catch((err) => console.warn('Backfill after metric addition failed:', err));
      }
    } catch (error) {
      // Ignore scorecard generation errors - metric addition should still succeed
      console.warn('Error attempting post-add generation/backfill:', error);
    }

    return NextResponse.json(mapping, { status: 201 });
  } catch (error: any) {
    console.error('Error adding epic success metric:', error);
    if (error.message?.includes('maximum') || error.message?.includes('already added')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Surface schema-out-of-date errors directly so the client shows them
    if (error.message && error.message.includes('Database schema out of date')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'Failed to add success metric', details: error.message },
      { status: 500 }
    );
  }
}

