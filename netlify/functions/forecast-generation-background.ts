/**
 * Netlify Background Function: live forecast generation (runs up to 15 min).
 * Invoked by POST /api/forecasts/[epicId]/generate when running on Netlify production.
 * Mirrors netlify/functions/heart-setup-background.ts.
 */

import { createClient } from '@supabase/supabase-js';
import { runForecastGeneration, type ForecastGenerationInput } from '../../src/lib/forecast/orchestrator';
import { persistGeneratedRun } from '../../src/lib/forecast/persist';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;

interface Body {
  jobId: string;
  epicAhaId: string;
  createdBy: string;
  generationInput: ForecastGenerationInput;
  secret?: string;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { jobId, epicAhaId, createdBy, generationInput, secret } = body;
  const expectedSecret = process.env.NETLIFY_FORECAST_GENERATION_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!jobId || !epicAhaId || !generationInput) {
    return new Response(JSON.stringify({ error: 'Missing jobId, epicAhaId, or generationInput' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(supabaseUrl, supabaseKey);

  try {
    await adminClient
      .from('forecast_generation_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('epic_aha_id', epicAhaId);

    const { data: epicRow } = await adminClient.from('epic').select('id').eq('aha_id', epicAhaId).maybeSingle();
    const result = await runForecastGeneration(generationInput);
    const runId = await persistGeneratedRun(
      adminClient,
      { id: (epicRow as { id: string } | null)?.id ?? null },
      epicAhaId,
      result,
      createdBy
    );

    await adminClient
      .from('forecast_generation_jobs')
      .update({ status: 'completed', result: { run_id: runId }, updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('epic_aha_id', epicAhaId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[forecast-generation-background]', message, err);
    await adminClient
      .from('forecast_generation_jobs')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('epic_aha_id', epicAhaId);
  }

  return new Response(JSON.stringify({ accepted: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
