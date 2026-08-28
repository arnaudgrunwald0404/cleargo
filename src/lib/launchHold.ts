/**
 * Launch Hold: an epic that ships before its own launch, without RevOps clearance.
 *
 * This is the mirror of the conflict in launchEpicDateConflicts. There, the LAUNCH
 * lands before an epic ships, so the GTM motion runs ahead of the product. Here
 * the EPIC ships before the launch, so the product reaches customers ahead of the
 * GTM motion — which is fine in itself, plenty of features ship quietly ahead of
 * their announcement.
 *
 * What makes it a hold is the combination with RevOps. RevOps sign-off is what
 * confirms pricing is communicated, the SKU is in CRM, and the order form can
 * represent the thing. Shipping before the launch without it means the feature is
 * live and visible but cannot be quoted or sold correctly — the field sees it
 * before the systems can transact it.
 *
 * So: hold the release, not the launch.
 */

import { normalizeStatus } from '@/lib/readiness-scoring';

/** The epic criterion that carries RevOps clearance on the epic matrix. */
export const REVOPS_SIGNOFF_LABEL = 'Overall Revenue Ops Signoff';

export interface LaunchHoldInput {
    /** The epic's own release date. */
    epicDate: string | null | undefined;
    /** The date of the launch this epic belongs to, or null when it has none. */
    launchDate: string | null | undefined;
    /** Raw status of the epic's Overall Revenue Ops Signoff. */
    revOpsStatus: string | null | undefined;
}

export interface LaunchHold {
    onHold: true;
    /** Whole days the epic ships ahead of its launch. Always >= 1. */
    daysEarly: number;
    reason: string;
}

/** Whole days from a to b, both YYYY-MM-DD. Positive when b is later. */
function dayGap(a: string, b: string): number | null {
    const ma = a.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const mb = b.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!ma || !mb) return null;
    return Math.round(
        (Date.UTC(+mb[1], +mb[2] - 1, +mb[3]) - Date.UTC(+ma[1], +ma[2] - 1, +ma[3])) / 86400000
    );
}

/**
 * Whether RevOps has cleared this epic. Only GO clears it: a Conditional Go on
 * pricing is exactly the case that should hold, because the caveat is usually the
 * unresolved part of how it gets sold.
 */
export function revOpsHasCleared(status: string | null | undefined): boolean {
    return normalizeStatus(status) === 'GO';
}

/**
 * Null when there is no hold — the epic has no launch, ships on or after it, or
 * RevOps has already cleared.
 */
export function evaluateLaunchHold(input: LaunchHoldInput): LaunchHold | null {
    const { epicDate, launchDate, revOpsStatus } = input;

    // No launch means no hold: an epic that is not part of a GTM motion is not
    // waiting on one. Most epics are in this position.
    if (!epicDate || !launchDate) return null;

    const gap = dayGap(epicDate, launchDate);
    // Shipping on the same day, or after the launch, is the normal sequence.
    if (gap == null || gap <= 0) return null;

    if (revOpsHasCleared(revOpsStatus)) return null;

    const status = normalizeStatus(revOpsStatus);
    const because =
        status === 'NOT_SET'
            ? 'RevOps has not signed off'
            : status === 'CONDITIONAL_GO'
              ? 'RevOps signed off conditionally'
              : status === 'NO_GO'
                ? 'RevOps returned a No Go'
                : 'RevOps has not signed off';

    return {
        onHold: true,
        daysEarly: gap,
        reason: `Ships ${gap} day${gap === 1 ? '' : 's'} before its launch and ${because} — it would be live before it can be quoted or sold.`,
    };
}
