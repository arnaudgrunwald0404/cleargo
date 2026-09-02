import {
    buildOwnedReleaseBlocks,
    buildPendingCriteriaBlocks,
    daysSince,
    describeRelease,
    humanizeEnum,
    readinessIcon,
    riskIcon,
    MAX_HOME_RELEASES,
    type HomeCriterion,
    type HomeRelease,
} from '../templates/release-home';

const APP = 'https://cleargo.example.com';

function rel(over: Partial<HomeRelease> & { name: string }): HomeRelease {
    return {
        id: 'E1',
        tier: 'TIER_1',
        readinessStatus: 'GO',
        readinessScore: 0.9,
        riskLevel: 'LOW',
        targetLaunchDate: '2026-10-01',
        ...over,
    };
}

function crit(over: Partial<HomeCriterion> & { label: string }): HomeCriterion {
    return {
        epicId: 'E1',
        epicName: 'Agent Platform',
        lastUpdatedAt: '2026-08-25T00:00:00.000Z',
        ...over,
    };
}

const textOf = (blocks: unknown[]) =>
    blocks
        .map((b) => (b as { text?: { text?: string } }).text?.text ?? '')
        .join('\n');

describe('readinessIcon', () => {
    it('maps the three decided states', () => {
        expect(readinessIcon('GO')).toBe('✅');
        expect(readinessIcon('CONDITIONAL_GO')).toBe('⚠️');
        expect(readinessIcon('NO_GO')).toBe('❌');
    });

    it('does not render an unscored release as a No Go', () => {
        expect(readinessIcon('NOT_EVALUATED')).not.toBe('❌');
        expect(readinessIcon(null)).not.toBe('❌');
        expect(readinessIcon(null)).toBe(readinessIcon('NOT_EVALUATED'));
    });
});

describe('riskIcon', () => {
    it('reads the uppercase values epic.risk_level actually stores', () => {
        expect(riskIcon('HIGH')).toBe('🔴');
        expect(riskIcon('MEDIUM')).toBe('🟡');
        expect(riskIcon('LOW')).toBe('🟢');
    });

    it('does not paint unset risk green', () => {
        expect(riskIcon(null)).not.toBe(riskIcon('LOW'));
    });
});

describe('humanizeEnum', () => {
    it('turns stored enums into prose', () => {
        expect(humanizeEnum('TIER_1', 'x')).toBe('Tier 1');
        expect(humanizeEnum('HIGH', 'x')).toBe('High');
    });

    it('falls back rather than printing null', () => {
        expect(humanizeEnum(null, 'not set')).toBe('not set');
    });
});

describe('describeRelease', () => {
    it('never prints a raw null risk', () => {
        const line = describeRelease(rel({ name: 'A', riskLevel: null }));
        expect(line).toContain('Risk: not set');
        expect(line).not.toContain('null');
    });

    it('omits the score entirely when none is stored, rather than claiming 0%', () => {
        const line = describeRelease(rel({ name: 'A', readinessScore: null }));
        expect(line).not.toContain('Score');
        expect(line).not.toContain('0%');
    });

    it('renders a stored 0-1 score as a percentage', () => {
        expect(describeRelease(rel({ name: 'A', readinessScore: 0.85 }))).toContain('Score: 85%');
    });
});

describe('buildOwnedReleaseBlocks', () => {
    it('says releases, not launches', () => {
        const text = textOf(buildOwnedReleaseBlocks([rel({ name: 'A' })], 1, APP));
        expect(text).toContain('Releases you own');
        expect(text.toLowerCase()).not.toContain('launches you own');
    });

    it('reports the real total, not the page size', () => {
        const shown = Array.from({ length: MAX_HOME_RELEASES }, (_, i) =>
            rel({ name: `R${i}`, id: `E${i}` })
        );
        const text = textOf(buildOwnedReleaseBlocks(shown, 23, APP));
        expect(text).toContain('Releases you own (23)');
    });

    it('tells the reader how many were withheld', () => {
        const blocks = buildOwnedReleaseBlocks([rel({ name: 'A' })], 9, APP);
        const context = blocks.find((b) => (b as { type: string }).type === 'context') as {
            elements: { text: string }[];
        };
        expect(context.elements[0].text).toContain('+8 more');
    });

    it('adds no overflow note when everything is shown', () => {
        const blocks = buildOwnedReleaseBlocks([rel({ name: 'A' })], 1, APP);
        expect(blocks.some((b) => (b as { type: string }).type === 'context')).toBe(false);
    });

    it('links each row to the release detail page', () => {
        const blocks = buildOwnedReleaseBlocks([rel({ name: 'A', id: 'abc' })], 1, APP);
        const row = blocks[1] as { accessory: { url: string } };
        expect(row.accessory.url).toBe(`${APP}/epics/abc`);
    });

    it('says none are active rather than none exist', () => {
        const text = textOf(buildOwnedReleaseBlocks([], 0, APP));
        expect(text).toContain('None active right now');
    });
});

describe('buildPendingCriteriaBlocks', () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');

    it('does not leak the raw status enum', () => {
        const text = textOf(buildPendingCriteriaBlocks([crit({ label: 'Docs' })], 1, APP, now));
        expect(text).not.toContain('NOT_SET');
    });

    it('flags a criterion that has sat past the stale threshold', () => {
        const text = textOf(
            buildPendingCriteriaBlocks(
                [crit({ label: 'Docs', lastUpdatedAt: '2026-07-01T00:00:00.000Z' })],
                1,
                APP,
                now
            )
        );
        expect(text).toContain('⏰');
        expect(text).toContain('Waiting 62 days');
    });

    it('leaves a recently touched criterion unflagged', () => {
        const text = textOf(
            buildPendingCriteriaBlocks(
                [crit({ label: 'Docs', lastUpdatedAt: '2026-08-29T00:00:00.000Z' })],
                1,
                APP,
                now
            )
        );
        expect(text).not.toContain('⏰');
        expect(text).toContain('Not scored yet');
    });

    it('reports the real total', () => {
        const text = textOf(buildPendingCriteriaBlocks([crit({ label: 'Docs' })], 12, APP, now));
        expect(text).toContain('Criteria awaiting your decision (12)');
    });
});

describe('daysSince', () => {
    const now = Date.parse('2026-09-01T00:00:00.000Z');

    it('returns null for a row that has never been touched', () => {
        expect(daysSince(null, now)).toBeNull();
    });

    it('returns null rather than NaN for an unparseable stamp', () => {
        expect(daysSince('not a date', now)).toBeNull();
    });
});
