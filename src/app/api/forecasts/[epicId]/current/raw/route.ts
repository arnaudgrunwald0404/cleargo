import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

// GET /api/forecasts/[epicId]/current/raw
// Returns the archived source markdown for the current run — fetched on demand (not part of
// the main /current payload) since it can be tens of KB and most tab loads don't need it.
async function getHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    const apiKeyValid = validateApiKey(req);
    if (!apiKeyValid) {
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { epicId: epicAhaId } = await params;
    const adminSupabase = createAdminClient();

    const { data: run, error } = await adminSupabase
        .from('forecast_runs')
        .select('id, raw_markdown_forecast, raw_markdown_assumptions')
        .eq('epic_aha_id', epicAhaId)
        .eq('is_current', true)
        .maybeSingle();

    if (error) {
        console.error('Error fetching forecast raw markdown:', error);
        return NextResponse.json({ error: 'Failed to fetch forecast raw markdown' }, { status: 500 });
    }
    if (!run) {
        return NextResponse.json({ error: 'No current forecast run for this epic' }, { status: 404 });
    }

    return NextResponse.json(run);
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
