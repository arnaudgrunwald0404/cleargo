/**
 * Launch checklist helpers shared by the /api/launches routes.
 */

/**
 * Launch-context criteria use 'ALL' or a comma-separated tier list
 * (e.g. 'TIER_1,TIER_2') for tier_applicability. A launch with no tier
 * gets the full battery — there is nothing to filter on until tier is set.
 */
export function launchCriterionApplies(
    tierApplicability: string | null | undefined,
    launchTier: string | null | undefined
): boolean {
    if (!tierApplicability || tierApplicability === 'ALL') return true;
    if (!launchTier) return true;
    return tierApplicability
        .split(',')
        .map((t) => t.trim())
        .includes(launchTier);
}

/** T-minus due date: target launch date minus offset days, as YYYY-MM-DD. */
export function tMinusDueDate(
    targetLaunchDate: string | null | undefined,
    offsetDays: number | null | undefined
): string | null {
    if (!targetLaunchDate || offsetDays == null) return null;
    const d = new Date(`${targetLaunchDate}T00:00:00Z`);
    if (isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() - offsetDays);
    return d.toISOString().split('T')[0];
}
