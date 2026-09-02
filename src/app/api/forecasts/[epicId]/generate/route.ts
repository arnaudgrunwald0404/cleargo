import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';
import { runForecastGeneration } from '@/lib/forecast/orchestrator';
import { persistGeneratedRun } from '@/lib/forecast/persist';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

interface EpicRow {
    id: string;
    name: string | null;
    target_launch_date: string | null;
    pricing_model: string | null;
    aha_fields: Record<string, unknown> | null;
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

    const { data: epicRow, error: epicError } = await adminSupabase
        .from('epic')
        .select('id, name, target_launch_date, pricing_model, aha_fields')
        .eq('aha_id', epicAhaId)
        .maybeSingle();

    if (epicError || !epicRow) {
        return NextResponse.json({ error: 'Epic not found for this reference' }, { status: 404 });
    }
    const epic = epicRow as EpicRow;
    const description = (epic.aha_fields?.description as string | undefined) ?? epic.name ?? '';

    const generationInput = {
        epicAhaId,
        productName: epic.name ?? epicAhaId,
        productDescription: description,
        gaDate: epic.target_launch_date,
        pricingNotes: epic.pricing_model ?? undefined,
    };

    const baseUrl = (process.env.NETLIFY_URL || process.env.URL || '').replace(/\/$/, '');
    const isNetlifyProduction =
        Boolean(baseUrl) && !baseUrl.includes('localhost') && Boolean(process.env.NETLIFY_FORECAST_GENERATION_SECRET);

    if (!isNetlifyProduction) {
        try {
            const result = await runForecastGeneration(generationInput);
            const runId = await persistGeneratedRun(adminSupabase, epic, epicAhaId, result, userEmail ?? 'api-key');
            return NextResponse.json({ run_id: runId });
        } catch (err) {
            console.error('Error generating forecast synchronously:', err);
            return NextResponse.json(
                { error: err instanceof Error ? err.message : 'Failed to generate forecast' },
                { status: 500 }
            );
        }
    }

    const { data: job, error: jobError } = await adminSupabase
        .from('forecast_generation_jobs')
        .insert({ epic_id: epic.id, epic_aha_id: epicAhaId, status: 'pending' })
        .select('id')
        .single();

    if (jobError || !job) {
        console.error('Failed to create forecast generation job:', jobError);
        return NextResponse.json({ error: 'Failed to start forecast generation' }, { status: 500 });
    }

    const secret = process.env.NETLIFY_FORECAST_GENERATION_SECRET!;
    const bgUrl = `${baseUrl}/.netlify/functions/forecast-generation-background`;
    const triggerRes = await fetch(bgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId: (job as { id: string }).id,
            epicAhaId,
            createdBy: userEmail ?? 'api-key',
            generationInput,
            secret,
        }),
    });

    if (!triggerRes.ok) {
        await adminSupabase
            .from('forecast_generation_jobs')
            .update({ status: 'failed', error_message: 'Failed to start background generation', updated_at: new Date().toISOString() })
            .eq('id', (job as { id: string }).id);
        return NextResponse.json({ error: 'Failed to start forecast generation' }, { status: 502 });
    }

    return NextResponse.json({ job_id: (job as { id: string }).id }, { status: 202 });
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
