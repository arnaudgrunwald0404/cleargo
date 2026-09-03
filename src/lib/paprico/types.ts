import type { EpicTier } from '@/types/epics';

export type PapricoMeetingStatus = 'draft' | 'agenda_published' | 'held' | 'closed';

export type PapricoItemSource = 'release' | 'standing';

export type PapricoItemStatus =
    | 'proposed'
    | 'on_agenda'
    | 'decided'
    | 'deferred'
    | 'blocked'
    | 'closed';

export type PapricoDecisionType =
    | 'approved'
    | 'approved_with_amendment'
    | 'rejected'
    | 'deferred'
    | 'assigned'
    | 'no_decision_needed';

export type UrgencyBand = 'overdue' | 'critical' | 'soon' | 'horizon';

export type PapricoLink = { label: string; url: string };

export interface PapricoMeeting {
    id: string;
    meeting_date: string; // YYYY-MM-DD
    chair_email: string | null;
    status: PapricoMeetingStatus;
    meeting_length_minutes: number;
    agenda_published_at: string | null;
    agenda_snapshot: PapricoAgenda | null;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface PapricoItem {
    id: string;
    source: PapricoItemSource;
    epic_id: string | null;
    criterion_id: string | null;
    title: string;
    description: string | null;
    category: string | null;
    owner_email: string | null;
    status: PapricoItemStatus;
    blocked_reason: string | null;
    time_box_minutes: number | null;
    sort_order: number;
    auto_closed: boolean;
    system_notes: string | null;
    links: PapricoLink[] | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface PapricoDecision {
    id: string;
    item_id: string;
    meeting_id: string;
    decision_type: PapricoDecisionType;
    decision_text: string;
    rationale: string | null;
    owner_email: string | null;
    due_date: string | null; // YYYY-MM-DD
    completed_at: string | null;
    completed_by: string | null;
    supersedes_id: string | null;
    decided_by: string;
    decided_at: string;
}

export interface PapricoGatingCriterion {
    criterion_id: string;
    enabled: boolean;
    lookahead_days: number | null; // null = default lookahead
    created_at?: string;
    updated_at?: string;
    /** Joined from criterion for display; null when the criterion was deleted. */
    criterion?: {
        id: string;
        label: string;
        category: string | null;
        is_active: boolean;
    } | null;
}

/** A paprico_item enriched with the release/criterion context the agenda renders. */
export interface AgendaItem extends PapricoItem {
    epic_name: string | null;
    release_name: string | null;
    tier: EpicTier | null;
    criterion_label: string | null;
    stage_name: string | null;
    stage_date: string | null; // YYYY-MM-DD
    days_to_stage: number | null;
    band: UrgencyBand | null;
    /** Linked epic or criterion no longer exists (item renders as orphaned). */
    orphaned: boolean;
    decision_count: number;
}

/** An open commitment: a decision with an owner and due date, not yet complete. */
export interface OpenCommitment extends PapricoDecision {
    item_title: string | null;
    age_days: number | null; // days past due (negative = due in the future)
}

export interface PapricoAgenda {
    computed_at: string;
    today: string; // YYYY-MM-DD in the render timezone
    open_commitments: OpenCommitment[];
    overdue_critical: AgendaItem[];
    approaching: AgendaItem[];
    standing: AgendaItem[];
    total_time_box_minutes: number;
}
