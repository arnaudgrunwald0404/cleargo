import {
    buildArtifactBlocks,
    buildUnassignedBlocks,
    buildStoryBriefQuestionBlocks,
    describeArtifactState,
    sortHomeArtifacts,
    MAX_HOME_ARTIFACTS,
    type HomeArtifact,
} from '../templates/launch-home';

const APP = 'https://cleargo.example.com';

function art(over: Partial<HomeArtifact> & { label: string }): HomeArtifact {
    return {
        launchId: 'L1',
        launchName: 'Agent Platform',
        status: 'NOT_STARTED',
        startDate: '2026-08-13',
        dueDate: '2026-08-27',
        scheduleState: 'in_window',
        gate: false,
        blocking: [],
        ...over,
    };
}

const labels = (items: HomeArtifact[]) => sortHomeArtifacts(items).map((i) => i.label);

describe('sortHomeArtifacts', () => {
    it('puts a late blocking gate above everything else', () => {
        const items = [
            art({ label: 'in window' }),
            art({ label: 'late alone', scheduleState: 'late' }),
            art({ label: 'late gate', scheduleState: 'late', gate: true, blocking: ['Story Brief'] }),
        ];
        expect(labels(items)[0]).toBe('late gate');
    });

    it('does not privilege a late gate that is blocking nothing', () => {
        const items = [
            art({ label: 'late first', scheduleState: 'late', dueDate: '2026-08-01' }),
            art({ label: 'idle gate', scheduleState: 'late', gate: true, blocking: [], dueDate: '2026-08-10' }),
        ];
        expect(labels(items)[0]).toBe('late first');
    });

    it('orders by urgency: late, open now, compressed, upcoming', () => {
        const items = [
            art({ label: 'upcoming', scheduleState: 'upcoming' }),
            art({ label: 'compressed', scheduleState: 'compressed' }),
            art({ label: 'open', scheduleState: 'in_window' }),
            art({ label: 'late', scheduleState: 'late' }),
        ];
        expect(labels(items)).toEqual(['late', 'open', 'compressed', 'upcoming']);
    });

    it('breaks ties by soonest due date', () => {
        const items = [
            art({ label: 'later', dueDate: '2026-09-01' }),
            art({ label: 'sooner', dueDate: '2026-08-20' }),
        ];
        expect(labels(items)).toEqual(['sooner', 'later']);
    });

    it('sinks undated work below dated work rather than floating it to the top', () => {
        const items = [
            art({ label: 'undated', dueDate: null }),
            art({ label: 'dated', dueDate: '2026-09-01' }),
        ];
        expect(labels(items)).toEqual(['dated', 'undated']);
    });

    it('does not mutate the caller array', () => {
        const items = [art({ label: 'b', scheduleState: 'upcoming' }), art({ label: 'a', scheduleState: 'late' })];
        sortHomeArtifacts(items);
        expect(items.map((i) => i.label)).toEqual(['b', 'a']);
    });
});

describe('describeArtifactState', () => {
    it('names the overdue date', () => {
        expect(describeArtifactState(art({ label: 'x', scheduleState: 'late', dueDate: '2026-08-01' }))).toBe(
            'Overdue since 2026-08-01'
        );
    });

    it('explains a compressed window instead of blaming the owner', () => {
        // Kristin's rule: the window never existed, so nobody missed it.
        const text = describeArtifactState(art({ label: 'x', scheduleState: 'compressed' }));
        expect(text).toContain('before this launch existed');
        expect(text.toLowerCase()).not.toContain('overdue');
    });

    it('quotes lateSince rather than a due date from before the launch existed', () => {
        // A compressed artifact that has now run past its re-granted window. The
        // stored due date predates the launch, so naming it would be nonsense.
        const text = describeArtifactState(
            art({ label: 'x', scheduleState: 'late', dueDate: '2026-07-08', lateSince: '2026-08-15' })
        );
        expect(text).toBe('Overdue since 2026-08-15');
    });

    it('names the date a compressed artifact is actually held to', () => {
        const text = describeArtifactState(
            art({ label: 'x', scheduleState: 'compressed', lateSince: '2026-08-15' })
        );
        expect(text).toContain('before this launch existed');
        expect(text).toContain('due 2026-08-15');
        expect(text.toLowerCase()).not.toContain('overdue');
    });

    it('gives the start date for upcoming work', () => {
        expect(describeArtifactState(art({ label: 'x', scheduleState: 'upcoming', startDate: '2026-09-05' }))).toBe(
            'Starts 2026-09-05'
        );
    });

    it('handles a missing due date without printing null', () => {
        const text = describeArtifactState(art({ label: 'x', scheduleState: 'in_window', dueDate: null }));
        expect(text).toBe('Open now');
    });
});

describe('buildArtifactBlocks', () => {
    it('says so plainly when nothing is assigned', () => {
        const text = JSON.stringify(buildArtifactBlocks([], APP));
        expect(text).toContain('Nothing assigned to you');
    });

    it('hides completed artifacts and excludes them from the count', () => {
        const items = [art({ label: 'done', status: 'DONE' }), art({ label: 'todo' })];
        const text = JSON.stringify(buildArtifactBlocks(items, APP));
        expect(text).toContain('Your launch artifacts (1)');
        expect(text).not.toContain('*done*');
    });

    it('treats an all-done list as nothing assigned', () => {
        const text = JSON.stringify(buildArtifactBlocks([art({ label: 'd', status: 'DONE' })], APP));
        expect(text).toContain('Nothing assigned to you');
    });

    it('marks gates and names what they hold up', () => {
        const items = [art({ label: 'Pricing', gate: true, blocking: ['Story Brief', 'Message Brief'] })];
        const text = JSON.stringify(buildArtifactBlocks(items, APP));
        expect(text).toContain('gate');
        expect(text).toContain('Holding up: Story Brief, Message Brief');
    });

    it('omits the holding-up line for a non-gate', () => {
        const items = [art({ label: 'Story Brief', gate: false, blocking: ['Message Brief'] })];
        expect(JSON.stringify(buildArtifactBlocks(items, APP))).not.toContain('Holding up');
    });

    it('links each row to its launch', () => {
        const text = JSON.stringify(buildArtifactBlocks([art({ label: 'x', launchId: 'L9' })], APP));
        expect(text).toContain(`${APP}/gtm-launches/L9`);
    });

    it('caps the list and reports the overflow', () => {
        const items = Array.from({ length: MAX_HOME_ARTIFACTS + 4 }, (_, i) => art({ label: `a${i}` }));
        const text = JSON.stringify(buildArtifactBlocks(items, APP));
        expect(text).toContain('Your launch artifacts (12)');
        expect(text).toContain('+4 more not shown');
    });

    it('adds no overflow note when everything fits', () => {
        expect(JSON.stringify(buildArtifactBlocks([art({ label: 'x' })], APP))).not.toContain('more not shown');
    });
});

describe('buildStoryBriefQuestionBlocks', () => {
    const brief = (openCount: number, epicName = 'Self-Scheduling') => ({
        target: { briefId: `b-${epicName}`, epicId: 'e', epicName },
        openCount,
    });

    it('renders nothing at all when no questions are outstanding', () => {
        // An empty heading reads as "no questions exist"; absence is honest.
        expect(buildStoryBriefQuestionBlocks([])).toEqual([]);
        expect(buildStoryBriefQuestionBlocks([brief(0)])).toEqual([]);
    });

    it('lists each brief with its open count and a button', () => {
        const text = JSON.stringify(buildStoryBriefQuestionBlocks([brief(3), brief(1, 'Bulk Import')]));
        expect(text).toContain('Self-Scheduling* — 3 open');
        expect(text).toContain('Answer 3 open questions');
        expect(text).toContain('Bulk Import* — 1 open');
        expect(text).toContain('Answer 1 open question');
    });

    it('frames the ask as gap-only so it does not read as "fill in the template"', () => {
        const text = JSON.stringify(buildStoryBriefQuestionBlocks([brief(2)]));
        expect(text).toContain('could not support');
    });

    it('drops briefs with nothing open while keeping the rest', () => {
        const text = JSON.stringify(buildStoryBriefQuestionBlocks([brief(0, 'Quiet'), brief(2, 'Loud')]));
        expect(text).not.toContain('Quiet');
        expect(text).toContain('Loud');
    });
});

describe('buildUnassignedBlocks', () => {
    const g = (count: number, launchName = 'Agent Platform') => ({
        launchId: `L-${launchName}`,
        launchName,
        count,
    });

    it('renders nothing when every artifact has an owner', () => {
        expect(buildUnassignedBlocks([], 'https://x')).toEqual([]);
        expect(buildUnassignedBlocks([g(0)], 'https://x')).toEqual([]);
    });

    it('totals across launches and groups per launch', () => {
        const text = JSON.stringify(buildUnassignedBlocks([g(56), g(4, 'Doc Cloud')], 'https://x'));
        expect(text).toContain('Needs an owner (60)');
        expect(text).toContain('Agent Platform* — 56 unassigned');
        expect(text).toContain('Doc Cloud* — 4 unassigned');
    });

    it('says why an unowned artifact matters rather than just counting it', () => {
        // The point is that nobody is being reminded, not that a number is high.
        expect(JSON.stringify(buildUnassignedBlocks([g(3)], 'https://x'))).toContain(
            'nobody is being reminded'
        );
    });

    it('links to the launch where owners get set', () => {
        const text = JSON.stringify(buildUnassignedBlocks([g(3, 'Foo')], 'https://app'));
        expect(text).toContain('https://app/gtm-launches/L-Foo');
        expect(text).toContain('Assign owners');
    });
});
