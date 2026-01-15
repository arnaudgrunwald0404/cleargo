import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getEpic } from '@/lib/epics';
import {
  removeEpicSuccessMetric,
  updateEpicSuccessMetric,
} from '@/lib/services/successMeasurementService';
import { updateEpicSuccessMetricSchema } from '@/lib/success/validation';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { id: epicId, metricId } = await params;
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

    // Check permissions
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

    // Check if config exists and is locked
    const { getEpicSuccessConfig } = await import('@/lib/services/successMeasurementService');
    const config = await getEpicSuccessConfig(epicId);
    if (config?.locked && !isAdmin) {
      return NextResponse.json({ error: 'Configuration is locked. Only admins can modify locked configurations.' }, { status: 403 });
    }

    if (!isAdmin && !(isPM && isEpicOwner)) {
      return forbid();
    }

    // Validate request body
    const body = await req.json();
    const parsed = updateEpicSuccessMetricSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const mapping = await updateEpicSuccessMetric(epicId, metricId, parsed.data);

    // Auto-generate scorecards for benchmark horizon days if epic is launched and has config
    try {
      const { generateScorecardsForBenchmarkHorizons } = await import('@/lib/services/scorecardGenerationService');
        await generateScorecardsForBenchmarkHorizons(epicId).catch((err: any) => {
        // Log but don't fail the request if scorecard generation fails
        console.warn('Failed to auto-generate scorecards after metric update:', err);
      });
    } catch (error) {
      // Ignore scorecard generation errors - metric update should still succeed
      console.warn('Error attempting to auto-generate scorecards:', error);
    }

    return NextResponse.json(mapping);
  } catch (error: any) {
    console.error('Error updating epic success metric:', error);
    if (error.message === 'Epic success metric mapping not found') {
      return NextResponse.json({ error: 'Metric mapping not found' }, { status: 404 });
    }
    if (error.message && error.message.includes('Database schema out of date')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'Failed to update success metric', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { id: epicId, metricId } = await params;
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

    // Check permissions
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

    // Check if config exists and is locked
    const { getEpicSuccessConfig } = await import('@/lib/services/successMeasurementService');
    const config = await getEpicSuccessConfig(epicId);
    if (config?.locked && !isAdmin) {
      return NextResponse.json({ error: 'Configuration is locked. Only admins can modify locked configurations.' }, { status: 403 });
    }

    if (!isAdmin && !(isPM && isEpicOwner)) {
      return forbid();
    }

    await removeEpicSuccessMetric(epicId, metricId);
    return NextResponse.json({ message: 'Metric removed successfully' });
  } catch (error: any) {
    console.error('Error removing epic success metric:', error);
    return NextResponse.json(
      { error: 'Failed to remove success metric', details: error.message },
      { status: 500 }
    );
  }
}

