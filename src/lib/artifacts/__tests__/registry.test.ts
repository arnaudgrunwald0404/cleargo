import {
    ARTIFACT_REGISTRY,
    ARTIFACT_ORDER,
    artifactsForTier,
    getTemplateId,
    resolveArtifactOwner,
} from '../registry';
import { ARTIFACT_TYPES, ARTIFACT_FILENAME_PART, ARTIFACT_FOLDER_PREFIX, type ArtifactType } from '@/types/artifacts';

describe('registry integrity', () => {
    it('has an entry for every declared artifact type', () => {
        for (const type of ARTIFACT_TYPES) {
            expect(ARTIFACT_REGISTRY[type]).toBeDefined();
            expect(ARTIFACT_REGISTRY[type].type).toBe(type);
        }
    });

    it('orders artifacts to match the 00-04 filing convention', () => {
        const prefixes = ARTIFACT_ORDER.map((t) => ARTIFACT_FOLDER_PREFIX[t]);
        expect(prefixes).toEqual([...prefixes].sort());
    });

    it('gives every artifact a filename part and a template env var', () => {
        for (const type of ARTIFACT_TYPES) {
            expect(ARTIFACT_FILENAME_PART[type]).toBeTruthy();
            expect(ARTIFACT_REGISTRY[type].templateEnvVar).toMatch(/^GOOGLE_TEMPLATE_/);
        }
    });

    it('declares at least one claim-bearing section per artifact', () => {
        // A section list that is empty would silently skip the grounding pass,
        // which is the one thing making drafts trustworthy.
        for (const type of ARTIFACT_TYPES) {
            expect(ARTIFACT_REGISTRY[type].claimSections.length).toBeGreaterThan(0);
        }
    });

    describe('dependency chain', () => {
        it('starts at the commercialization gate', () => {
            expect(ARTIFACT_REGISTRY.gate_checklist.dependsOn).toBeNull();
        });

        it('gates the Story Brief behind naming and pricing', () => {
            // "No Story Brief starts until Naming and Pricing/Packaging are cleared."
            expect(ARTIFACT_REGISTRY.story_brief.dependsOn).toBe('gate_checklist');
        });

        it('is acyclic and reaches the root from every artifact', () => {
            for (const type of ARTIFACT_TYPES) {
                const seen = new Set<string>();
                let cursor: ArtifactType | null = type;
                while (cursor) {
                    expect(seen.has(cursor)).toBe(false);
                    seen.add(cursor);
                    cursor = ARTIFACT_REGISTRY[cursor].dependsOn;
                }
                expect(seen.has('gate_checklist')).toBe(true);
            }
        });

        it('never depends on an artifact that comes later in workback order', () => {
            for (const type of ARTIFACT_ORDER) {
                const dep = ARTIFACT_REGISTRY[type].dependsOn;
                if (!dep) continue;
                expect(ARTIFACT_ORDER.indexOf(dep)).toBeLessThan(ARTIFACT_ORDER.indexOf(type));
            }
        });
    });

    it('routes Story to the PM and everything downstream to PMM', () => {
        // Kristin: "The system chases PM for Story, PMM for everything downstream."
        expect(ARTIFACT_REGISTRY.story_brief.ownerRole).toBe('PM');
        expect(ARTIFACT_REGISTRY.messaging_brief.ownerRole).toContain('PMM');
        expect(ARTIFACT_REGISTRY.enablement_guide.ownerRole).toContain('PMM');
        expect(ARTIFACT_REGISTRY.marketing_brief.ownerRole).toContain('PMM');
    });

    it('points each runway artifact at a seeded criterion label', () => {
        // These strings are the join key — criterion rows have no key column,
        // so a typo here silently unlinks the document from readiness.
        expect(ARTIFACT_REGISTRY.story_brief.criterionLabel).toBe(
            'Story Brief delivered to PMM + Product Education'
        );
        expect(ARTIFACT_REGISTRY.messaging_brief.criterionLabel).toBe('Message Brief ratified');
        expect(ARTIFACT_REGISTRY.enablement_guide.criterionLabel).toBe(
            'Field Enablement Guide delivered'
        );
        expect(ARTIFACT_REGISTRY.marketing_brief.criterionLabel).toBe('Marketing Brief delivered');
    });

    it('keeps an alias for every criterion label that has been renamed', () => {
        // Losing the alias silently unlinks the document from readiness -- a
        // null criterion_id is legal, so nothing errors. This has bitten twice.
        expect(ARTIFACT_REGISTRY.marketing_brief.legacyCriterionLabels).toContain(
            'Campaign Brief delivered'
        );
        expect(ARTIFACT_REGISTRY.enablement_guide.legacyCriterionLabels).toContain(
            'Enablement Brief delivered'
        );
    });

    it('leaves the gate checklist unlinked, since it spans three criteria', () => {
        expect(ARTIFACT_REGISTRY.gate_checklist.criterionLabel).toBeNull();
    });
});

describe('artifactsForTier', () => {
    it('returns every artifact for a Tier 1 launch', () => {
        expect(artifactsForTier('TIER_1')).toHaveLength(ARTIFACT_TYPES.length);
    });

    it('returns every artifact for a Tier 2 launch', () => {
        // Kristin confirmed Campaign applies to both tiers by giving T2 a 14-day
        // offset, settling the deck's apparent omission.
        expect(artifactsForTier('TIER_2')).toHaveLength(ARTIFACT_TYPES.length);
    });

    it('returns everything for an untiered launch rather than nothing', () => {
        // Creating a spare document is recoverable; silently skipping one when
        // the tier is set later is not.
        expect(artifactsForTier(null)).toHaveLength(ARTIFACT_TYPES.length);
    });

    it('returns them in workback order', () => {
        expect(artifactsForTier('TIER_1').map((d) => d.type)).toEqual(ARTIFACT_ORDER);
    });
});

describe('getTemplateId', () => {
    const original = process.env.GOOGLE_TEMPLATE_STORY_BRIEF_ID;
    afterEach(() => {
        if (original === undefined) delete process.env.GOOGLE_TEMPLATE_STORY_BRIEF_ID;
        else process.env.GOOGLE_TEMPLATE_STORY_BRIEF_ID = original;
    });

    it('returns null when unconfigured, so callers degrade instead of throwing', () => {
        delete process.env.GOOGLE_TEMPLATE_STORY_BRIEF_ID;
        expect(getTemplateId(ARTIFACT_REGISTRY.story_brief)).toBeNull();
    });

    it('treats a whitespace-only value as unset', () => {
        process.env.GOOGLE_TEMPLATE_STORY_BRIEF_ID = '   ';
        expect(getTemplateId(ARTIFACT_REGISTRY.story_brief)).toBeNull();
    });

    it('returns the configured id', () => {
        process.env.GOOGLE_TEMPLATE_STORY_BRIEF_ID = 'doc-123';
        expect(getTemplateId(ARTIFACT_REGISTRY.story_brief)).toBe('doc-123');
    });
});

describe('resolveArtifactOwner', () => {
    it('gives the Story Brief to the PM, not the launch owner', () => {
        const owner = resolveArtifactOwner(ARTIFACT_REGISTRY.story_brief, {
            launchOwnerEmail: 'pmm@example.com',
            pmEmail: 'pm@example.com',
            criterionDefaultOwner: null,
        });
        expect(owner).toBe('pm@example.com');
    });

    it('gives downstream artifacts to the launch owner', () => {
        const owner = resolveArtifactOwner(ARTIFACT_REGISTRY.messaging_brief, {
            launchOwnerEmail: 'pmm@example.com',
            pmEmail: 'pm@example.com',
            criterionDefaultOwner: null,
        });
        expect(owner).toBe('pmm@example.com');
    });

    it('falls back to the launch owner when the launch has no PM', () => {
        const owner = resolveArtifactOwner(ARTIFACT_REGISTRY.story_brief, {
            launchOwnerEmail: 'pmm@example.com',
            pmEmail: null,
            criterionDefaultOwner: null,
        });
        expect(owner).toBe('pmm@example.com');
    });

    it('ignores the seeded placeholder owners, which are not addresses', () => {
        // The runway seeds literal strings like "[launch owner (PMM)]".
        const owner = resolveArtifactOwner(ARTIFACT_REGISTRY.marketing_brief, {
            launchOwnerEmail: null,
            pmEmail: null,
            criterionDefaultOwner: '[launch owner (PMM)]',
        });
        expect(owner).toBeNull();
    });

    it('accepts a criterion default that is a real address', () => {
        const owner = resolveArtifactOwner(ARTIFACT_REGISTRY.marketing_brief, {
            launchOwnerEmail: null,
            pmEmail: null,
            criterionDefaultOwner: 'growth@example.com',
        });
        expect(owner).toBe('growth@example.com');
    });
});
