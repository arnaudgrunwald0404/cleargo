/**
 * Launch artifacts — the five Google Docs behind the workback runway.
 *
 * The Google Doc is the system of record for content. Everything here is
 * identity, workflow state, and an audit trail of what the agent could see.
 */

/** The five documents, in workback order. */
export type ArtifactType =
    | 'gate_checklist'
    | 'story_brief'
    | 'messaging_brief'
    | 'enablement_guide'
    | 'marketing_brief';

export const ARTIFACT_TYPES: ArtifactType[] = [
    'gate_checklist',
    'story_brief',
    'messaging_brief',
    'enablement_guide',
    'marketing_brief',
];

/**
 * The review cycle. A new vocabulary rather than a reuse: the existing
 * draft/ratified pair on epic_story_brief has no state for "the agent has
 * drafted this and is waiting on a human", which is the entire point.
 */
export type ArtifactStatus =
    | 'NOT_STARTED'
    | 'DRAFTING'
    | 'PENDING_REVIEW'
    | 'CHANGES_REQUESTED'
    | 'APPROVED';

/** Statuses that mean nobody is waiting on a human right now. */
export const ARTIFACT_TERMINAL_STATUSES: ArtifactStatus[] = ['APPROVED'];

/** Statuses that put the artifact in someone's queue. */
export const ARTIFACT_AWAITING_HUMAN: ArtifactStatus[] = ['PENDING_REVIEW', 'CHANGES_REQUESTED'];

export interface LaunchArtifact {
    id: string;
    launch_id: string;
    artifact_type: ArtifactType;
    criterion_id: string | null;
    doc_id: string | null;
    doc_url: string | null;
    folder_id: string | null;
    status: ArtifactStatus;
    version: string;
    owner_email: string | null;
    ai_draft: Record<string, unknown>;
    context_snapshot: Record<string, unknown>;
    validation_snapshot: Record<string, unknown>;
    change_request_note: string | null;
    generation: number;
    last_drafted_at: string | null;
    submitted_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
}

export type ArtifactFlagStatus = 'open' | 'asked' | 'answered' | 'deferred';

export interface LaunchArtifactFlag {
    id: string;
    launch_artifact_id: string;
    flag_key: string;
    section: string;
    claim: string;
    question: string | null;
    status: ArtifactFlagStatus;
    answer: string | null;
    asked_at: string | null;
    answered_at: string | null;
    answered_by: string | null;
    last_seen_generation: number;
    created_at: string;
    updated_at: string;
}

/** Human-facing names. Used in Slack copy, the UI, and Doc filenames. */
export const ARTIFACT_LABEL: Record<ArtifactType, string> = {
    gate_checklist: 'Launch Gate Checklist',
    story_brief: 'Story Brief',
    messaging_brief: 'Messaging Brief',
    enablement_guide: 'Enablement Guide',
    marketing_brief: 'Marketing Brief',
};

/**
 * Filename fragment, matching Kristin's convention `[CODE]_Story-Brief_v0.1`.
 * Hyphenated, not spaced — the filed examples all use hyphens.
 */
export const ARTIFACT_FILENAME_PART: Record<ArtifactType, string> = {
    gate_checklist: 'Launch-Gate-Checklist',
    story_brief: 'Story-Brief',
    messaging_brief: 'Messaging-Brief',
    enablement_guide: 'Enablement-Guide',
    marketing_brief: 'Marketing-Brief',
};

/**
 * The numbered prefix from Kristin's canonical folder (00-04). Confirms the
 * runway order and is used to name the per-launch subfolder entries so a launch
 * folder reads the same way her template folder does.
 */
export const ARTIFACT_FOLDER_PREFIX: Record<ArtifactType, string> = {
    gate_checklist: '00',
    story_brief: '01',
    messaging_brief: '02',
    enablement_guide: '03',
    marketing_brief: '04',
};

export const ARTIFACT_STATUS_LABEL: Record<ArtifactStatus, string> = {
    NOT_STARTED: 'Not started',
    DRAFTING: 'Drafting',
    PENDING_REVIEW: 'Pending review',
    CHANGES_REQUESTED: 'Changes requested',
    APPROVED: 'Approved',
};
