/**
 * Tool: get-forecast-status
 *
 * Whether a backgrounded forecast run has finished. The counterpart to
 * generate-forecast, which returns a jobId rather than waiting.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  epicAhaId: z.string().describe('The Aha reference the run belongs to'),
  jobId: z.string().describe('The jobId returned by generate-forecast'),
});

export async function getForecastStatus(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { data: job, error } = await supabase
    .from('forecast_generation_jobs')
    .select('id, epic_aha_id, status, result, error_message, updated_at')
    .eq('id', parsed.data.jobId)
    // Scoped by epic as well as id, matching the HTTP route: a job id alone
    // should not read across epics.
    .eq('epic_aha_id', parsed.data.epicAhaId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!job) return { error: 'Job not found, or not for this epic.' };

  const row = job as {
    status: string;
    result: { run_id?: string } | null;
    error_message: string | null;
    updated_at: string;
  };

  return {
    jobId: parsed.data.jobId,
    status: row.status,
    // The background function writes 'running' then 'completed' or 'failed';
    // the route starts it at 'pending'. Saying which of those are terminal
    // beats making the caller guess from the word.
    finished: row.status === 'completed' || row.status === 'failed',
    // Present once it succeeds, so the caller can go straight to get-forecast.
    runId: row.result?.run_id ?? null,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}
