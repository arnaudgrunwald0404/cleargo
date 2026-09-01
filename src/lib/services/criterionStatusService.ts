/**
 * Scoring a readiness criterion, from anywhere.
 *
 * This was ~150 lines inline in the PATCH route with nothing exported, so a
 * Slack modal or an MCP tool wanting to do the same thing had three bad
 * options: call the HTTP route from the server, re-implement the side effects,
 * or skip them. All the pieces it composes (recomputeEpicReadiness,
 * logStatusChange, maybeNotifyGateOwnerForCategory) were already exported --
 * only the orchestration was trapped.
 *
 * Returns a discriminated union rather than throwing, because the three callers
 * need different things from a refusal: HTTP wants a status code, a Slack
 * view_submission wants `response_action: 'errors'` keyed to a block_id, and an
 * MCP tool wants `{ error }` in its result. Throwing would make all three
 * string-match a message. `throw` is reserved for genuine faults.
 *
 * The readiness recompute is the slow part -- it re-reads every criterion and
 * can fan out into Slack, email and an Aha write-back -- so it is optional.
 * Slack's 3-second view_submission budget cannot absorb it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules, getFeatureFlags } from '@/lib/settings-db';
import { isEnabled, FEATURE_NOT_APPLICABLE } from '@/lib/flags';
import { logStatusChange } from '@/lib/db/criterion-status-history';
import { maybeNotifyGateOwnerForCategory } from '@/lib/services/gateSignoffService';
import { trackActivityFromAction } from '@/lib/services/userActivityService';
import { recomputeEpicReadiness } from '@/lib/readiness';

/**
 * The values the scoring engine understands (src/lib/readiness-scoring.ts),
 * plus the 'CONDITIONAL' spelling already stored in the table.
 *
 * epic_criterion_status.status is bare `text` with no CHECK constraint, so this
 * list is the only thing standing between a typo and a row nothing can read.
 * A constraint is the real fix but needs a three-deploy NOT VALID / normalize /
 * VALIDATE dance, so for now this function is the constraint.
 */
export const SCOREABLE_STATUSES = [
    'GO',
    'CONDITIONAL',
    'CONDITIONAL_GO',
    'NO_GO',
    'NOT_SET',
    'NOT_APPLICABLE',
] as const;

/** Aliases the PATCH route has always accepted from clients. */
const NOT_APPLICABLE_ALIASES = new Set(['NOT_APPLICABLE', 'NA', 'N/A']);

export interface ScoreActor {
    /** app_user.id. The uuid FK behind last_updated_by and audit_log.actor_id. */
    id: string;
    email: string;
    roles: string[];
}

export interface ScoreCriterionInput {
    status?: string;
    notes?: string | null;
    condition?: string | null;
    conditionDueDate?: string | null;
    dataSourceValues?: unknown;
}

export interface ScoreCriterionOptions {
    supabase: SupabaseClient;
    /**
     * 'await'  — recompute inline; the caller waits. Web PATCH.
     * 'skip'   — do not recompute; the caller is arranging it. Slack, MCP.
     */
    readiness?: 'await' | 'skip';
}

export type ScoreCriterionResult =
    | {
          outcome: 'updated';
          row: Record<string, unknown>;
          previousStatus: string | null;
          statusChanged: boolean;
          readiness: 'recomputed' | 'failed' | 'skipped';
          warnings: string[];
      }
    | { outcome: 'forbidden'; reason: string }
    | { outcome: 'not_found'; reason: string }
    | { outcome: 'rejected'; reason: string };

function normalizeIncomingStatus(raw: string): string | null {
    const upper = raw.toUpperCase().trim();
    if (NOT_APPLICABLE_ALIASES.has(upper)) return 'NOT_APPLICABLE';
    return (SCOREABLE_STATUSES as readonly string[]).includes(upper) ? upper : null;
}

/**
 * Score a criterion and run every side effect the web app runs.
 *
 * Ordering matters and is not arbitrary: everything that can REFUSE happens
 * before the write, because a Slack modal can only show an error while it is
 * still open. Once it closes there is nowhere to put one.
 */
export async function scoreEpicCriterion(
    epicId: string,
    statusRowId: string,
    input: ScoreCriterionInput,
    actor: ScoreActor,
    options: ScoreCriterionOptions
): Promise<ScoreCriterionResult> {
    const { supabase } = options;
    const warnings: string[] = [];

    // --- capability -------------------------------------------------------
    // Effective rules, not DEFAULT_RULES: an admin's override in Settings has
    // to bind every surface or "same permissions everywhere" is a slogan.
    const rules = await getEffectivePermissionRules(supabase);
    if (!canRolesPerformWithRules(actor.roles, 'criteria.status.update', rules)) {
        return { outcome: 'forbidden', reason: 'You do not have permission to score criteria.' };
    }

    // --- value validation -------------------------------------------------
    let nextStatus: string | undefined;
    if (typeof input.status !== 'undefined') {
        if (typeof input.status !== 'string') {
            return { outcome: 'rejected', reason: 'Status must be a string.' };
        }
        const normalized = normalizeIncomingStatus(input.status);
        if (!normalized) {
            return {
                outcome: 'rejected',
                reason: `Unknown status "${input.status}". Expected one of: ${SCOREABLE_STATUSES.join(', ')}.`,
            };
        }
        nextStatus = normalized;
    }

    // --- the row, and the rules that depend on it -------------------------
    const { data: existing } = await supabase
        .from('epic_criterion_status')
        .select('id, status, criterion_id, criterion:criterion_id(gate)')
        .eq('id', statusRowId)
        .eq('epic_id', epicId)
        .maybeSingle();

    if (!existing) {
        return { outcome: 'not_found', reason: 'That criterion is not on this release.' };
    }

    const criterion = (existing as { criterion?: { gate?: boolean } | { gate?: boolean }[] }).criterion;
    const gate = Array.isArray(criterion) ? criterion[0]?.gate === true : criterion?.gate === true;

    if (nextStatus === 'NOT_APPLICABLE') {
        const flags = await getFeatureFlags(supabase);
        if (!isEnabled(FEATURE_NOT_APPLICABLE, flags)) {
            return { outcome: 'rejected', reason: 'Not Applicable is not enabled.' };
        }
        // A gate cannot be waived: that is the whole point of a gate.
        if (gate) {
            return { outcome: 'rejected', reason: 'A gating criterion cannot be Not Applicable.' };
        }
    }

    const previousStatus: string | null = (existing as { status?: string | null }).status ?? null;

    // --- write ------------------------------------------------------------
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { last_updated_at: now, last_updated_by: actor.id };
    if (typeof nextStatus !== 'undefined') updateData.status = nextStatus;
    if (typeof input.notes !== 'undefined') updateData.current_status_notes = input.notes;
    if (typeof input.condition !== 'undefined') updateData.condition = input.condition;
    if (typeof input.conditionDueDate !== 'undefined') updateData.condition_due_date = input.conditionDueDate;
    if (typeof input.dataSourceValues !== 'undefined') updateData.data_source_values = input.dataSourceValues;

    const { data: row, error } = await supabase
        .from('epic_criterion_status')
        .update(updateData)
        .eq('id', statusRowId)
        .eq('epic_id', epicId) // scope the write, not just the read
        .select('*, data_source_values')
        .single();

    if (error || !row) {
        throw new Error(error?.message ?? 'Could not save the score.');
    }

    const statusChanged =
        typeof nextStatus !== 'undefined' && row.status != null && row.status !== previousStatus;

    // --- audit, awaited ---------------------------------------------------
    // Both of these were fire-and-forget in the route. In a serverless function
    // a promise left running after the response is not guaranteed to finish,
    // and these are the audit trail — the one thing that must not be best
    // effort. They are two cheap inserts on a connection already open.
    if (statusChanged) {
        const { error: auditError } = await supabase.from('audit_log').insert({
            actor_id: actor.id,
            entity_type: 'epic_criterion_status',
            entity_id: statusRowId,
            json_diff: { status: { old: previousStatus, new: row.status } },
        });
        if (auditError) warnings.push(`Audit row not written: ${auditError.message}`);

        try {
            await logStatusChange({
                epicCriterionStatusId: statusRowId,
                epicId,
                criterionId: row.criterion_id,
                oldStatus: previousStatus,
                newStatus: row.status,
                changedBy: actor.id,
            });
        } catch (err) {
            warnings.push(`Status history not written: ${err instanceof Error ? err.message : String(err)}`);
        }

        trackActivityFromAction(actor.id).catch((err: unknown) => {
            console.error('[scoreEpicCriterion] activity tracking failed:', err);
        });
    }

    // --- gate sign-off nudge ----------------------------------------------
    // Awaited so a Slack or MCP caller does not return before it runs, for the
    // same reason as above. It is one query in the common case.
    if (typeof nextStatus !== 'undefined') {
        try {
            await maybeNotifyGateOwnerForCategory(epicId, statusRowId, supabase);
        } catch (err) {
            warnings.push(
                `Gate sign-off check failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    // --- readiness --------------------------------------------------------
    let readiness: 'recomputed' | 'failed' | 'skipped' = 'skipped';
    if ((options.readiness ?? 'await') === 'await') {
        try {
            await recomputeEpicReadiness(epicId, actor.id, supabase);
            readiness = 'recomputed';
        } catch (err) {
            // Never fatal: the score is saved, and readiness recomputes on the
            // next change or a manual trigger.
            readiness = 'failed';
            warnings.push(
                `Readiness not recomputed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    return { outcome: 'updated', row, previousStatus, statusChanged, readiness, warnings };
}
