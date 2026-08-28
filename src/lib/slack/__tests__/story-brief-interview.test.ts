import {
    buildFlagInterviewModal,
    buildInterviewButton,
    parseFlagInterviewSubmission,
    promptFor,
    sectionLabel,
    FLAG_INTERVIEW_ACTION,
    FLAG_INTERVIEW_CALLBACK,
    MAX_QUESTIONS_PER_MODAL,
    type InterviewFlag,
} from '../templates/story-brief-interview';

const target = { briefId: 'brief-1', epicId: 'epic-1', epicName: 'Enhanced Self-Scheduling' };

function flag(over: Partial<InterviewFlag> & { id: string }): InterviewFlag {
    return {
        section: 'why_we_prioritized_it',
        claim: 'Customers asked for this repeatedly.',
        question: null,
        ...over,
    };
}

type Block = Record<string, unknown>;
const blocksOf = (v: { blocks: unknown[] }) => v.blocks as Block[];
const inputs = (v: { blocks: unknown[] }) => blocksOf(v).filter((b) => b.type === 'input');

describe('buildFlagInterviewModal', () => {
    it('asks one question per flag, each optional so partial answers are possible', () => {
        const view = buildFlagInterviewModal(target, [flag({ id: 'f1' }), flag({ id: 'f2' })]);
        const ins = inputs(view);
        expect(ins).toHaveLength(2);
        expect(ins.every((b) => b.optional === true)).toBe(true);
    });

    it('uses the flag id as the block id so answers map back to the right flag', () => {
        const view = buildFlagInterviewModal(target, [flag({ id: 'f1' }), flag({ id: 'f2' })]);
        expect(inputs(view).map((b) => b.block_id)).toEqual(['f1', 'f2']);
    });

    it('caps the questions shown and says how many remain', () => {
        const many = Array.from({ length: MAX_QUESTIONS_PER_MODAL + 3 }, (_, i) =>
            flag({ id: `f${i}` })
        );
        const view = buildFlagInterviewModal(target, many);
        expect(inputs(view)).toHaveLength(MAX_QUESTIONS_PER_MODAL);
        expect(JSON.stringify(view.blocks)).toContain('3 more questions after these');
    });

    it('says "question" not "questions" for a single leftover', () => {
        const many = Array.from({ length: MAX_QUESTIONS_PER_MODAL + 1 }, (_, i) =>
            flag({ id: `f${i}` })
        );
        expect(JSON.stringify(buildFlagInterviewModal(target, many).blocks)).toContain(
            '1 more question after these'
        );
    });

    it('adds no leftover note when everything fits', () => {
        const view = buildFlagInterviewModal(target, [flag({ id: 'f1' })]);
        expect(JSON.stringify(view.blocks)).not.toContain('more question');
    });

    it('carries the ids through private_metadata, since Slack drops the button value', () => {
        const view = buildFlagInterviewModal(target, [flag({ id: 'f1' })]);
        expect(JSON.parse(view.private_metadata)).toEqual({ briefId: 'brief-1', epicId: 'epic-1' });
    });

    it('keeps the title inside Slack limit', () => {
        expect(buildFlagInterviewModal(target, []).title.text.length).toBeLessThanOrEqual(24);
    });

    it('names the epic and frames the ask as gap-only', () => {
        const text = JSON.stringify(buildFlagInterviewModal(target, [flag({ id: 'f1' })]).blocks);
        expect(text).toContain('Enhanced Self-Scheduling');
        expect(text).toContain('could not');
    });

    it('uses the declared callback_id so submissions route back here', () => {
        expect(buildFlagInterviewModal(target, []).callback_id).toBe(FLAG_INTERVIEW_CALLBACK);
    });
});

describe('promptFor', () => {
    it('prefers an explicit question', () => {
        expect(promptFor(flag({ id: 'f', question: 'Which segment asked?' }))).toBe(
            'Which segment asked?'
        );
    });

    it('falls back to asking the PM to confirm the ungrounded claim', () => {
        // Correcting a wrong statement is faster than answering an open prompt.
        const out = promptFor(flag({ id: 'f', claim: 'Customers asked repeatedly.' }));
        expect(out).toContain('confirm or correct');
        expect(out).toContain('Customers asked repeatedly.');
    });

    it('treats a whitespace-only question as absent', () => {
        expect(promptFor(flag({ id: 'f', question: '   ' }))).toContain('confirm or correct');
    });
});

describe('sectionLabel', () => {
    it('maps template keys to human labels', () => {
        expect(sectionLabel('why_we_prioritized_it')).toBe('Why we prioritized it');
    });

    it('degrades readably for an unknown key rather than showing snake_case', () => {
        expect(sectionLabel('some_new_section')).toBe('some new section');
    });
});

describe('parseFlagInterviewSubmission', () => {
    const view = (values: Record<string, unknown>, meta = '{"briefId":"brief-1","epicId":"epic-1"}') => ({
        private_metadata: meta,
        state: { values },
    });

    it('reads answers keyed by flag id', () => {
        const out = parseFlagInterviewSubmission(
            view({ f1: { answer: { value: 'Two enterprise accounts.' } } })
        );
        expect(out.briefId).toBe('brief-1');
        expect(out.answers).toEqual([{ flagId: 'f1', answer: 'Two enterprise accounts.' }]);
    });

    it('treats a blank input as a skip, not an empty answer', () => {
        const out = parseFlagInterviewSubmission(
            view({
                f1: { answer: { value: '   ' } },
                f2: { answer: { value: null } },
                f3: { answer: { value: 'real answer' } },
            })
        );
        expect(out.answers).toEqual([{ flagId: 'f3', answer: 'real answer' }]);
    });

    it('ignores the context blocks that carry the question text', () => {
        const out = parseFlagInterviewSubmission(
            view({ ctx_f1: { answer: { value: 'noise' } }, f1: { answer: { value: 'yes' } } })
        );
        expect(out.answers).toEqual([{ flagId: 'f1', answer: 'yes' }]);
    });

    it('trims the stored answer', () => {
        const out = parseFlagInterviewSubmission(view({ f1: { answer: { value: '  spaced  ' } } }));
        expect(out.answers[0].answer).toBe('spaced');
    });

    it('returns null ids on unparseable metadata rather than throwing', () => {
        // A thrown handler would show the PM an error after they had typed.
        const out = parseFlagInterviewSubmission(view({ f1: { answer: { value: 'x' } } }, 'not json'));
        expect(out.briefId).toBeNull();
        expect(out.answers).toHaveLength(1);
    });

    it('survives a missing view entirely', () => {
        expect(parseFlagInterviewSubmission(undefined)).toEqual({
            briefId: null,
            epicId: null,
            answers: [],
        });
    });
});

describe('buildInterviewButton', () => {
    it('states the count honestly, singular and plural', () => {
        const one = JSON.stringify(buildInterviewButton(target, 1));
        expect(one).toContain('Answer 1 open question');
        expect(one).not.toContain('questions');
        expect(JSON.stringify(buildInterviewButton(target, 4))).toContain('Answer 4 open questions');
    });

    it('routes to the interview action and carries the brief id', () => {
        const btn = buildInterviewButton(target, 2) as {
            elements: Array<{ action_id: string; value: string }>;
        };
        expect(btn.elements[0].action_id).toBe(FLAG_INTERVIEW_ACTION);
        expect(JSON.parse(btn.elements[0].value).briefId).toBe('brief-1');
    });
});
