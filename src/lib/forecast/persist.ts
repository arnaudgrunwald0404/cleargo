import type { SupabaseClient } from '@supabase/supabase-js';
import type { ForecastGenerationResult } from './orchestrator';

export interface PersistEpicRef {
    id: string | null;
}

/**
 * Writes a generated forecast result as a new current forecast_runs version, demoting the
 * prior current run (never deleting it). Shared by the synchronous generate route and the
 * Netlify background function so both persist identically.
 */
export async function persistGeneratedRun(
    adminSupabase: SupabaseClient,
    epic: PersistEpicRef,
    epicAhaId: string,
    result: ForecastGenerationResult,
    createdBy: string
): Promise<string> {
    const { data: currentRun } = await adminSupabase
        .from('forecast_runs')
        .select('id')
        .eq('epic_aha_id', epicAhaId)
        .eq('is_current', true)
        .maybeSingle();

    const { data: newRun, error: newRunError } = await adminSupabase
        .from('forecast_runs')
        .insert({
            epic_id: epic.id,
            epic_aha_id: epicAhaId,
            source: 'generated',
            status: 'complete',
            is_current: true,
            created_by: createdBy,
        })
        .select('id')
        .single();

    if (newRunError || !newRun) {
        throw new Error(`Failed to create forecast run: ${newRunError?.message}`);
    }
    const newRunId = (newRun as { id: string }).id;

    if (currentRun) {
        await adminSupabase.from('forecast_runs').update({ is_current: false }).eq('id', (currentRun as { id: string }).id);
    }

    await Promise.all([
        adminSupabase
            .from('forecast_assumptions')
            .insert(result.assumptions.map((a, i) => ({ ...a, run_id: newRunId, sort_order: i }))),
        adminSupabase
            .from('forecast_periods')
            .insert(result.periods.map((p, i) => ({ ...p, run_id: newRunId, sort_order: i }))),
        adminSupabase
            .from('forecast_narrative')
            .insert(result.narrative.map((n, i) => ({ ...n, run_id: newRunId, sort_order: i }))),
    ]);

    return newRunId;
}
