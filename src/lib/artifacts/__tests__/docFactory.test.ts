import { deriveStoryCode, artifactFileName, resolveCriterionId } from '../docFactory';
import { ARTIFACT_REGISTRY } from '../registry';
import { ARTIFACT_TYPES } from '@/types/artifacts';

describe('deriveStoryCode', () => {
    it('reproduces the codes Kristin actually filed', () => {
        // Ground truth: AGENT_Story-Brief_v0.1 and COPYR_Story-Brief_v0.1 both
        // exist in Drive. Initials would have produced AP and CR.
        expect(deriveStoryCode('Agent Platform')).toBe('AGENT');
        expect(deriveStoryCode('Copy Requisition')).toBe('COPYR');
    });

    it('drops the company prefix, which carries no information', () => {
        // The launch in ClearGO is named "ClearCo Agent Platform" but Kristin
        // filed it as AGENT. Without this, every "ClearCo ..." launch codes to
        // CLEAR and they all collide.
        expect(deriveStoryCode('ClearCo Agent Platform')).toBe('AGENT');
        expect(deriveStoryCode('ClearCompany Spotlight')).toBe('SPOTL');
        expect(deriveStoryCode('Clear Talent Hub')).toBe('TALEN');
    });

    it('keeps the prefix when it is the whole name', () => {
        // Stripping everything would leave nothing to code.
        expect(deriveStoryCode('ClearCo')).toBe('CLEAR');
    });

    it('distinguishes launches that would otherwise collide', () => {
        const a = deriveStoryCode('ClearCo Agent Platform');
        const b = deriveStoryCode('ClearCo Document Cloud');
        expect(a).not.toBe(b);
    });

    it('truncates a single long word to five characters', () => {
        expect(deriveStoryCode('Spotlight')).toBe('SPOTL');
    });

    it('pads nothing for a name shorter than five characters', () => {
        expect(deriveStoryCode('Hub')).toBe('HUB');
    });

    it('ignores punctuation rather than emitting it into a filename', () => {
        expect(deriveStoryCode('Copy & Requisition v2')).toBe('COPYR');
    });

    it('falls back to a usable code for a name with no alphanumerics', () => {
        expect(deriveStoryCode('***')).toBe('LAUNCH');
    });

    it('always returns something filename-safe', () => {
        for (const name of ['Agent Platform', 'x', '  spaced  out  ', '2026.3 Release']) {
            expect(deriveStoryCode(name)).toMatch(/^[A-Z0-9]+$/);
        }
    });
});

describe('artifactFileName', () => {
    it('matches the filing convention from the templates', () => {
        // "File as [CODE]_Story-Brief_v0.1"
        expect(artifactFileName('AGENT', 'story_brief')).toBe('AGENT_Story-Brief_v0.1');
    });

    it('carries the version through on promotion', () => {
        expect(artifactFileName('AGENT', 'story_brief', 'v1.0')).toBe('AGENT_Story-Brief_v1.0');
    });

    it('produces a hyphenated, space-free name for every artifact', () => {
        for (const type of ARTIFACT_TYPES) {
            expect(artifactFileName('CODE', type)).not.toContain(' ');
        }
    });
});

describe('resolveCriterionId', () => {
    const MARKETING = ARTIFACT_REGISTRY.marketing_brief;

    it('matches on the current label', () => {
        const byLabel = new Map([['Marketing Brief delivered', 'crit-new']]);
        expect(resolveCriterionId(MARKETING, byLabel)).toBe('crit-new');
    });

    it('falls back to the pre-rename label when the migration has not run', () => {
        // Kristin renamed Campaign Brief -> Marketing Brief on 2026-08-26. A DB
        // that has not had 20260826000000 applied still carries the old label,
        // and a null criterion_id is legal, so this would fail silently.
        const byLabel = new Map([['Campaign Brief delivered', 'crit-old']]);
        expect(resolveCriterionId(MARKETING, byLabel)).toBe('crit-old');
    });

    it('prefers the current label when both are somehow present', () => {
        const byLabel = new Map([
            ['Campaign Brief delivered', 'crit-old'],
            ['Marketing Brief delivered', 'crit-new'],
        ]);
        expect(resolveCriterionId(MARKETING, byLabel)).toBe('crit-new');
    });

    it('returns null for an artifact that maps to no single criterion', () => {
        // The gate checklist spans naming, pricing and beta.
        expect(resolveCriterionId(ARTIFACT_REGISTRY.gate_checklist, new Map())).toBeNull();
    });

    it('returns null rather than guessing when nothing matches', () => {
        expect(resolveCriterionId(ARTIFACT_REGISTRY.story_brief, new Map())).toBeNull();
    });
});
