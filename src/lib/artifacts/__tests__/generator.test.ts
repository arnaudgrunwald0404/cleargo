import { assemblePrompt } from '../generator';
import { buildArtifactPrompt, GROUNDING_RULES } from '../prompts';
import { ARTIFACT_TYPES } from '@/types/artifacts';

const base = {
    def_label: 'Story Brief',
    instructions: 'Draft the eight sections.',
    facts: 'Launch: Spotlight\nTier: TIER_1',
    harvest: null,
    upstreamLabel: null,
    upstreamText: null,
    changeRequestNote: null,
};

describe('assemblePrompt', () => {
    it('always includes the grounding rules', () => {
        // Silently dropping these is how a draft starts asserting things.
        expect(assemblePrompt(base)).toContain(GROUNDING_RULES);
    });

    it('includes the grounding facts', () => {
        expect(assemblePrompt(base)).toContain('Launch: Spotlight');
    });

    it('says so plainly when ClearGO has no history, rather than omitting the section', () => {
        expect(assemblePrompt(base)).toContain('nothing recorded in ClearGO');
    });

    it('says so plainly when the owner provided no notes', () => {
        expect(assemblePrompt(base)).toContain('none provided');
    });

    it('includes owner answers and marks them as not to be re-asked', () => {
        const prompt = assemblePrompt({
            ...base,
            answeredFlagsBlock: '- [value_story] Asked: "ROI?"\n  Owner answered: 12 hours saved per hire',
        });

        expect(prompt).toContain('12 hours saved per hire');
        expect(prompt).toContain('do NOT ask again');
    });

    it('omits the answered-questions block entirely when there are none', () => {
        expect(assemblePrompt({ ...base, answeredFlagsBlock: '   ' })).not.toContain('already answered');
    });

    it('includes a change request so a redraft addresses the rejection', () => {
        const prompt = assemblePrompt({
            ...base,
            changeRequestNote: 'The scope table is missing the API limits.',
        });

        expect(prompt).toContain('The scope table is missing the API limits.');
        expect(prompt).toContain('rejected the previous draft');
    });

    it('includes upstream text and tells the model to quote rather than restate', () => {
        const prompt = assemblePrompt({
            ...base,
            upstreamLabel: 'Story Brief',
            upstreamText: 'Working narrative: hiring managers stop chasing approvals.',
        });

        expect(prompt).toContain('hiring managers stop chasing approvals');
        expect(prompt).toContain('QUOTE it, never restate it');
    });

    it('caps upstream text so one long document cannot crowd out the facts', () => {
        const prompt = assemblePrompt({
            ...base,
            upstreamLabel: 'Story Brief',
            upstreamText: 'x'.repeat(50_000),
        });

        expect(prompt).toContain('Launch: Spotlight');
        expect(prompt.match(/x+/)?.[0].length).toBe(20_000);
    });

    it('omits the upstream block when there is no upstream document', () => {
        expect(assemblePrompt(base)).not.toContain('ratified');
    });
});

describe('buildArtifactPrompt', () => {
    it('produces a non-empty prompt for every artifact type', () => {
        for (const type of ARTIFACT_TYPES) {
            const prompt = buildArtifactPrompt(type, {
                launchName: 'Spotlight',
                tier: 'TIER_1',
                upstreamText: null,
                upstreamLabel: null,
            });
            expect(prompt.length).toBeGreaterThan(200);
        }
    });

    it('tells the Enablement Guide to include Tier 1 additions for a Tier 1 launch', () => {
        const prompt = buildArtifactPrompt('enablement_guide', {
            launchName: 'Spotlight',
            tier: 'TIER_1',
            upstreamText: null,
            upstreamLabel: null,
        });
        expect(prompt).toContain('Tier 1 additions');
    });

    it('tells the Enablement Guide to omit them for a Tier 2 launch', () => {
        const prompt = buildArtifactPrompt('enablement_guide', {
            launchName: 'Spotlight',
            tier: 'TIER_2',
            upstreamText: null,
            upstreamLabel: null,
        });
        expect(prompt).toContain('Omit tier_1_additions');
    });

    it('flags the missing upstream instead of silently drafting ungrounded messaging', () => {
        const prompt = buildArtifactPrompt('messaging_brief', {
            launchName: 'Spotlight',
            tier: 'TIER_1',
            upstreamText: null,
            upstreamLabel: null,
        });
        expect(prompt).toContain('No upstream Story Brief was available');
    });

    it('keeps the pricing gate honest about an unstable model', () => {
        // "A live price with a moving structure does NOT clear the gate."
        const prompt = buildArtifactPrompt('gate_checklist', {
            launchName: 'Spotlight',
            tier: 'TIER_1',
            upstreamText: null,
            upstreamLabel: null,
        });
        expect(prompt).toContain('model_is_stable to FALSE');
    });
});
