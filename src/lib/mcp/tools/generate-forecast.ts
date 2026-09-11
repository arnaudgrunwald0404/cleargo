/**
 * Tool: generate-forecast
 *
 * Runs the live forecast pipeline for an epic.
 *
 * This is the most expensive write the connector has: several AI agents,
 * minutes of wall clock, and it replaces the epic's current forecast. It is
 * gated on forecast.generate for that reason -- note the HTTP route behind the
 * Generate Forecast button checks only that you are signed in, so the connector
 * is deliberately the stricter of the two until that is decided separately.
 *
 * Two shapes of success, and the caller has to tell them apart: on Netlify
 * production the run is handed to a background function and this returns a
 * jobId to poll, because the pipeline is far past the 26s synchronous cap.
 * Locally there is no cap and the forecast already exists when this returns.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { actorCan } from '@/lib/permissions-server';
import { startForecastGeneration } from '@/lib/forecast/startGeneration';

export const InputSchema = z.object({
  epicAhaId: z
    .string()
    .describe('The Aha reference for the epic, e.g. CC-EPIC-123. Not the epic UUID.'),
});

export async function generateForecast(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!(await actorCan(actor, 'forecast.generate', supabase))) {
    return { error: 'You do not have permission to generate forecasts.' };
  }

  const result = await startForecastGeneration(supabase, parsed.data.epicAhaId, actor.email);

  if (result.outcome === 'not_found' || result.outcome === 'failed') {
    return { error: result.reason };
  }

  if (result.outcome === 'completed') {
    return {
      success: true,
      status: 'COMPLETE',
      runId: result.runId,
      message: 'Forecast generated. Read it with get-forecast.',
    };
  }

  return {
    success: true,
    status: 'RUNNING',
    jobId: result.jobId,
    message:
      'Forecast generation started in the background; it usually takes a few minutes. Poll get-forecast-status with this jobId, then read the result with get-forecast.',
  };
}
