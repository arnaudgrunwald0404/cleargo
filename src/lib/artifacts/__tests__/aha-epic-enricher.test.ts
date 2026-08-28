/**
 * Unit tests for the Aha! Epic Enricher.
 *
 * Validates that extractEpicEnrichment() correctly categorizes custom fields
 * into business case, competitive context, personas, GTM signals, customer
 * evidence, success metrics, and dependencies.
 *
 * The function reads from `ahaFields.custom_fields` — the shape stored in the
 * DB by the Aha! mapping layer. Test fixtures wrap field objects accordingly.
 */
import { extractEpicEnrichment } from '../aha-epic-enricher';

// Helper: wrap raw custom field entries in the shape the DB stores
const wrap = (fields: Record<string, unknown>) => ({
    custom_fields: fields,
    standard_fields: {},
});

describe('extractEpicEnrichment', () => {
    describe('businessCase', () => {
        it('extracts primary_goal, mission, impact, modified_rice, wsjf, challenges', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: { key: 'primary_goal', value: 'Increase activation by 15%' },
                mission: { key: 'mission', value: 'Make onboarding frictionless' },
                impact: { key: 'impact', value: 'High' },
                modified_rice: { key: 'modified_rice', value: 42 },
                wsjf: { key: 'wsjf', value: 150 },
                challenges: { key: 'challenges', value: 'Legacy migration complexity' },
            }));

            // When values are wrapped in { key, value } objects, scalar() -> str()
            // stringifies the inner value. Bare numbers are preserved (see next test).
            expect(result?.businessCase).toEqual({
                primaryGoal: 'Increase activation by 15%',
                mission: 'Make onboarding frictionless',
                impact: 'High',
                modifiedRice: '42',
                wsjf: '150',
                challenges: 'Legacy migration complexity',
            });
        });

        it('handles numeric RICE/WSJF as strings', () => {
            const result = extractEpicEnrichment(wrap({
                modified_rice: { key: 'modified_rice', value: '38' },
                wsjf: { key: 'wsjf', value: '99' },
            }));

            expect(result?.businessCase?.modifiedRice).toBe('38');
            expect(result?.businessCase?.wsjf).toBe('99');
        });

        it('handles direct string values', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: 'Grow market share in EMEA',
                mission: 'Expand internationally',
            }));

            expect(result?.businessCase?.primaryGoal).toBe('Grow market share in EMEA');
            expect(result?.businessCase?.mission).toBe('Expand internationally');
        });

        it('returns undefined businessCase when no business case fields present', () => {
            const result = extractEpicEnrichment(wrap({
                competitors: { key: 'competitors', value: 'Acme, Globex' },
            }));

            expect(result?.businessCase).toBeUndefined();
        });
    });

    describe('competitiveContext', () => {
        it('extracts competitors, differentiators, strengths, weaknesses', () => {
            const result = extractEpicEnrichment(wrap({
                competitors: { key: 'competitors', value: 'Acme, Globex, Initech' },
                differentiators: { key: 'differentiators', value: 'Faster onboarding, lower TCO' },
                strengths: { key: 'strengths', value: 'Existing customer base' },
                weaknesses: { key: 'weaknesses', value: 'Limited mobile support' },
            }));

            expect(result?.competitiveContext).toEqual({
                competitors: 'Acme, Globex, Initech',
                differentiators: 'Faster onboarding, lower TCO',
                strengths: 'Existing customer base',
                weaknesses: 'Limited mobile support',
            });
        });

        it('returns undefined when no competitive fields present', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: { key: 'primary_goal', value: 'Grow' },
            }));

            expect(result?.competitiveContext).toBeUndefined();
        });
    });

    describe('personasAndSegments', () => {
        it('extracts personas, customers, org_segment, org_industry', () => {
            const result = extractEpicEnrichment(wrap({
                personas: { key: 'personas', value: 'IT Director, Security Admin' },
                customers: { key: 'customers', value: 'Contoso, Northwind' },
                org_segment: { key: 'org_segment', value: 'Enterprise' },
                org_industry: { key: 'org_industry', value: 'Financial Services' },
            }));

            expect(result?.personasAndSegments).toEqual({
                personas: 'IT Director, Security Admin',
                customers: 'Contoso, Northwind',
                orgSegment: 'Enterprise',
                orgIndustry: 'Financial Services',
            });
        });
    });

    describe('gtmSignals', () => {
        it('extracts pricing_model, pricing_packaging, gtm_name, rollout_process', () => {
            const result = extractEpicEnrichment(wrap({
                pricing_model: { key: 'pricing_model', value: 'Add-on' },
                pricing_packaging: { key: 'pricing_packaging', value: 'Included in Enterprise tier' },
                gtm_name: { key: 'gtm_name', value: 'ClearGO Activate' },
                rollout_process: { key: 'rollout_process', value: 'Phased: Beta -> GA Q4' },
            }));

            expect(result?.gtmSignals).toEqual({
                pricingModel: 'Add-on',
                pricingPackaging: 'Included in Enterprise tier',
                gtmName: 'ClearGO Activate',
                rolloutProcess: 'Phased: Beta -> GA Q4',
            });
        });

        it('extracts ready_for_gtm_team as both definitionForGtmTeam and readyForGtmTeam', () => {
            const result = extractEpicEnrichment(wrap({
                ready_for_gtm_team: { key: 'ready_for_gtm_team', value: 'Automated onboarding flow' },
            }));

            expect(result?.gtmSignals?.definitionForGtmTeam).toBe('Automated onboarding flow');
            expect(result?.gtmSignals?.readyForGtmTeam).toBe('Automated onboarding flow');
        });
    });

    describe('customerEvidence', () => {
        it('extracts customer_feedback, beta_program, orgs_with_soft_commitment, customer_commitment_date', () => {
            const result = extractEpicEnrichment(wrap({
                customer_feedback: { key: 'customer_feedback', value: 'Top requested feature' },
                beta_program: { key: 'beta_program', value: 'Active with 3 design partners' },
                orgs_with_soft_commitment: { key: 'orgs_with_soft_commitment', value: 'Contoso, Adventure Works' },
                customer_commitment_date: { key: 'customer_commitment_date', value: '2026-10-01' },
            }));

            expect(result?.customerEvidence).toEqual({
                customerFeedback: 'Top requested feature',
                betaProgram: 'Active with 3 design partners',
                orgsWithSoftCommitment: 'Contoso, Adventure Works',
                customerCommitmentDate: '2026-10-01',
            });
        });
    });

    describe('successMetrics', () => {
        it('extracts definition_of_success, analytics_enablement', () => {
            const result = extractEpicEnrichment(wrap({
                definition_of_success: { key: 'definition_of_success', value: '80% activation rate within 30 days' },
                analytics_enablement: { key: 'analytics_enablement', value: 'Mixpanel events defined' },
            }));

            expect(result?.successMetrics).toEqual({
                definitionOfSuccess: '80% activation rate within 30 days',
                analyticsEnablement: 'Mixpanel events defined',
            });
        });
    });

    describe('dependencies', () => {
        it('extracts crossfunctional_dependencies, product_module', () => {
            const result = extractEpicEnrichment(wrap({
                crossfunctional_dependencies: { key: 'crossfunctional_dependencies', value: 'API team, Design system' },
                product_module: { key: 'product_module', value: 'Onboarding' },
            }));

            expect(result?.dependencies).toEqual({
                crossFunctionalDependencies: 'API team, Design system',
                productModule: 'Onboarding',
            });
        });
    });

    describe('timeline', () => {
        it('extracts timeline fields', () => {
            const result = extractEpicEnrichment(wrap({
                estimated_ga_release_pm_owned: { key: 'estimated_ga_release_pm_owned', value: '2026-11-15' },
                release_confidence: { key: 'release_confidence', value: 'High' },
                development_start_date: { key: 'development_start_date', value: '2026-08-01' },
            }));

            expect(result?.timeline).toEqual({
                estimatedGaRelease: '2026-11-15',
                releaseConfidence: 'High',
                developmentStartDate: '2026-08-01',
            });
        });
    });

    describe('rawFields', () => {
        it('collects non-categorized non-null fields', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: { key: 'primary_goal', value: 'Grow' },
                some_custom_field: { key: 'some_custom_field', value: 'unexpected value' },
                another_thing: { key: 'another_thing', value: 42 },
            }));

            // primary_goal is categorized into businessCase, so it should NOT be in rawFields
            expect(result?.rawFields).toHaveProperty('some_custom_field');
            expect(result?.rawFields).toHaveProperty('another_thing');
            expect(result?.rawFields).not.toHaveProperty('primary_goal');
        });

        it('excludes null-valued fields from rawFields', () => {
            const result = extractEpicEnrichment(wrap({
                random_field: { key: 'random_field', value: null },
                other_field: { key: 'other_field', value: 'present' },
            }));

            expect(result?.rawFields).not.toHaveProperty('random_field');
            expect(result?.rawFields).toHaveProperty('other_field');
        });
    });

    describe('str() helper', () => {
        it('handles Aha dropdown object shape { name: "..." }', () => {
            const result = extractEpicEnrichment(wrap({
                pricing_model: { key: 'pricing_model', name: 'Add-on', value: 'addon' },
            }));

            expect(result?.gtmSignals?.pricingModel).toBe('Add-on');
        });

        it('handles Aha date object shape { date: "..." }', () => {
            const result = extractEpicEnrichment(wrap({
                development_start_date: { key: 'development_start_date', date: '2026-08-01' },
            }));

            expect(result?.timeline?.developmentStartDate).toBe('2026-08-01');
        });

        it('handles { value: "..." } wrapper shape', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: { key: 'primary_goal', value: 'Increase NPS' },
            }));

            expect(result?.businessCase?.primaryGoal).toBe('Increase NPS');
        });

        it('handles array values by joining', () => {
            const result = extractEpicEnrichment(wrap({
                personas: { key: 'personas', value: ['IT Director', 'Security Admin'] },
            }));

            expect(result?.personasAndSegments?.personas).toBeDefined();
            expect(typeof result?.personasAndSegments?.personas).toBe('string');
        });

        it('handles numeric values directly', () => {
            const result = extractEpicEnrichment(wrap({
                modified_rice: 55,
            }));

            expect(result?.businessCase?.modifiedRice).toBe(55);
        });

        it('trims whitespace from string values', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: '  Grow market share  ',
            }));

            expect(result?.businessCase?.primaryGoal).toBe('Grow market share');
        });

        it('returns null for empty strings', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: '',
            }));

            expect(result?.businessCase).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('returns null for null input', () => {
            expect(extractEpicEnrichment(null)).toBeNull();
        });

        it('returns null for undefined input', () => {
            expect(extractEpicEnrichment(undefined)).toBeNull();
        });

        it('returns null for empty object', () => {
            expect(extractEpicEnrichment({})).toBeNull();
        });

        it('returns null for object with only null custom_fields', () => {
            expect(extractEpicEnrichment({ custom_fields: null })).toBeNull();
        });

        it('returns null when all fields are null/empty', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: { key: 'primary_goal', value: null },
                competitors: { key: 'competitors', value: '' },
                personas: { key: 'personas', value: null },
            }));

            expect(result).toBeNull();
        });

        it('returns result with rawFields when only uncategorized fields have values', () => {
            const result = extractEpicEnrichment(wrap({
                primary_goal: { key: 'primary_goal', value: null },
                random_data: { key: 'random_data', value: 'something' },
            }));

            expect(result).not.toBeNull();
            expect(result?.rawFields).toHaveProperty('random_data', 'something');
            expect(result?.businessCase).toBeUndefined();
        });

        it('handles missing custom_fields key gracefully', () => {
            const result = extractEpicEnrichment({
                standard_fields: { name: 'Test Epic' },
            });

            expect(result).toBeNull();
        });
    });
});