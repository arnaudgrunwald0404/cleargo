import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/forecasts/[epicId]/generate-status?job_id=<uuid>
// Poll target for the async live-generation pipeline (mirrors .../heart/setup-status).
//
// job_id omitted -> returns the most recent job for this epic instead (or null if none). The
// Forecast tab calls this on mount so that reopening/reloading the tab mid-generation resumes
// polling automatically rather than showing a stale "no forecast yet" until a manual refresh —
// the tab is conditionally rendered by its parent (mounted only while active), so a brief tab
// switch away and back silently drops any in-flight polling interval and its local state.
async function getHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { epicId: epicAhaId } = await params;
    const jobId = req.nextUrl.searchParams.get('job_id');
    const adminSupabase = createAdminClient();

    if (!jobId) {
        const { data: latestJob, error } = await adminSupabase
            .from('forecast_generation_jobs')
            .select('id, epic_aha_id, status, result, error_message, updated_at')
            .eq('epic_aha_id', epicAhaId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch latest job' }, { status: 500 });
        }
        // Same shape as the job_id branch below (job fields at the top level) so the client
        // parses both responses the same way; null when this epic has never had a job.
        return NextResponse.json(latestJob ?? null);
    }

    const { data: job, error } = await adminSupabase
        .from('forecast_generation_jobs')
        .select('id, epic_aha_id, status, result, error_message, updated_at')
        .eq('id', jobId)
        .eq('epic_aha_id', epicAhaId)
        .maybeSingle();

    if (error || !job) {
        return NextResponse.json({ error: 'Job not found or not for this epic' }, { status: 404 });
    }

    return NextResponse.json(job);
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
