import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';
import { startForecastGeneration } from '@/lib/forecast/startGeneration';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

// POST /api/forecasts/[epicId]/generate
// Starts a full live-generation pipeline run (research + pricing + narrative agents). Runs
// synchronously in local dev; on Netlify production it's backgrounded (the pipeline can take
// minutes) and this returns 202 + job_id for GET .../generate-status to poll.
async function postHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    const apiKeyValid = validateApiKey(req);
    let userEmail: string | null = null;
    if (!apiKeyValid) {
        userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { epicId: epicAhaId } = await params;
    const adminSupabase = createAdminClient();

    const result = await startForecastGeneration(
        adminSupabase,
        epicAhaId,
        userEmail ?? 'api-key'
    );

    if (result.outcome === 'not_found') {
        return NextResponse.json({ error: 'Epic not found for this reference' }, { status: 404 });
    }
    if (result.outcome === 'failed') {
        return NextResponse.json({ error: result.reason }, { status: 500 });
    }
    if (result.outcome === 'completed') {
        return NextResponse.json({ run_id: result.runId });
    }

    return NextResponse.json({ job_id: result.jobId }, { status: 202 });
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
