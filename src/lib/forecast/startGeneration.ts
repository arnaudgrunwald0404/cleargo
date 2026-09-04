/**
 * Starting a forecast generation run, from anywhere.
 *
 * The pipeline (research + pricing + narrative agents) takes minutes, which is
 * well past the 26s cap on a synchronous Netlify function. So on Netlify
 * production it is handed to a background function and the caller polls; locally
 * there is no cap and it runs inline. That fork, the job row, the trigger and
 * the rollback when the trigger fails were all inline in the HTTP route, which
 * made the route the only thing that could start a run.
 *
 * Extracted so the MCP tool starts runs the same way rather than transcribing
 * it -- the same reason startArtifactDraft exists for the drafting pipeline.
 *
 * Outcomes rather than throws: the HTTP route needs a status code, the tool
 * needs a message, and 'completed' and 'started' are genuinely different answers
 * that a caller has to tell apart to know whether to poll.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runForecastGeneration } from '@/lib/forecast/orchestrator';
import { persistGeneratedRun } from '@/lib/forecast/persist';
import { gatherEpicContext } from '@/lib/forecast/gatherEpicContext';

interface EpicRow {
    id: string;
    name: string | null;
    target_launch_date: string | null;
    pricing_model: string | null;
    aha_fields: Record<string, unknown> | null;
}

export type StartForecastResult =
    /** Ran inline (local dev). The forecast already exists. */
    | { outcome: 'completed'; runId: string }
    /** Handed to the background function. Poll generate-status with this. */
    | { outcome: 'started'; jobId: string }
    | { outcome: 'not_found'; reason: string }
    | { outcome: 'failed'; reason: string };

export async function startForecastGeneration(
    supabase: SupabaseClient,
    epicAhaId: string,
    createdBy: string
): Promise<StartForecastResult> {
    const { data: epicRow, error: epicError } = await supabase
        .from('epic')
        .select('id, name, target_launch_date, pricing_model, aha_fields')
        .eq('aha_id', epicAhaId)
        .maybeSingle();

    if (epicError) return { outcome: 'failed', reason: epicError.message };
    if (!epicRow) {
        return { outcome: 'not_found', reason: `No epic found for reference ${epicAhaId}.` };
    }

    const epic = epicRow as EpicRow;
    const description = (epic.aha_fields?.description as string | undefined) ?? epic.name ?? '';
    const epicContext = await gatherEpicContext(supabase, epic.id, epic.aha_fields);

    const generationInput = {
        epicAhaId,
        productName: epic.name ?? epicAhaId,
        productDescription: description,
        gaDate: epic.target_launch_date,
        pricingNotes: epic.pricing_model ?? undefined,
        revenueRisk: epicContext.revenueRisk ?? undefined,
        launchTier: epicContext.launchTier ?? undefined,
        commentsContext: epicContext.commentsContext,
        referencedUrls: epicContext.referencedUrls,
    };

    const baseUrl = (process.env.NETLIFY_URL || process.env.URL || '').replace(/\/$/, '');
    const isNetlifyProduction =
        Boolean(baseUrl) &&
        !baseUrl.includes('localhost') &&
        Boolean(process.env.NETLIFY_FORECAST_GENERATION_SECRET);

    if (!isNetlifyProduction) {
        try {
            const result = await runForecastGeneration(generationInput);
            const runId = await persistGeneratedRun(supabase, epic, epicAhaId, result, createdBy);
            return { outcome: 'completed', runId };
        } catch (err) {
            console.error('[startForecastGeneration] inline run failed:', err);
            return {
                outcome: 'failed',
                reason: err instanceof Error ? err.message : 'Failed to generate forecast',
            };
        }
    }

    const { data: job, error: jobError } = await supabase
        .from('forecast_generation_jobs')
        .insert({ epic_id: epic.id, epic_aha_id: epicAhaId, status: 'pending' })
        .select('id')
        .single();

    if (jobError || !job) {
        console.error('[startForecastGeneration] job insert failed:', jobError);
        return { outcome: 'failed', reason: 'Failed to start forecast generation' };
    }

    const jobId = (job as { id: string }).id;

    const triggerRes = await fetch(`${baseUrl}/.netlify/functions/forecast-generation-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jobId,
            epicAhaId,
            createdBy,
            generationInput,
            secret: process.env.NETLIFY_FORECAST_GENERATION_SECRET!,
        }),
    });

    if (!triggerRes.ok) {
        // The row is already there and would otherwise sit as 'pending' for
        // ever, which reads to a poller as "still working".
        await supabase
            .from('forecast_generation_jobs')
            .update({
                status: 'failed',
                error_message: 'Failed to start background generation',
                updated_at: new Date().toISOString(),
            })
            .eq('id', jobId);

        return { outcome: 'failed', reason: 'Failed to start forecast generation' };
    }

    return { outcome: 'started', jobId };
}
