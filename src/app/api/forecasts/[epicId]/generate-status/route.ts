import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/forecasts/[epicId]/generate-status?job_id=<uuid>
// Poll target for the async live-generation pipeline (mirrors .../heart/setup-status).
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
    if (!jobId) {
        return NextResponse.json({ error: 'Missing job_id query parameter' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
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
