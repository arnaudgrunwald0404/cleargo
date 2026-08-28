/**
 * Asking an owner to review a drafted launch document.
 *
 * These are the first approve/reject interactive components in the repo —
 * everything else that "acts" in Slack is a link out to the web app. The reason
 * to do it in Slack is that the whole point of the automation is removing the
 * step where a human has to go somewhere to unblock the runway.
 *
 * The modal mechanics are copied from story-brief-interview.ts because they are
 * correct and hard-won: `private_metadata` carries state across the submission
 * boundary (Slack does not echo the button value into `view_submission`), and
 * `block_id` carries the row id so answers map back exactly.
 */
import { ARTIFACT_LABEL, type ArtifactType } from '@/types/artifacts';

export const ARTIFACT_APPROVE_ACTION = 'launch_artifact_approve';
export const ARTIFACT_CHANGES_ACTION = 'launch_artifact_request_changes';
export const ARTIFACT_ANSWER_ACTION = 'launch_artifact_answer_flags';

export const ARTIFACT_CHANGES_CALLBACK = 'launch_artifact_changes';
export const ARTIFACT_ANSWER_CALLBACK = 'launch_artifact_answers';

/** Slack caps modal titles at 24 characters. */
const TITLE_MAX = 24;

/** Five is what fits before a modal becomes a form nobody finishes. */
export const MAX_QUESTIONS_PER_MODAL = 5;

/** Enough blockers to see the shape of the problem without reading a paragraph. */
const MAX_NAMED_FLAGS = 3;

export interface ArtifactReviewTarget {
    artifactId: string;
    launchId: string;
    launchName: string;
    artifactType: ArtifactType;
    docUrl?: string | null;
    appUrl?: string;
}

function truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** State that must survive the button -> modal -> submission round trip. */
function meta(target: ArtifactReviewTarget): string {
    return JSON.stringify({
        artifactId: target.artifactId,
        launchId: target.launchId,
        artifactType: target.artifactType,
    });
}

/**
 * The review request DM.
 *
 * Names what the agent could not ground rather than only saying "ready for
 * review" — the reviewer's job is precisely those gaps, so leading with them
 * turns a notification into a task.
 */
export function buildArtifactReviewMessage(
    target: ArtifactReviewTarget,
    input: {
        openQuestions: number;
        topFlags: string[];
        confidence?: string | null;
        reviewAsk: string;
        warnings?: string[];
    }
): { text: string; blocks: unknown[] } {
    const label = ARTIFACT_LABEL[target.artifactType];
    const fallback = `${label} drafted for ${target.launchName} — ready for your review`;

    const blocks: unknown[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: truncate(`${label} ready for review`, 150) },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${target.launchName}*\n${input.reviewAsk}`,
            },
        },
    ];

    if (input.confidence) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    // Confidence is computed from source availability and the
                    // ungrounded fraction, not self-reported by the model.
                    text: `Draft confidence: *${input.confidence}*${
                        input.openQuestions > 0 ? ` · ${input.openQuestions} open question${input.openQuestions === 1 ? '' : 's'}` : ''
                    }`,
                },
            ],
        });
    }

    if (input.topFlags.length > 0) {
        const named = input.topFlags.slice(0, MAX_NAMED_FLAGS).map((f) => `• ${truncate(f, 160)}`);
        const extra = input.topFlags.length - named.length;
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*The agent could not confirm:*\n${named.join('\n')}${
                    extra > 0 ? `\n_+${extra} more_` : ''
                }`,
            },
        });
    }

    for (const warning of input.warnings ?? []) {
        blocks.push({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `:warning: ${truncate(warning, 300)}` }],
        });
    }

    const actions: unknown[] = [];

    if (target.docUrl) {
        actions.push({
            type: 'button',
            text: { type: 'plain_text', text: 'Open document' },
            url: target.docUrl,
            // No action_id handler needed: a url button does not dispatch.
            action_id: 'launch_artifact_open_doc',
        });
    }

    if (input.openQuestions > 0) {
        actions.push({
            type: 'button',
            text: {
                type: 'plain_text',
                text: `Answer ${input.openQuestions} question${input.openQuestions === 1 ? '' : 's'}`,
            },
            action_id: ARTIFACT_ANSWER_ACTION,
            value: meta(target),
        });
    }

    actions.push(
        {
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: 'Approve' },
            action_id: ARTIFACT_APPROVE_ACTION,
            value: meta(target),
            // Approving promotes to v1.0, clears a readiness criterion and
            // releases the next artifact. Worth a deliberate second tap.
            confirm: {
                title: { type: 'plain_text', text: 'Approve this draft?' },
                text: {
                    type: 'mrkdwn',
                    text: `This promotes the ${label} to v1.0, marks its readiness criterion done, and unblocks the next document in the runway.`,
                },
                confirm: { type: 'plain_text', text: 'Approve' },
                deny: { type: 'plain_text', text: 'Not yet' },
            },
        },
        {
            type: 'button',
            text: { type: 'plain_text', text: 'Request changes' },
            action_id: ARTIFACT_CHANGES_ACTION,
            value: meta(target),
        }
    );

    blocks.push({ type: 'actions', elements: actions });

    return { text: fallback, blocks };
}

/**
 * The change-request modal.
 *
 * The reason is required, not optional: it is fed verbatim into the next draft
 * as an instruction, so "rejected, no reason" produces an identical redraft and
 * wastes everyone's time.
 */
export function buildChangeRequestModal(target: ArtifactReviewTarget): Record<string, unknown> {
    const label = ARTIFACT_LABEL[target.artifactType];
    return {
        type: 'modal',
        callback_id: ARTIFACT_CHANGES_CALLBACK,
        private_metadata: meta(target),
        title: { type: 'plain_text', text: truncate('Request changes', TITLE_MAX) },
        submit: { type: 'plain_text', text: 'Send back' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${label}* — ${truncate(target.launchName, 120)}`,
                },
            },
            {
                type: 'input',
                block_id: 'change_request',
                label: { type: 'plain_text', text: 'What needs to change?' },
                hint: {
                    type: 'plain_text',
                    text: 'Given to the agent verbatim for the next draft. Be specific.',
                },
                element: {
                    type: 'plain_text_input',
                    action_id: 'reason',
                    multiline: true,
                    max_length: 3000,
                },
            },
        ],
    };
}

export interface ArtifactFlagForModal {
    id: string;
    section: string;
    claim: string;
    question?: string | null;
}

/** Human labels for the section keys the schemas use. */
const SECTION_LABELS: Record<string, string> = {
    what_we_are_building: 'What we are building',
    why_we_prioritized_it: 'Why we prioritized it',
    value_story: 'The value story',
    naming_and_usage: 'Naming & usage',
    positioning: 'Positioning',
    what_this_is: 'What this is',
    identification: 'Launch identification',
    gate_1_naming: 'Gate 1 — Naming',
    gate_2_pricing: 'Gate 2 — Pricing',
    gate_3_beta: 'Gate 3 — Beta',
};

function sectionLabel(section: string): string {
    return SECTION_LABELS[section] ?? section.replace(/_/g, ' ');
}

function promptFor(flag: ArtifactFlagForModal): string {
    if (flag.question?.trim()) return flag.question.trim();
    return `Can you confirm or correct this? "${flag.claim}"`;
}

/**
 * The interview modal. Every input is optional on purpose — a partial answer is
 * progress, and forcing all five would mean a PM who knows three abandons the
 * whole thing.
 */
export function buildArtifactInterviewModal(
    target: ArtifactReviewTarget,
    flags: ArtifactFlagForModal[]
): Record<string, unknown> {
    const shown = flags.slice(0, MAX_QUESTIONS_PER_MODAL);
    const remaining = flags.length - shown.length;

    const blocks: unknown[] = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${ARTIFACT_LABEL[target.artifactType]}* — ${truncate(target.launchName, 120)}\nThese are the things the agent could not ground. Answers feed the next draft.`,
            },
        },
    ];

    for (const flag of shown) {
        blocks.push({
            type: 'context',
            block_id: `ctx_${flag.id}`,
            elements: [{ type: 'mrkdwn', text: `*${sectionLabel(flag.section)}*` }],
        });
        blocks.push({
            type: 'input',
            // The block_id IS the flag row id — that is how answers map back.
            block_id: flag.id,
            optional: true,
            label: { type: 'plain_text', text: truncate(promptFor(flag), 2000) },
            element: { type: 'plain_text_input', action_id: 'answer', multiline: true },
        });
    }

    if (remaining > 0) {
        blocks.push({
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `_${remaining} more question${remaining === 1 ? '' : 's'} after these._` },
            ],
        });
    }

    return {
        type: 'modal',
        callback_id: ARTIFACT_ANSWER_CALLBACK,
        private_metadata: meta(target),
        title: { type: 'plain_text', text: truncate('Open questions', TITLE_MAX) },
        submit: { type: 'plain_text', text: 'Save answers' },
        close: { type: 'plain_text', text: 'Later' },
        blocks,
    };
}

export interface ParsedArtifactSubmission {
    artifactId: string | null;
    launchId: string | null;
    artifactType: ArtifactType | null;
    answers: Record<string, string>;
    reason: string | null;
}

/**
 * Read a submission back. Skips the `ctx_` context blocks and drops blanks — a
 * blank is a skip, not an answer.
 */
export function parseArtifactSubmission(view: unknown): ParsedArtifactSubmission {
    const v = (view ?? {}) as Record<string, unknown>;

    let artifactId: string | null = null;
    let launchId: string | null = null;
    let artifactType: ArtifactType | null = null;
    try {
        const parsed = JSON.parse(String(v.private_metadata ?? '{}'));
        artifactId = parsed.artifactId ?? null;
        launchId = parsed.launchId ?? null;
        artifactType = parsed.artifactType ?? null;
    } catch {
        /* leave null; the caller logs and bails */
    }

    const answers: Record<string, string> = {};
    let reason: string | null = null;

    const state = (v.state as Record<string, unknown> | undefined)?.values as
        | Record<string, Record<string, { value?: string }>>
        | undefined;

    for (const [blockId, actions] of Object.entries(state ?? {})) {
        if (blockId.startsWith('ctx_')) continue;

        if (blockId === 'change_request') {
            const value = actions?.reason?.value?.trim();
            if (value) reason = value;
            continue;
        }

        const value = actions?.answer?.value?.trim();
        if (value) answers[blockId] = value;
    }

    return { artifactId, launchId, artifactType, answers, reason };
}
