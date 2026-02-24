/**
 * GET - Poll HEART setup job status (for background function flow).
 * Query: job_id (required).
 * Returns { status, config?, metrics?, recommendations?, error?, availableEventNames? }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const jobId = req.nextUrl.searchParams.get('job_id');
    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing job_id query parameter' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: me } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return forbid();
    }

    const { data: job, error: jobError } = await supabase
      .from('heart_setup_jobs')
      .select('id, epic_id, status, result, updated_at')
      .eq('id', jobId)
      .eq('epic_id', epicId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found or not for this epic' },
        { status: 404 }
      );
    }

    const result = (job.result as Record<string, unknown>) || {};
    return NextResponse.json({
      status: job.status,
      ...result,
    });
  } catch (error) {
    console.error('Error fetching HEART setup status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
