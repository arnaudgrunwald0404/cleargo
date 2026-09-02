import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

// GET /api/forecasts/[epicId]/versions
// Lightweight version history for the epic's forecast — lets the UI list/switch between runs.
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

    const { data: runs, error } = await adminSupabase
        .from('forecast_runs')
        .select('id, source, status, is_current, created_at, created_by')
        .eq('epic_aha_id', epicAhaId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching forecast versions:', error);
        return NextResponse.json({ error: 'Failed to fetch forecast versions' }, { status: 500 });
    }

    return NextResponse.json({ runs: runs ?? [] });
}

const AssumptionInput = z.object({
    id: z.string().uuid().optional(), // present when editing an existing assumption; absent for a new one
    key: z.string().min(1),
    label: z.string().min(1),
    value_bear: z.string().nullable(),
    value_base: z.string().nullable(),
    value_bull: z.string().nullable(),
    confidence: z.enum(['confirmed', 'hypothesis', 'low_confidence']),
    source_note: z.string().nullable(),
});

const PeriodInput = z.object({
    scenario: z.enum(['bear', 'base', 'bull']),
    period_type: z.enum(['month', 'quarter', 'year']),
    period_label: z.string().min(1),
    cross_sell_arr_usd: z.number().int(),
    net_new_arr_usd: z.number().int(),
    churn_reduction_arr_usd: z.number().int(),
    total_arr_usd: z.number().int(),
});

const CreateVersionSchema = z.object({
    assumptions: z.array(AssumptionInput),
    periods: z.array(PeriodInput),
});

// POST /api/forecasts/[epicId]/versions
// Saves a PM-edited assumptions/periods set as a new forecast_runs version. Narrative sections
// carry forward unchanged from the current run (Phase 3 doesn't edit narrative). The prior
// current run is marked is_current = false, never deleted — full history is preserved.
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

    const body = await req.json();
    const parsed = CreateVersionSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { assumptions, periods } = parsed.data;

    const adminSupabase = createAdminClient();

    const { data: currentRun, error: currentRunError } = await adminSupabase
        .from('forecast_runs')
        .select('id, epic_id, epic_aha_id')
        .eq('epic_aha_id', epicAhaId)
        .eq('is_current', true)
        .maybeSingle();

    if (currentRunError) {
        console.error('Error fetching current forecast run:', currentRunError);
        return NextResponse.json({ error: 'Failed to fetch current forecast run' }, { status: 500 });
    }
    if (!currentRun) {
        return NextResponse.json({ error: 'No current forecast run to edit for this epic' }, { status: 404 });
    }

    const currentRunRow = currentRun as { id: string; epic_id: string | null; epic_aha_id: string };

    // Load the prior assumptions (by id) so we can tell which values actually changed —
    // only changed rows get overridden_by/overridden_at stamped.
    const { data: priorAssumptions } = await adminSupabase
        .from('forecast_assumptions')
        .select('id, value_bear, value_base, value_bull')
        .eq('run_id', currentRunRow.id);
    type PriorAssumption = { id: string; value_bear: string | null; value_base: string | null; value_bull: string | null };
    const priorById = new Map(((priorAssumptions ?? []) as PriorAssumption[]).map((a) => [a.id, a]));

    const { data: priorNarrative } = await adminSupabase
        .from('forecast_narrative')
        .select('section, content, sort_order')
        .eq('run_id', currentRunRow.id);

    const { data: newRun, error: newRunError } = await adminSupabase
        .from('forecast_runs')
        .insert({
            epic_id: currentRunRow.epic_id,
            epic_aha_id: currentRunRow.epic_aha_id,
            source: 'generated',
            status: 'complete',
            is_current: true,
            created_by: userEmail ?? 'api-key',
        })
        .select('id')
        .single();

    if (newRunError || !newRun) {
        console.error('Error creating new forecast run:', newRunError);
        return NextResponse.json({ error: 'Failed to create new forecast run' }, { status: 500 });
    }
    const newRunId = (newRun as { id: string }).id;

    const { error: demoteError } = await adminSupabase
        .from('forecast_runs')
        .update({ is_current: false })
        .eq('id', currentRunRow.id);
    if (demoteError) {
        console.error('Error demoting prior forecast run:', demoteError);
    }

    const now = new Date().toISOString();
    const assumptionRows = assumptions.map((a, i) => {
        const prior = a.id ? priorById.get(a.id) : undefined;
        const changed =
            !prior || prior.value_bear !== a.value_bear || prior.value_base !== a.value_base || prior.value_bull !== a.value_bull;
        return {
            run_id: newRunId,
            key: a.key,
            label: a.label,
            value_bear: a.value_bear,
            value_base: a.value_base,
            value_bull: a.value_bull,
            confidence: a.confidence,
            source_note: a.source_note,
            sort_order: i,
            overridden_by: changed ? (userEmail ?? 'api-key') : null,
            overridden_at: changed ? now : null,
        };
    });
    const periodRows = periods.map((p, i) => ({ ...p, run_id: newRunId, sort_order: i }));
    type PriorNarrative = { section: string; content: string; sort_order: number };
    const narrativeRows = ((priorNarrative ?? []) as PriorNarrative[]).map((n) => ({ ...n, run_id: newRunId }));

    const [aRes, pRes, nRes] = await Promise.all([
        assumptionRows.length ? adminSupabase.from('forecast_assumptions').insert(assumptionRows) : Promise.resolve({ error: null }),
        periodRows.length ? adminSupabase.from('forecast_periods').insert(periodRows) : Promise.resolve({ error: null }),
        narrativeRows.length ? adminSupabase.from('forecast_narrative').insert(narrativeRows) : Promise.resolve({ error: null }),
    ]);
    for (const [label, res] of [['assumptions', aRes], ['periods', pRes], ['narrative', nRes]] as const) {
        if (res.error) console.error(`Error inserting ${label} for new run:`, res.error);
    }

    return NextResponse.json({ run_id: newRunId });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
