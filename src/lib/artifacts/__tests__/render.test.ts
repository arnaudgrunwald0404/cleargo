import { buildTokenMap } from '../render';
import { ARTIFACT_TYPES } from '@/types/artifacts';

describe('buildTokenMap', () => {
    it('produces tokens for every artifact type, even from an empty draft', () => {
        // The model can return a partial object. A crash here loses a 40-second
        // run; empty strings are recoverable because replaceTokens substitutes a
        // visible "[to be completed]".
        for (const type of ARTIFACT_TYPES) {
            const tokens = buildTokenMap(type, {});
            expect(Object.keys(tokens).length).toBeGreaterThan(0);
            for (const value of Object.values(tokens)) {
                expect(typeof value).toBe('string');
            }
        }
    });

    it('never throws on a malformed draft', () => {
        const garbage = {
            what_we_are_building: 'not an object',
            launch_scope: 42,
            personas: 'nope',
            open_decisions: null,
        };
        for (const type of ARTIFACT_TYPES) {
            expect(() => buildTokenMap(type, garbage)).not.toThrow();
        }
    });

    it('never leaves a raw {{token}} marker in a value', () => {
        for (const type of ARTIFACT_TYPES) {
            for (const value of Object.values(buildTokenMap(type, {}))) {
                expect(value).not.toMatch(/\{\{/);
            }
        }
    });
});

describe('story brief rendering', () => {
    const draft = {
        what_we_are_building: { narrative: 'We are embedding agents.', disruption_assessment: 'moderate' },
        value_story: { working_narrative: 'Coaching at the moment of need.' },
        launch_scope: {
            in_scope: [{ item: 'Expert Agents in app', note: 'via library' }],
            out_of_scope: [{ item: 'AMS integration', reason: 'explicitly scoped out' }],
        },
        open_decisions: [
            { item: 'Product naming', owner: 'PMM', blocks: 'every asset', gate_type: 'naming' },
        ],
        soft_commitments: [],
        overall_confidence: 'medium',
    };

    it('carries the narrative and disruption assessment through', () => {
        const t = buildTokenMap('story_brief', draft);
        expect(t.what_we_are_building).toBe('We are embedding agents.');
        expect(t.disruption_assessment).toBe('moderate');
    });

    it('renders the scope table with its reasons', () => {
        // The reason column is what keeps the launch honest — an out-of-scope
        // row without one is just a gap.
        const t = buildTokenMap('story_brief', draft);
        expect(t.out_of_scope).toContain('AMS integration');
        expect(t.out_of_scope).toContain('explicitly scoped out');
    });

    it('warns rather than going blank when nothing is excluded', () => {
        const t = buildTokenMap('story_brief', { ...draft, launch_scope: { in_scope: [], out_of_scope: [] } });
        expect(t.out_of_scope).toContain('confirm before circulating');
    });

    it('states "None identified" for empty soft commitments instead of a blank', () => {
        // The template says "None identified" is valid but must be stated.
        expect(buildTokenMap('story_brief', draft).soft_commitments).toBe('None identified');
    });

    it('tags each open decision with its gate type and owner', () => {
        const t = buildTokenMap('story_brief', draft);
        expect(t.open_decisions).toContain('[naming]');
        expect(t.open_decisions).toContain('owner: PMM');
    });
});

describe('gate checklist rendering', () => {
    it('says plainly that an unstable pricing model does not clear the gate', () => {
        // "A live price with a moving structure does NOT clear."
        const t = buildTokenMap('gate_checklist', { gate_2_pricing: { model_is_stable: false, checks: [] } });
        expect(t.pricing_model_stable).toContain('NO');
        expect(t.pricing_model_stable).toContain('does not clear');
    });

    it('confirms a settled model', () => {
        const t = buildTokenMap('gate_checklist', { gate_2_pricing: { model_is_stable: true, checks: [] } });
        expect(t.pricing_model_stable).toContain('Yes');
    });

    it('treats a missing model_is_stable as unstable, not as cleared', () => {
        // Absence must not read as approval.
        expect(buildTokenMap('gate_checklist', {}).pricing_model_stable).toContain('NO');
    });

    it('marks beta not applicable rather than showing empty checks', () => {
        const t = buildTokenMap('gate_checklist', { gate_3_beta: { applicable: false, checks: [] } });
        expect(t.gate_3_beta).toContain('Not applicable');
    });

    it('renders each check with its verdict and evidence', () => {
        const t = buildTokenMap('gate_checklist', {
            gate_1_naming: { checks: [{ check: 'Name approved', verdict: 'unknown', evidence: 'no decision recorded' }] },
        });
        expect(t.gate_1_naming).toContain('UNKNOWN');
        expect(t.gate_1_naming).toContain('no decision recorded');
    });
});

describe('messaging brief rendering', () => {
    it('names the hero pillar', () => {
        const t = buildTokenMap('messaging_brief', {
            message_house: {
                pillars: [
                    { name: 'Speed', claim: 'c', proof: 'p', is_hero: false },
                    { name: 'Trust', claim: 'c', proof: 'p', is_hero: true },
                ],
            },
        });
        expect(t.hero_pillar).toBe('Trust');
        expect(t.message_house).toContain('Trust (HERO)');
    });

    it('says the hero is unchosen rather than leaving it blank', () => {
        // Every asset leads with the hero, so a silent blank is a real gap.
        const t = buildTokenMap('messaging_brief', { message_house: { pillars: [] } });
        expect(t.hero_pillar).toContain('Not yet chosen');
    });

    it('keeps the upgrade condition on restricted claims', () => {
        const t = buildTokenMap('messaging_brief', {
            claims_register: {
                cleared: [],
                restricted: [{ claim: '10x faster', reason: 'unproven', upgrade_condition: 'if benchmark validates' }],
            },
        });
        expect(t.restricted_claims).toContain('if benchmark validates');
    });

    it('flags an empty cleared list as the field having nothing approved to say', () => {
        const t = buildTokenMap('messaging_brief', { claims_register: { cleared: [], restricted: [] } });
        expect(t.cleared_claims).toContain('nothing approved');
    });
});

describe('enablement guide rendering', () => {
    it('shouts when capability boundaries are missing', () => {
        // The template requires this section and notes most guides skip it.
        const t = buildTokenMap('enablement_guide', {});
        expect(t.capability_boundaries).toContain('NOT YET DEFINED');
    });

    it('refuses to leave the pricing FAQ silently blank', () => {
        expect(buildTokenMap('enablement_guide', {}).pricing_faq).toContain('must not improvise');
    });

    it('leaves Tier 1 sections empty for a Tier 2 draft', () => {
        const t = buildTokenMap('enablement_guide', {});
        expect(t.product_deep_dive).toBe('');
        expect(t.persona_grid).toBe('');
    });
});

describe('marketing brief rendering', () => {
    it('marks an unassigned RACI row rather than dropping the function', () => {
        const t = buildTokenMap('marketing_brief', { raci: [{ function: 'RevOps', responsibility: 'A' }] });
        expect(t.raci).toContain('RevOps');
        expect(t.raci).toContain('Unassigned');
    });

    it('reports approvals as pending when unsigned', () => {
        const t = buildTokenMap('marketing_brief', { risks_and_approvals: { risks: [], approvals: [{ role: 'CPO' }] } });
        expect(t.approvals).toContain('pending');
    });
});

describe('template token coverage', () => {
    // Every {{token}} used in the tokenized templates must be filled by either
    // the header map (docFactory) or the body map (render.ts). One that is
    // filled by neither survives into a circulated document as a literal
    // "{{tier}}" — the most embarrassing possible failure.
    const HEADER_TOKENS = [
        'story_code', 'artifact_label', 'version', 'owner',
        'launch_name', 'tier', 'target_window',
        'pm_owner', 'pmm_owner', 'prod_ed_owner',
    ];

    /** Tokens each tokenized template uses, from the Drive documents. */
    const TEMPLATE_TOKENS: Record<string, string[]> = {
        story_brief: [
            'story_code', 'working_narrative', 'tier', 'pm_owner', 'pmm_owner',
            'prod_ed_owner', 'target_window', 'version', 'confidence',
            'what_we_are_building', 'disruption_assessment', 'why_we_prioritized_it',
            'vignette', 'roi_hypothesis', 'platform_pull_through', 'in_scope',
            'out_of_scope', 'personas', 'open_decisions', 'soft_commitments',
            'downstream_deliverables', 'enablement_plan', 'marketing_plan',
        ],
        gate_checklist: [
            'launch_name', 'story_code', 'tier', 'version', 'owner', 'confidence',
            'gate_1_naming', 'pricing_model_stable', 'gate_2_pricing', 'gate_3_beta',
        ],
        messaging_brief: [
            'launch_name', 'story_code', 'owner', 'tier', 'version', 'confidence',
            'naming_summary', 'naming_rules', 'positioning_statement', 'working_narrative',
            'message_house', 'hero_pillar', 'roof_line', 'foundation', 'persona_messaging',
            'cleared_claims', 'restricted_claims', 'talk_tracks',
            'boilerplate_25', 'boilerplate_50', 'boilerplate_100', 'open_items',
        ],
        enablement_guide: [
            'launch_name', 'version', 'story_code', 'owner', 'tier', 'confidence',
            'what_this_is', 'important_note', 'high_level_narrative', 'without', 'with',
            'bottom_line', 'lifecycle_stage', 'platform_layer', 'platform_role',
            'key_message', 'elevator_pitch', 'csm_talk_track', 'situational_tracks',
            'sdr_hooks', 'do_not', 'do', 'pricing_faq', 'discovery_questions',
            'standard_response', 'key_capabilities', 'capability_boundaries',
            'pricing_summary', 'pricing_table', 'ideal_customer_profile', 'top_use_cases',
            'day_one_value', 'objection_handling', 'collateral_index',
            'product_deep_dive', 'persona_grid', 'internal_faq',
            'configuration_reference', 'csm_email_guide', 'communication_timeline',
        ],
        marketing_brief: [
            'launch_name', 'tier', 'story_code', 'owner', 'version', 'confidence',
            'ga_date', 'stage_1_triage', 'stage_4_readiness_review', 'post_launch_review',
            'customer_problem', 'proof', 'competitive', 'messaging', 'hero_pillar',
            'pricing_and_packaging', 'raci', 'asset_checklist', 'gtm_motion',
            'workback_calendar', 'leading_metrics', 'lagging_metrics', 'risks', 'approvals',
        ],
    };

    it.each(Object.keys(TEMPLATE_TOKENS))('%s: every template token is filled by some map', (type) => {
        const bodyTokens = Object.keys(buildTokenMap(type as never, {}));
        const covered = new Set([...bodyTokens, ...HEADER_TOKENS]);
        const orphans = TEMPLATE_TOKENS[type].filter((t) => !covered.has(t));
        expect(orphans).toEqual([]);
    });
});
