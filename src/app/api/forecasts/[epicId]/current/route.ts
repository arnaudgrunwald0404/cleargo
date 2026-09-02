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

// GET /api/forecasts/[epicId]/current
// Returns the current forecast run for an epic (assumptions, periods, narrative) — the data
// the Forecast tab renders. epicId = Aha reference_num, e.g. "APP-E-670".
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

    const { data: run, error: runError } = await adminSupabase
        .from('forecast_runs')
        .select('id, epic_aha_id, source, status, is_current, created_at, created_by')
        .eq('epic_aha_id', epicAhaId)
        .eq('is_current', true)
        .maybeSingle();

    if (runError) {
        console.error('Error fetching forecast run:', runError);
        return NextResponse.json({ error: 'Failed to fetch forecast run' }, { status: 500 });
    }

    if (!run) {
        return NextResponse.json({ run: null, assumptions: [], periods: [], narrative: [] });
    }

    const runId = (run as { id: string }).id;

    const [assumptionsRes, periodsRes, narrativeRes] = await Promise.all([
        adminSupabase
            .from('forecast_assumptions')
            .select('id, key, label, value_bear, value_base, value_bull, confidence, source_note, sort_order, overridden_by, overridden_at')
            .eq('run_id', runId)
            .order('sort_order', { ascending: true }),
        adminSupabase
            .from('forecast_periods')
            .select('id, scenario, period_type, period_label, cross_sell_arr_usd, net_new_arr_usd, churn_reduction_arr_usd, total_arr_usd, sort_order')
            .eq('run_id', runId)
            .order('sort_order', { ascending: true }),
        adminSupabase
            .from('forecast_narrative')
            .select('id, section, content, sort_order')
            .eq('run_id', runId)
            .order('sort_order', { ascending: true }),
    ]);

    if (assumptionsRes.error || periodsRes.error || narrativeRes.error) {
        console.error('Error fetching forecast detail:', assumptionsRes.error, periodsRes.error, narrativeRes.error);
        return NextResponse.json({ error: 'Failed to fetch forecast detail' }, { status: 500 });
    }

    return NextResponse.json({
        run,
        assumptions: assumptionsRes.data ?? [],
        periods: periodsRes.data ?? [],
        narrative: narrativeRes.data ?? [],
    });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
