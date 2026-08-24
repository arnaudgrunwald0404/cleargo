import { diffCalendarDaysBetweenYmd } from '@/lib/date-utils';
import type {
    AgendaItem,
    PapricoDecisionType,
    UrgencyBand,
} from './types';

/** Render timezone per spec §6 (store UTC, render America/Los_Angeles). */
export const PAPRICO_TIMEZONE = 'America/Los_Angeles';

/** Default agenda horizon when a gating criterion has no per-criterion override. */
export const DEFAULT_LOOKAHEAD_DAYS = 60;

/** Open commitments surface when the due date is past or within this window. */
export const OPEN_COMMITMENT_WINDOW_DAYS = 14;

/** A criterion counts as complete when rated GO or NOT_APPLICABLE (CONDITIONAL_GO stays open). */
export function isCriterionStatusComplete(status: string | null | undefined): boolean {
    return status === 'GO' || status === 'NOT_APPLICABLE';
}

export function computeUrgencyBand(daysToStage: number | null | undefined): UrgencyBand | null {
    if (daysToStage == null) return null;
    if (daysToStage < 0) return 'overdue';
    if (daysToStage <= 14) return 'critical';
    if (daysToStage <= 30) return 'soon';
    return 'horizon';
}

const BAND_RANK: Record<UrgencyBand, number> = {
    overdue: 0,
    critical: 1,
    soon: 2,
    horizon: 3,
};

const TIER_RANK: Record<string, number> = {
    TIER_1: 0,
    TIER_2: 1,
    TIER_3: 2,
};

/** Sort: band → stage date ascending → tier (Tier 1 first). Dateless/bandless items last. */
export function compareAgendaItems(a: AgendaItem, b: AgendaItem): number {
    const bandA = a.band ? BAND_RANK[a.band] : 99;
    const bandB = b.band ? BAND_RANK[b.band] : 99;
    if (bandA !== bandB) return bandA - bandB;
    const dateA = a.stage_date ?? '9999-99-99';
    const dateB = b.stage_date ?? '9999-99-99';
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    const tierA = a.tier ? (TIER_RANK[a.tier] ?? 9) : 9;
    const tierB = b.tier ? (TIER_RANK[b.tier] ?? 9) : 9;
    if (tierA !== tierB) return tierA - tierB;
    return a.title.localeCompare(b.title);
}

export function composeReleaseItemTitle(
    epicName: string | null | undefined,
    criterionLabel: string | null | undefined
): string {
    const epic = epicName?.trim() || 'Unknown release';
    const criterion = criterionLabel?.trim() || 'Unknown criterion';
    return `${epic} — ${criterion}`;
}

/** True when the criterion stage date puts the pair inside the agenda window for a meeting. */
export function isWithinLookahead(
    stageDateYmd: string | null | undefined,
    meetingDateYmd: string,
    lookaheadDays: number
): boolean {
    const days = diffCalendarDaysBetweenYmd(stageDateYmd, meetingDateYmd);
    if (days == null) return false;
    // Past dates are included (they band as overdue); only far-future ones fall out.
    return days <= lookaheadDays;
}

export function daysToStage(stageDateYmd: string | null | undefined, todayYmd: string): number | null {
    return diffCalendarDaysBetweenYmd(stageDateYmd, todayYmd);
}

/** Days a commitment is past due (positive = overdue). */
export function commitmentAgeDays(dueDateYmd: string | null | undefined, todayYmd: string): number | null {
    const days = diffCalendarDaysBetweenYmd(dueDateYmd, todayYmd);
    return days == null ? null : -days;
}

/** A decision surfaces as an open commitment when incomplete and due (or nearly due). */
export function isOpenCommitment(
    decision: { owner_email: string | null; due_date: string | null; completed_at: string | null },
    todayYmd: string
): boolean {
    if (!decision.owner_email || !decision.due_date || decision.completed_at) return false;
    const days = diffCalendarDaysBetweenYmd(decision.due_date, todayYmd);
    return days != null && days <= OPEN_COMMITMENT_WINDOW_DAYS;
}

const DECISION_TYPES: PapricoDecisionType[] = [
    'approved',
    'approved_with_amendment',
    'rejected',
    'deferred',
    'assigned',
    'no_decision_needed',
];

const OWNER_REQUIRED_TYPES: PapricoDecisionType[] = ['approved', 'approved_with_amendment', 'assigned'];

/**
 * The single most important constraint in the spec: an assigned/approved decision
 * cannot be saved without an owner and a due date. Returns an error message or null.
 */
export function validateDecisionInput(input: {
    decision_type?: string | null;
    decision_text?: string | null;
    owner_email?: string | null;
    due_date?: string | null;
}): string | null {
    const type = input.decision_type as PapricoDecisionType | null | undefined;
    if (!type || !DECISION_TYPES.includes(type)) {
        return 'A decision type is required.';
    }
    if (!input.decision_text?.trim()) {
        return 'Decision text is required — write down what was actually decided.';
    }
    if (OWNER_REQUIRED_TYPES.includes(type) && !input.owner_email?.trim()) {
        return `A decision of type "${type}" requires an owner.`;
    }
    if (input.owner_email?.trim() && !input.due_date?.trim()) {
        return 'A due date is required when an owner is set.';
    }
    return null;
}

/** Section membership for a computed agenda item (open commitments are decisions, handled separately). */
export function sectionForItem(item: Pick<AgendaItem, 'source' | 'band'>): 'overdue_critical' | 'approaching' | 'standing' {
    if (item.source === 'standing') return 'standing';
    if (item.band === 'overdue' || item.band === 'critical') return 'overdue_critical';
    return 'approaching';
}

export function totalTimeBoxMinutes(items: Array<{ time_box_minutes: number | null }>): number {
    return items.reduce((sum, i) => sum + (i.time_box_minutes ?? 0), 0);
}

/** System note appended when a criterion flips complete and the item auto-closes. */
export function autoCloseNote(todayYmd: string): string {
    return `Auto-closed on ${todayYmd}: the gating criterion was marked complete in ClearGO.`;
}

export function appendSystemNote(existing: string | null | undefined, note: string): string {
    const prior = existing?.trim();
    return prior ? `${prior}\n${note}` : note;
}
