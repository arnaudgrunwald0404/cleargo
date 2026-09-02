import {
    postProcessGrounding,
    computeConfidence,
    collectOpenFlags,
    BANNED_PHRASES,
    type GroundingSignals,
} from '../grounding';

const fullSignals: GroundingSignals = {
    referenceText: '',
    ahaAvailable: true,
    jiraAvailable: true,
    gapDetected: false,
};

function section(claims: Array<{ text: string; source: string; grounded: boolean }>, flags: string[] = []) {
    return { narrative: 'n', claims, open_flags: flags };
}

describe('postProcessGrounding', () => {
    it('demotes unstated assumptions regardless of what the model claimed', () => {
        const out = postProcessGrounding(
            { a: section([{ text: 'Ships in Q3', source: 'unstated_assumption', grounded: true }]) },
            ['a'],
            fullSignals
        );

        expect((out.a as never as { claims: Array<{ grounded: boolean }> }).claims[0].grounded).toBe(false);
    });

    it('turns a newly demoted claim into an open flag', () => {
        const out = postProcessGrounding(
            { a: section([{ text: 'Ships in Q3', source: 'unstated_assumption', grounded: true }]) },
            ['a'],
            fullSignals
        );

        expect((out.a as never as { open_flags: string[] }).open_flags).toEqual(['Ships in Q3']);
    });

    it('does not re-flag a claim the model already admitted was ungrounded', () => {
        const out = postProcessGrounding(
            {
                a: section(
                    [{ text: 'Ships in Q3', source: 'unstated_assumption', grounded: false }],
                    ['Ships in Q3']
                ),
            },
            ['a'],
            fullSignals
        );

        // Would be duplicated if the pass keyed on final state rather than change.
        expect((out.a as never as { open_flags: string[] }).open_flags).toEqual(['Ships in Q3']);
    });

    it('demotes unearned marketing language the sources never used', () => {
        const out = postProcessGrounding(
            { a: section([{ text: 'A seamless experience', source: 'aha_description', grounded: true }]) },
            ['a'],
            fullSignals
        );

        expect((out.a as never as { claims: Array<{ grounded: boolean }> }).claims[0].grounded).toBe(false);
    });

    it('allows banned language when the source material used it first', () => {
        const out = postProcessGrounding(
            { a: section([{ text: 'A seamless experience', source: 'aha_description', grounded: true }]) },
            ['a'],
            { ...fullSignals, referenceText: 'the customer asked for a seamless handoff' }
        );

        expect((out.a as never as { claims: Array<{ grounded: boolean }> }).claims[0].grounded).toBe(true);
    });

    it('leaves sections that were not declared as claim-bearing untouched', () => {
        const untouched = section([{ text: 'seamless', source: 'unstated_assumption', grounded: true }]);
        const out = postProcessGrounding({ a: section([]), b: untouched }, ['a'], fullSignals);

        expect(out.b).toBe(untouched);
    });

    it('tolerates a declared section the model omitted entirely', () => {
        expect(() =>
            postProcessGrounding({ a: section([]) }, ['a', 'missing_section'], fullSignals)
        ).not.toThrow();
    });

    it('overrides the model\'s self-reported confidence', () => {
        const out = postProcessGrounding(
            {
                overall_confidence: 'high',
                a: section([
                    { text: 'x', source: 'unstated_assumption', grounded: true },
                    { text: 'y', source: 'aha_description', grounded: true },
                ]),
            },
            ['a'],
            fullSignals
        );

        // Half the claims are ungrounded — above the 0.3 threshold.
        expect(out.overall_confidence).toBe('low');
    });
});

describe('computeConfidence', () => {
    const grounded = { text: 'x', source: 'aha_description', grounded: true };

    it('is high only when both sources resolved and nothing is ungrounded', () => {
        expect(computeConfidence([grounded], fullSignals)).toBe('high');
    });

    it('drops to medium on a detected delivery gap', () => {
        expect(computeConfidence([grounded], { ...fullSignals, gapDetected: true })).toBe('medium');
    });

    it('drops to medium when one source system is unavailable', () => {
        expect(computeConfidence([grounded], { ...fullSignals, jiraAvailable: false })).toBe('medium');
    });

    it('drops to low when neither source system resolved', () => {
        expect(
            computeConfidence([grounded], { ...fullSignals, ahaAvailable: false, jiraAvailable: false })
        ).toBe('low');
    });

    it('drops to low past the ungrounded threshold even with both sources', () => {
        const claims = [
            grounded,
            { text: 'y', source: 'unstated_assumption', grounded: false },
            { text: 'z', source: 'unstated_assumption', grounded: false },
        ];
        expect(computeConfidence(claims, fullSignals)).toBe('low');
    });

    it('treats a claimless draft as fully grounded rather than dividing by zero', () => {
        expect(computeConfidence([], fullSignals)).toBe('high');
    });
});

describe('collectOpenFlags', () => {
    it('tags each flag with the section that raised it', () => {
        const flags = collectOpenFlags(
            { a: section([], ['who owns pricing?']), b: section([], ['what is the name?']) },
            ['a', 'b']
        );

        expect(flags).toEqual([
            { section: 'a', claim: 'who owns pricing?' },
            { section: 'b', claim: 'what is the name?' },
        ]);
    });

    it('drops blank entries rather than minting an unanswerable question', () => {
        expect(collectOpenFlags({ a: section([], ['   ', '']) }, ['a'])).toEqual([]);
    });
});

describe('BANNED_PHRASES', () => {
    it('is lowercase throughout, since matching lowercases both sides', () => {
        for (const phrase of BANNED_PHRASES) {
            expect(phrase).toBe(phrase.toLowerCase());
        }
    });
});
