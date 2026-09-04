/**
 * Tool: get-forecast
 *
 * The current (or a specific) ARR forecast run for an epic, with its
 * assumptions, periods and narrative.
 *
 * Read only. Generation is not exposed: the start/poll orchestration -- the
 * environment sniff, the job row, the background fetch and the failure rollback
 * -- is hand-rolled inside the generate route rather than extracted the way
 * startArtifactDraft is, so wrapping it would mean transcribing it. That is a
 * separate change.
 *
 * Note the id: forecasts are keyed by the Aha reference (e.g. CC-EPIC-123), NOT
 * the epic UUID that every other epic tool takes.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  epicAhaId: z
    .string()
    .describe('The Aha reference for the epic, e.g. CC-EPIC-123. Not the epic UUID.'),
  runId: z.string().optional().describe('A specific run; defaults to the current one'),
});

export async function getForecast(
  supabase: SupabaseClient,
  args: Record<string, unknown>
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  let runQuery = supabase
    .from('forecast_runs')
    .select('id, epic_aha_id, source, status, is_current, created_at, created_by')
    .eq('epic_aha_id', parsed.data.epicAhaId);
  runQuery = parsed.data.runId
    ? runQuery.eq('id', parsed.data.runId)
    : runQuery.eq('is_current', true);

  const { data: run, error: runError } = await runQuery.maybeSingle();
  if (runError) return { error: runError.message };

  if (!run) {
    return {
      epicAhaId: parsed.data.epicAhaId,
      run: null,
      note: 'No forecast has been generated for this epic yet.',
    };
  }

  const runId = (run as { id: string }).id;

  const [assumptions, periods, narrative] = await Promise.all([
    supabase
      .from('forecast_assumptions')
      .select('id, key, label, value_bear, value_base, value_bull, confidence, source_note, sort_order')
      .eq('run_id', runId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('forecast_periods')
      .select('id, scenario, period_type, period_label, cross_sell_arr_usd, net_new_arr_usd, churn_reduction_arr_usd, total_arr_usd, sort_order')
      .eq('run_id', runId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('forecast_narrative')
      .select('id, section, content, sort_order')
      .eq('run_id', runId)
      .order('sort_order', { ascending: true }),
  ]);

  const failure = assumptions.error ?? periods.error ?? narrative.error;
  if (failure) return { error: failure.message };

  return {
    epicAhaId: parsed.data.epicAhaId,
    run,
    assumptions: assumptions.data ?? [],
    periods: periods.data ?? [],
    narrative: narrative.data ?? [],
  };
}
