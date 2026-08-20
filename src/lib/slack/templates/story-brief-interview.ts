/**
 * The gap-only interview: a Slack modal that asks a PM only what the generator
 * could not ground, and nothing it already knows.
 *
 * This is the point of the harvest and flag machinery upstream. A blank
 * eight-section template is a chore nobody does; three specific questions with
 * the rest already drafted is a two-minute job. So the modal's contract is:
 * never show a question the draft already answered, never ask the same question
 * twice, and let a PM answer some and leave the rest.
 */

export const FLAG_INTERVIEW_CALLBACK = 'story_brief_flags';
export const FLAG_INTERVIEW_ACTION = 'story_brief_answer_flags';

/**
 * How many gaps to put in one modal. The cap is humane, not technical: a wall of
 * questions gets abandoned, and the flags left over stay on record and are
 * offered again next time.
 */
export const MAX_QUESTIONS_PER_MODAL = 5;

/** Slack's hard limit on a view title. */
const TITLE_MAX = 24;

export interface InterviewFlag {
    /** epic_story_brief_flag.id — used as the block id, so answers map back exactly. */
    id: string;
    section: string;
    claim: string;
    question: string | null;
}

export interface InterviewTarget {
    briefId: string;
    epicId: string;
    epicName: string;
}

/** Human labels for the template's section keys. */
const SECTION_LABELS: Record<string, string> = {
    what_we_are_building: 'What we are building',
    why_we_prioritized_it: 'Why we prioritized it',
    value_story: 'The value story',
    launch_scope: 'Launch scope',
    personas: 'Personas & segments',
    open_decisions: 'Open decisions',
    soft_commitments: 'Soft commitments',
    downstream_deliverables: 'Downstream deliverables',
};

export function sectionLabel(section: string): string {
    return SECTION_LABELS[section] || section.replace(/_/g, ' ');
}

function truncate(text: string, max: number): string {
    const t = text.trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * The question to actually put to the human. A flag stores the claim the model
 * wanted to make; `question` is set when that reads badly as a question. Falling
 * back to the claim beats falling back to nothing — a PM corrects a wrong
 * statement faster than they answer an open prompt.
 */
export function promptFor(flag: InterviewFlag): string {
    const q = (flag.question || '').trim();
    if (q) return q;
    return `Can you confirm or correct this? "${flag.claim.trim()}"`;
}

export interface InterviewModalView {
    type: 'modal';
    callback_id: string;
    private_metadata: string;
    title: { type: 'plain_text'; text: string };
    submit: { type: 'plain_text'; text: string };
    close: { type: 'plain_text'; text: string };
    blocks: unknown[];
}

/**
 * Build the modal. Every input is optional: partial answers are progress, and
 * forcing all five is how you get five empty strings.
 */
export function buildFlagInterviewModal(
    target: InterviewTarget,
    flags: InterviewFlag[]
): InterviewModalView {
    const shown = flags.slice(0, MAX_QUESTIONS_PER_MODAL);
    const remaining = flags.length - shown.length;

    const blocks: unknown[] = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text:
                    `*${target.epicName}*\nThe draft is written. These are the only parts it could not ` +
                    `support from Aha, Jira, or ClearGo history. Answer what you can — anything you skip stays on the list.`,
            },
        },
        { type: 'divider' },
    ];

    for (const flag of shown) {
        blocks.push({
            type: 'section',
            block_id: `ctx_${flag.id}`,
            text: { type: 'mrkdwn', text: `*${sectionLabel(flag.section)}*\n${promptFor(flag)}` },
        });
        blocks.push({
            type: 'input',
            block_id: flag.id,
            optional: true,
            label: { type: 'plain_text', text: truncate(sectionLabel(flag.section), 2000) },
            element: {
                type: 'plain_text_input',
                action_id: 'answer',
                multiline: true,
                placeholder: { type: 'plain_text', text: 'Or leave blank to skip' },
            },
        });
    }

    if (remaining > 0) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `${remaining} more question${remaining === 1 ? '' : 's'} after these.`,
                },
            ],
        });
    }

    return {
        type: 'modal',
        callback_id: FLAG_INTERVIEW_CALLBACK,
        // Carries the ids through submission; Slack does not echo the button value.
        private_metadata: JSON.stringify({ briefId: target.briefId, epicId: target.epicId }),
        title: { type: 'plain_text', text: truncate('Story Brief gaps', TITLE_MAX) },
        submit: { type: 'plain_text', text: 'Save answers' },
        close: { type: 'plain_text', text: 'Later' },
        blocks,
    };
}

export interface ParsedInterviewSubmission {
    briefId: string | null;
    epicId: string | null;
    /** Only flags the PM actually typed into; blanks are skips, not empty answers. */
    answers: Array<{ flagId: string; answer: string }>;
}

/**
 * Read answers back out of a view_submission payload. Tolerant by design: an
 * unexpected shape yields fewer answers rather than a thrown handler, which
 * would show the PM an error after they had already typed.
 */
export function parseFlagInterviewSubmission(view: unknown): ParsedInterviewSubmission {
    const v = (view || {}) as {
        private_metadata?: string;
        state?: { values?: Record<string, Record<string, { value?: string | null }>> };
    };

    let briefId: string | null = null;
    let epicId: string | null = null;
    try {
        const meta = JSON.parse(v.private_metadata || '{}');
        briefId = meta.briefId ?? null;
        epicId = meta.epicId ?? null;
    } catch {
        // Leave both null; the caller treats that as "cannot attribute" and stops.
    }

    const answers: Array<{ flagId: string; answer: string }> = [];
    for (const [blockId, actions] of Object.entries(v.state?.values || {})) {
        if (blockId.startsWith('ctx_')) continue;
        const value = (actions?.answer?.value || '').trim();
        if (value) answers.push({ flagId: blockId, answer: value });
    }

    return { briefId, epicId, answers };
}

/**
 * The button that opens the interview. Any message or App Home section can embed
 * it; the count sits in the label so the ask is honest about its size.
 */
export function buildInterviewButton(target: InterviewTarget, openCount: number): unknown {
    return {
        type: 'actions',
        elements: [
            {
                type: 'button',
                action_id: FLAG_INTERVIEW_ACTION,
                style: 'primary',
                text: {
                    type: 'plain_text',
                    text:
                        openCount === 1
                            ? 'Answer 1 open question'
                            : `Answer ${openCount} open questions`,
                },
                value: JSON.stringify({ briefId: target.briefId, epicId: target.epicId }),
            },
        ],
    };
}
