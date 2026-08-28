import {
    buildArtifactReviewMessage,
    buildChangeRequestModal,
    buildArtifactInterviewModal,
    parseArtifactSubmission,
    ARTIFACT_APPROVE_ACTION,
    ARTIFACT_CHANGES_ACTION,
    ARTIFACT_ANSWER_ACTION,
    ARTIFACT_CHANGES_CALLBACK,
    ARTIFACT_ANSWER_CALLBACK,
    MAX_QUESTIONS_PER_MODAL,
    type ArtifactReviewTarget,
} from '../templates/artifact-review';

const target: ArtifactReviewTarget = {
    artifactId: 'artifact-1',
    launchId: 'launch-1',
    launchName: 'ClearCo Agent Platform',
    artifactType: 'story_brief',
    docUrl: 'https://docs.google.com/document/d/abc/edit',
};

type Block = { type: string; elements?: Array<Record<string, unknown>>; text?: { text?: string } };

function actionsOf(blocks: unknown[]): Array<Record<string, unknown>> {
    const row = (blocks as Block[]).find((b) => b.type === 'actions');
    return (row?.elements ?? []) as Array<Record<string, unknown>>;
}

function allText(blocks: unknown[]): string {
    return JSON.stringify(blocks);
}

describe('buildArtifactReviewMessage', () => {
    const base = { openQuestions: 0, topFlags: [], reviewAsk: 'Check the scope table.' };

    it('offers approve and request-changes', () => {
        const { blocks } = buildArtifactReviewMessage(target, base);
        const ids = actionsOf(blocks).map((a) => a.action_id);
        expect(ids).toContain(ARTIFACT_APPROVE_ACTION);
        expect(ids).toContain(ARTIFACT_CHANGES_ACTION);
    });

    it('puts a confirm dialog on approve but not on request-changes', () => {
        // Approving promotes to v1.0 and unblocks the next artifact; sending
        // back is cheap and reversible.
        const actions = actionsOf(buildArtifactReviewMessage(target, base).blocks);
        const approve = actions.find((a) => a.action_id === ARTIFACT_APPROVE_ACTION);
        const changes = actions.find((a) => a.action_id === ARTIFACT_CHANGES_ACTION);
        expect(approve?.confirm).toBeDefined();
        expect(changes?.confirm).toBeUndefined();
    });

    it('only offers the answer button when questions are open', () => {
        const none = actionsOf(buildArtifactReviewMessage(target, base).blocks);
        expect(none.map((a) => a.action_id)).not.toContain(ARTIFACT_ANSWER_ACTION);

        const some = actionsOf(
            buildArtifactReviewMessage(target, { ...base, openQuestions: 3, topFlags: ['a', 'b', 'c'] }).blocks
        );
        const answer = some.find((a) => a.action_id === ARTIFACT_ANSWER_ACTION);
        expect(answer).toBeDefined();
        expect((answer?.text as { text: string }).text).toBe('Answer 3 questions');
    });

    it('singularises a lone question', () => {
        const actions = actionsOf(
            buildArtifactReviewMessage(target, { ...base, openQuestions: 1, topFlags: ['a'] }).blocks
        );
        const answer = actions.find((a) => a.action_id === ARTIFACT_ANSWER_ACTION);
        expect((answer?.text as { text: string }).text).toBe('Answer 1 question');
    });

    it('names what the agent could not confirm, capped, with an overflow count', () => {
        // The reviewer's job is precisely these gaps, so they lead — but six
        // labels turns a notification into a paragraph.
        const { blocks } = buildArtifactReviewMessage(target, {
            ...base,
            openQuestions: 6,
            topFlags: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
        });
        const text = allText(blocks);
        expect(text).toContain('could not confirm');
        expect(text).toContain('q3');
        expect(text).not.toContain('q4');
        expect(text).toContain('+3 more');
    });

    it('links the document when there is one', () => {
        const actions = actionsOf(buildArtifactReviewMessage(target, base).blocks);
        expect(actions.some((a) => a.url === target.docUrl)).toBe(true);
    });

    it('omits the document button when there is no document yet', () => {
        const actions = actionsOf(
            buildArtifactReviewMessage({ ...target, docUrl: null }, base).blocks
        );
        expect(actions.some((a) => a.url)).toBe(false);
    });

    it('surfaces warnings rather than hiding them', () => {
        const { blocks } = buildArtifactReviewMessage(target, {
            ...base,
            warnings: ['Story Brief is not approved yet'],
        });
        expect(allText(blocks)).toContain('Story Brief is not approved yet');
    });

    it('carries the artifact id on every actionable button', () => {
        // Without this the handler cannot tell which document was decided.
        const actions = actionsOf(
            buildArtifactReviewMessage(target, { ...base, openQuestions: 2, topFlags: ['a', 'b'] }).blocks
        );
        for (const action of actions.filter((a) => !a.url)) {
            expect(JSON.parse(String(action.value)).artifactId).toBe('artifact-1');
        }
    });
});

describe('buildChangeRequestModal', () => {
    it('carries state through private_metadata', () => {
        // Slack does not echo the button value into view_submission.
        const modal = buildChangeRequestModal(target);
        expect(JSON.parse(String(modal.private_metadata)).artifactId).toBe('artifact-1');
        expect(modal.callback_id).toBe(ARTIFACT_CHANGES_CALLBACK);
    });

    it('makes the reason required', () => {
        // It is fed verbatim into the next draft; without it the redraft is
        // identical and everyone wastes a cycle.
        const blocks = (buildChangeRequestModal(target).blocks ?? []) as Array<Record<string, unknown>>;
        const input = blocks.find((b) => b.block_id === 'change_request');
        expect(input).toBeDefined();
        expect(input?.optional).toBeUndefined();
    });
});

describe('buildArtifactInterviewModal', () => {
    const flags = Array.from({ length: 7 }, (_, i) => ({
        id: `flag-${i}`,
        section: 'value_story',
        claim: `claim ${i}`,
        question: `Question ${i}?`,
    }));

    it('caps questions per modal and says how many remain', () => {
        const modal = buildArtifactInterviewModal(target, flags);
        const blocks = (modal.blocks ?? []) as Array<Record<string, unknown>>;
        const inputs = blocks.filter((b) => b.type === 'input');
        expect(inputs).toHaveLength(MAX_QUESTIONS_PER_MODAL);
        expect(JSON.stringify(blocks)).toContain('2 more questions');
    });

    it('uses the flag id as the block_id so answers map back', () => {
        const blocks = (buildArtifactInterviewModal(target, flags).blocks ?? []) as Array<Record<string, unknown>>;
        const inputs = blocks.filter((b) => b.type === 'input');
        expect(inputs[0].block_id).toBe('flag-0');
    });

    it('makes every input optional', () => {
        // A PM who knows three of five should be able to save three.
        const blocks = (buildArtifactInterviewModal(target, flags).blocks ?? []) as Array<Record<string, unknown>>;
        for (const input of blocks.filter((b) => b.type === 'input')) {
            expect(input.optional).toBe(true);
        }
    });

    it('falls back to a confirm-or-correct prompt when there is no question', () => {
        const modal = buildArtifactInterviewModal(target, [
            { id: 'f1', section: 'value_story', claim: 'ROI is 12 hours saved', question: null },
        ]);
        expect(JSON.stringify(modal.blocks)).toContain('confirm or correct');
    });

    it('keeps the title inside Slack\'s 24-character cap', () => {
        const modal = buildArtifactInterviewModal(target, flags);
        expect(String((modal.title as { text: string }).text).length).toBeLessThanOrEqual(24);
    });
});

describe('parseArtifactSubmission', () => {
    const view = (values: Record<string, unknown>) => ({
        private_metadata: JSON.stringify({
            artifactId: 'artifact-1',
            launchId: 'launch-1',
            artifactType: 'story_brief',
        }),
        state: { values },
    });

    it('reads answers keyed by flag id', () => {
        const parsed = parseArtifactSubmission(
            view({ 'flag-1': { answer: { value: 'Because of churn' } } })
        );
        expect(parsed.artifactId).toBe('artifact-1');
        expect(parsed.answers).toEqual({ 'flag-1': 'Because of churn' });
    });

    it('skips context blocks', () => {
        const parsed = parseArtifactSubmission(
            view({ ctx_flag1: { answer: { value: 'noise' } }, 'flag-1': { answer: { value: 'real' } } })
        );
        expect(Object.keys(parsed.answers)).toEqual(['flag-1']);
    });

    it('treats a blank as a skip, not an answer', () => {
        const parsed = parseArtifactSubmission(view({ 'flag-1': { answer: { value: '   ' } } }));
        expect(parsed.answers).toEqual({});
    });

    it('reads the change-request reason separately from answers', () => {
        const parsed = parseArtifactSubmission(
            view({ change_request: { reason: { value: 'Scope table is missing API limits' } } })
        );
        expect(parsed.reason).toBe('Scope table is missing API limits');
        expect(parsed.answers).toEqual({});
    });

    it('returns nulls rather than throwing on a malformed view', () => {
        const parsed = parseArtifactSubmission({ private_metadata: 'not json' });
        expect(parsed.artifactId).toBeNull();
        expect(parsed.answers).toEqual({});
    });
});
