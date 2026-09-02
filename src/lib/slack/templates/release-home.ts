/**
 * App Home sections for the RELEASE side: the releases you own, and the criteria
 * waiting on your decision.
 *
 * These were built inline in the app_home_opened handler as a copy of the
 * /my-releases command, and drifted the same way that command had: everything
 * was called a "launch" while every query read `epic`. Releases and launches are
 * different objects in ClearGO — the launch sections live in ./launch-home — so
 * the home tab was captioning release rows with a launch heading.
 *
 * Pure builders; the queries stay in the route.
 */

/** A home tab is a prompt to act, not a backlog. Totals are stated separately. */
export const MAX_HOME_RELEASES = 5;
export const MAX_HOME_CRITERIA = 5;

/** Days without an update before a pending criterion is called out as stale. */
export const STALE_CRITERION_DAYS = 14;

export interface HomeRelease {
    id: string;
    name: string;
    tier: string | null;
    /** GO | CONDITIONAL_GO | NO_GO | NOT_EVALUATED | null */
    readinessStatus: string | null;
    /** 0–1, as stored on `epic.readiness_score`. */
    readinessScore: number | null;
    /** HIGH | MEDIUM | LOW | null — stored uppercase by src/lib/readiness.ts. */
    riskLevel: string | null;
    targetLaunchDate: string | null;
}

export interface HomeCriterion {
    label: string;
    epicId: string;
    epicName: string;
    /** ISO timestamp; null when the row has never been touched. */
    lastUpdatedAt: string | null;
}

/**
 * NOT_EVALUATED and null are not a No Go. The old code fell through to ❌ for
 * both, so a release nobody had scored yet read as a hard stop.
 */
export function readinessIcon(status: string | null): string {
    switch (status) {
        case 'GO':
            return '✅';
        case 'CONDITIONAL_GO':
            return '⚠️';
        case 'NO_GO':
            return '❌';
        default:
            return '⚪';
    }
}

/** Unset risk is unknown, not low — the old code painted it green. */
export function riskIcon(level: string | null): string {
    switch (level) {
        case 'HIGH':
            return '🔴';
        case 'MEDIUM':
            return '🟡';
        case 'LOW':
            return '🟢';
        default:
            return '⚪';
    }
}

function titleCase(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase();
}

/** TIER_1 -> Tier 1, HIGH -> High. Raw enum values leaked into the UI before. */
export function humanizeEnum(value: string | null, fallback: string): string {
    if (!value) return fallback;
    const spaced = value.replace(/_/g, ' ');
    return spaced.split(' ').map(titleCase).join(' ');
}

export function describeRelease(release: HomeRelease): string {
    const parts = [`Risk: ${humanizeEnum(release.riskLevel, 'not set')}`];
    if (release.readinessScore !== null) {
        parts.push(`Score: ${Math.round(release.readinessScore * 100)}%`);
    }
    if (release.targetLaunchDate) {
        parts.push(`Target: ${release.targetLaunchDate}`);
    }
    return parts.join(' | ');
}

/**
 * `total` is the real number of matching releases, not `releases.length`. The
 * header used to print the page size, so a PM owning twenty releases was told
 * they owned five.
 */
export function buildOwnedReleaseBlocks(
    releases: HomeRelease[],
    total: number,
    appUrl: string
): unknown[] {
    if (releases.length === 0) {
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Releases you own*\n_None active right now._',
                },
            },
        ];
    }

    const blocks: unknown[] = [
        {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Releases you own (${total}):*` },
        },
    ];

    for (const release of releases) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text:
                    `${readinessIcon(release.readinessStatus)} *${release.name}* ` +
                    `(${humanizeEnum(release.tier, 'no tier')})\n` +
                    `${riskIcon(release.riskLevel)} ${describeRelease(release)}`,
            },
            accessory: {
                type: 'button',
                text: { type: 'plain_text', text: 'View release', emoji: true },
                url: `${appUrl}/epics/${release.id}`,
            },
        });
    }

    if (total > releases.length) {
        blocks.push({
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `+${total - releases.length} more not shown.` },
            ],
        });
    }

    return blocks;
}

export function daysSince(iso: string | null, now: number = Date.now()): number | null {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export function buildPendingCriteriaBlocks(
    criteria: HomeCriterion[],
    total: number,
    appUrl: string,
    now: number = Date.now()
): unknown[] {
    if (criteria.length === 0) {
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*Criteria awaiting your decision*\n_Nothing waiting on you._ ✅',
                },
            },
        ];
    }

    const blocks: unknown[] = [
        {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Criteria awaiting your decision (${total}):*` },
        },
    ];

    for (const criterion of criteria) {
        const age = daysSince(criterion.lastUpdatedAt, now);
        // The status is not printed: every row in this section is unscored by
        // definition, and it used to render the raw enum ("Status: NOT_SET").
        const waiting =
            age !== null && age >= STALE_CRITERION_DAYS
                ? `⏰ Waiting ${age} days`
                : 'Not scored yet';

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${criterion.label}*\n${criterion.epicName} — ${waiting}`,
            },
            accessory: {
                type: 'button',
                text: { type: 'plain_text', text: 'Score it', emoji: true },
                url: `${appUrl}/epics/${criterion.epicId}`,
            },
        });
    }

    if (total > criteria.length) {
        blocks.push({
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `+${total - criteria.length} more not shown.` },
            ],
        });
    }

    return blocks;
}
