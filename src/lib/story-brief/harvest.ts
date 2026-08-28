/**
 * Grounding harvest: everything ClearGo already holds about an epic that could
 * answer a Story Brief question, so the agent does not have to ask.
 *
 * Every question you don't have to put to a PM is the win. Sections 2, 3, 5 and
 * 7 of the template (why we prioritised it, the value story, personas, soft
 * commitments) are the ones Aha and Jira cannot answer — but ClearGo already
 * stores comments explaining why work moved, and has transcript plumbing wired
 * to epics. Feeding those in before asking is the difference between "answer
 * these three questions" and "fill in this template".
 *
 * Pure shaping lives here; the queries live in context.ts.
 */

/** Caps so a chatty epic cannot crowd out the rest of the prompt. */
export const MAX_COMMENTS = 12;
export const MAX_COMMENT_CHARS = 600;
export const MAX_TRANSCRIPTS = 3;
export const MAX_TRANSCRIPT_CHARS = 4000;

export interface HarvestedComment {
    text: string;
    category: string | null;
    /** Why an item moved release, when the comment records it. */
    movement_cause: string | null;
    from_release: string | null;
    to_release: string | null;
    created_at: string | null;
    created_by: string | null;
}

export interface HarvestedTranscript {
    meeting_title: string | null;
    meeting_date: string | null;
    text: string;
}

export interface HarvestResult {
    comments: HarvestedComment[];
    transcripts: HarvestedTranscript[];
    /** True when there is genuinely nothing here, so callers can say so plainly. */
    empty: boolean;
}

function clamp(text: string, max: number): string {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Shape raw comment rows into grounding material, newest first.
 *
 * A comment recording a release movement is kept even when its body is thin:
 * "moved 2026.8 → 2026.9" with a cause is exactly the evidence section 2 wants,
 * and it is the one thing no other source carries.
 */
export function shapeComments(
    rows: Array<{
        comment_text?: string | null;
        category?: string | null;
        movement_cause?: string | null;
        from_release?: string | null;
        to_release?: string | null;
        created_at?: string | null;
        created_by?: string | null;
    }>
): HarvestedComment[] {
    return rows
        .map((r) => {
            const text = (r.comment_text || '').trim();
            const hasMovement = Boolean(r.movement_cause || r.from_release || r.to_release);
            if (!text && !hasMovement) return null;
            return {
                text: clamp(text, MAX_COMMENT_CHARS),
                category: r.category ?? null,
                movement_cause: r.movement_cause ?? null,
                from_release: r.from_release ?? null,
                to_release: r.to_release ?? null,
                created_at: r.created_at ?? null,
                created_by: r.created_by ?? null,
            };
        })
        .filter((c): c is HarvestedComment => c !== null)
        .slice(0, MAX_COMMENTS);
}

export function shapeTranscripts(
    rows: Array<{
        transcript_text?: string | null;
        meeting_title?: string | null;
        meeting_date?: string | null;
    }>
): HarvestedTranscript[] {
    return rows
        .filter((r) => (r.transcript_text || '').trim().length > 0)
        .slice(0, MAX_TRANSCRIPTS)
        .map((r) => ({
            meeting_title: r.meeting_title ?? null,
            meeting_date: r.meeting_date ?? null,
            text: clamp(r.transcript_text as string, MAX_TRANSCRIPT_CHARS),
        }));
}

/**
 * Render the harvest for the prompt. Returns null when there is nothing, so the
 * prompt omits the section entirely rather than showing an empty heading — an
 * empty heading reads as "there is no evidence" rather than "none was found".
 */
export function renderHarvestForPrompt(harvest: HarvestResult): string | null {
    if (harvest.empty) return null;
    const parts: string[] = [];

    if (harvest.comments.length > 0) {
        parts.push('### ClearGo comments on this epic');
        for (const c of harvest.comments) {
            const bits: string[] = [];
            if (c.created_at) bits.push(c.created_at.slice(0, 10));
            if (c.category) bits.push(c.category);
            if (c.from_release || c.to_release) {
                bits.push(`moved ${c.from_release || '?'} -> ${c.to_release || '?'}`);
            }
            if (c.movement_cause) bits.push(`cause: ${c.movement_cause}`);
            const prefix = bits.length > 0 ? `[${bits.join(' | ')}] ` : '';
            parts.push(`- ${prefix}${c.text || '(no comment body)'}`);
        }
    }

    if (harvest.transcripts.length > 0) {
        parts.push('');
        parts.push('### Meeting transcripts linked to this epic');
        for (const t of harvest.transcripts) {
            const head = [t.meeting_title, t.meeting_date?.slice(0, 10)].filter(Boolean).join(' — ');
            parts.push(`- ${head || 'Untitled meeting'}: ${t.text}`);
        }
    }

    return parts.join('\n');
}

export function isHarvestEmpty(
    comments: HarvestedComment[],
    transcripts: HarvestedTranscript[]
): boolean {
    return comments.length === 0 && transcripts.length === 0;
}
