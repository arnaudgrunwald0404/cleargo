/**
 * Applying a PM adjustment to a confidence rating.
 *
 * Two things have to happen together: the rating row is recalculated from
 * `calculated_percentage + adjustment` (clamped, re-levelled), and a history row
 * is appended recording what moved and why. Doing one without the other leaves
 * either an unexplained number or a history that does not match the rating.
 *
 * Extracted so the HTTP route and the MCP tool run the same path rather than two
 * transcriptions of it. Returns outcomes rather than throwing, the same shape
 * criterionStatusService uses, because the callers need to render a reason: an
 * HTTP status code in one case and a tool result in the other.
 *
 * The capability check is deliberately NOT here. Both callers gate before
 * calling, at the point where they already know the actor -- the route from a
 * cookie session, the tool from an OAuth token.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { percentageToLevel } from '@/lib/roadmap/confidenceCalculator';

export interface AdjustConfidenceInput {
    ahaKey: string;
    snapshotDate: string;
    newAdjustment: number;
    note?: string | null;
    authorEmail: string;
}

export type AdjustConfidenceResult =
    | {
          outcome: 'updated';
          finalPercentage: number;
          finalConfidence: string;
          previousAdjustment: number;
          previousFinalPercentage: number;
      }
    | { outcome: 'not_found'; reason: string }
    | { outcome: 'failed'; reason: string };

export async function adjustConfidenceRating(
    supabase: SupabaseClient,
    input: AdjustConfidenceInput
): Promise<AdjustConfidenceResult> {
    const { ahaKey, snapshotDate, newAdjustment, note, authorEmail } = input;

    const { data: existing, error: readErr } = await supabase
        .from('confidence_rating')
        .select('id, pm_adjustment, calculated_percentage, final_percentage')
        .eq('aha_key', ahaKey)
        .eq('snapshot_date', snapshotDate)
        .maybeSingle();

    if (readErr) return { outcome: 'failed', reason: readErr.message };
    if (!existing) {
        return {
            outcome: 'not_found',
            reason: `No confidence rating for ${ahaKey} on ${snapshotDate}.`,
        };
    }

    const row = existing as {
        id: string;
        pm_adjustment: number | null;
        calculated_percentage: number;
        final_percentage: number | null;
    };

    const calculated = row.calculated_percentage;
    const previousAdjustment = row.pm_adjustment ?? 0;
    const previousFinalPercentage = row.final_percentage ?? calculated;
    const finalPercentage = Math.max(0, Math.min(100, calculated + newAdjustment));
    const finalConfidence = percentageToLevel(finalPercentage);

    const { error: updErr } = await supabase
        .from('confidence_rating')
        .update({
            pm_adjustment: newAdjustment,
            final_percentage: finalPercentage,
            final_confidence: finalConfidence,
            author_email: authorEmail,
        })
        .eq('id', row.id);

    if (updErr) return { outcome: 'failed', reason: updErr.message };

    const { error: histErr } = await supabase.from('confidence_adjustment_history').insert({
        aha_key: ahaKey,
        snapshot_date: snapshotDate,
        previous_adjustment: previousAdjustment,
        new_adjustment: newAdjustment,
        adjustment_delta: newAdjustment - previousAdjustment,
        previous_final_percentage: previousFinalPercentage,
        new_final_percentage: finalPercentage,
        adjustment_note: note ?? null,
        author_email: authorEmail,
    });

    // The rating is already updated at this point. Reporting success would hide
    // that the audit trail is now incomplete.
    if (histErr) return { outcome: 'failed', reason: histErr.message };

    return {
        outcome: 'updated',
        finalPercentage,
        finalConfidence,
        previousAdjustment,
        previousFinalPercentage,
    };
}
