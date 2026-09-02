/**
 * Launch date vs. the epics it bundles.
 *
 * A launch is no longer anchored to a release — it carries its own target date,
 * set directly. That freedom introduces one failure mode worth shouting about: a
 * launch scheduled to go to market BEFORE one of its own epics ships. Every
 * downstream artifact would then be built, enabled and announced against a
 * capability customers cannot yet use.
 *
 * This is deliberately not folded into readiness scoring. Readiness answers "is
 * the GTM work done"; this answers "is the date physically possible", and the two
 * should not average each other out — a launch can be 100% ready and still
 * impossible.
 */

/** The bits of an epic this check needs. */
export interface EpicScheduleRef {
    id: string;
    name: string;
    /** The epic's own release date. */
    target_launch_date?: string | null;
}

export interface EpicDateConflict {
    epicId: string;
    epicName: string;
    /** The epic's release date, which falls after the launch date. */
    epicDate: string;
    /** Whole days the launch sits ahead of the epic shipping. Always >= 1. */
    daysEarly: number;
}

/** Whole days from a to b, both YYYY-MM-DD. Positive when b is later. */
function dayGap(a: string, b: string): number | null {
    const ma = a.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const mb = b.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!ma || !mb) return null;
    const ua = Date.UTC(+ma[1], +ma[2] - 1, +ma[3]);
    const ub = Date.UTC(+mb[1], +mb[2] - 1, +mb[3]);
    return Math.round((ub - ua) / 86400000);
}

/**
 * Epics that ship after the launch date, worst first.
 *
 * Returns empty when the launch has no date, when no epic has one, or when every
 * epic ships on or before the launch — same-day is fine, that is a normal
 * simultaneous launch.
 */
export function findEpicDateConflicts(args: {
    launchDate: string | null | undefined;
    epics: ReadonlyArray<EpicScheduleRef>;
}): EpicDateConflict[] {
    const { launchDate, epics } = args;
    if (!launchDate) return [];

    const out: EpicDateConflict[] = [];
    for (const epic of epics) {
        const epicDate = epic.target_launch_date;
        if (!epicDate) continue;
        const gap = dayGap(launchDate, epicDate);
        if (gap == null || gap <= 0) continue;
        out.push({
            epicId: epic.id,
            epicName: epic.name,
            epicDate: epicDate.slice(0, 10),
            daysEarly: gap,
        });
    }
    // Worst first, so a truncated list shows the biggest impossibility.
    return out.sort((a, b) => b.daysEarly - a.daysEarly);
}

/** One line naming the problem, for a banner or a Slack message. */
export function describeEpicDateConflicts(conflicts: EpicDateConflict[]): string | null {
    if (conflicts.length === 0) return null;
    const worst = conflicts[0];
    if (conflicts.length === 1) {
        return `This launch is ${worst.daysEarly} day${worst.daysEarly === 1 ? "" : "s"} before ${worst.epicName} ships (${worst.epicDate}).`;
    }
    return `This launch is before ${conflicts.length} of its epics ship — worst is ${worst.epicName}, ${worst.daysEarly} days later (${worst.epicDate}).`;
}
