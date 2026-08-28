/**
 * Launch status is derived from the target launch date, the same way epic release
 * status is derived from Cohort 1 / GA dates (see epic-release-status.ts). Before
 * this, launch.status was a free-standing dropdown nobody kept current, so a
 * launch that shipped in June still read "Planning" in August.
 *
 * launch.status now stores ONLY a manual override. NULL means "compute it".
 * Unlike an epic — where Cancelled is the one storable override — any status can
 * be pinned here, because a PMM sometimes needs to say a launch is On Hold or
 * already Launched regardless of what the calendar says. Clearing the override
 * (status = null) hands the launch back to the computation.
 */

export type ComputedLaunchStatus = 'Planning' | 'In Progress' | 'Launched' | 'Post-Launch';
export type ManualOnlyLaunchStatus = 'On Hold' | 'Cancelled';
export type LaunchStatus = ComputedLaunchStatus | ManualOnlyLaunchStatus;

export const COMPUTED_LAUNCH_STATUSES: ComputedLaunchStatus[] = [
  'Planning',
  'In Progress',
  'Launched',
  'Post-Launch',
];

/**
 * States the calendar can never produce. A launch is only paused or abandoned
 * because a person said so, so these exist as overrides only.
 */
export const MANUAL_ONLY_LAUNCH_STATUSES: ManualOnlyLaunchStatus[] = ['On Hold', 'Cancelled'];

export const LAUNCH_STATUSES: LaunchStatus[] = [
  ...COMPUTED_LAUNCH_STATUSES,
  ...MANUAL_ONLY_LAUNCH_STATUSES,
];

/**
 * When the GTM workback opens, per tier: the largest T-minus offset the seeded
 * launch criteria carry (20260821000500 / apply-2026-08-21-gates.sql). Before
 * T-minus this window the launch has a date but no work due, which is what
 * "Planning" means; inside it the checklist is live, which is "In Progress".
 * Kept as a constant rather than read from criterion rows so the launch list can
 * compute status without joining the whole checklist.
 */
export const LAUNCH_WORKBACK_LEAD_DAYS: Record<string, number> = {
  TIER_1: 105,
  TIER_2: 77,
};

/** An untiered launch is treated as the shorter runway; T2 is the safer guess. */
export const DEFAULT_LAUNCH_WORKBACK_LEAD_DAYS = 77;

export interface LaunchForStatus {
  /** The stored override. NULL/undefined = derive from dates. */
  status?: string | null;
  target_launch_date?: string | null;
  tier?: string | null;
}

export function isLaunchStatus(value: unknown): value is LaunchStatus {
  return typeof value === 'string' && (LAUNCH_STATUSES as string[]).includes(value);
}

export function isManualOnlyLaunchStatus(value: unknown): value is ManualOnlyLaunchStatus {
  return typeof value === 'string' && (MANUAL_ONLY_LAUNCH_STATUSES as string[]).includes(value);
}

export function launchWorkbackLeadDays(tier: string | null | undefined): number {
  if (!tier) return DEFAULT_LAUNCH_WORKBACK_LEAD_DAYS;
  return LAUNCH_WORKBACK_LEAD_DAYS[tier] ?? DEFAULT_LAUNCH_WORKBACK_LEAD_DAYS;
}

function midnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Noon avoids the DST edge that makes a bare YYYY-MM-DD land on the day before. */
function parseYmd(ymd: string): Date | null {
  const d = new Date(ymd + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  return midnight(d);
}

/**
 * Where the calendar puts this launch. Ignores any stored override — callers who
 * want the value users should see want effectiveLaunchStatus.
 */
export function computeLaunchStatus(
  launch: LaunchForStatus,
  today: Date = new Date()
): ComputedLaunchStatus {
  // No date, no schedule to be measured against: still being planned.
  if (!launch.target_launch_date) return 'Planning';

  const target = parseYmd(launch.target_launch_date);
  if (!target) return 'Planning';

  const now = midnight(today);

  // The day after the target date the launch is out and the post-launch window
  // (metrics, retro, adoption) is what remains.
  if (now > target) return 'Post-Launch';
  if (now.getTime() === target.getTime()) return 'Launched';

  const workbackOpens = new Date(target);
  workbackOpens.setDate(workbackOpens.getDate() - launchWorkbackLeadDays(launch.tier));

  return now >= workbackOpens ? 'In Progress' : 'Planning';
}

/** The status to show and act on: the override when one is pinned, else computed. */
export function effectiveLaunchStatus(
  launch: LaunchForStatus,
  today: Date = new Date()
): LaunchStatus {
  if (isLaunchStatus(launch.status)) return launch.status;
  return computeLaunchStatus(launch, today);
}

export function isLaunchStatusOverridden(launch: LaunchForStatus): boolean {
  return isLaunchStatus(launch.status);
}

/**
 * A paused or abandoned launch should stop generating work -- no artifact nudges,
 * no Slack App Home rows. Only an explicit override can reach either state, so
 * this never fires on a launch that is merely running late.
 */
export function isLaunchWorkSuspended(
  launch: LaunchForStatus,
  today: Date = new Date()
): boolean {
  return isManualOnlyLaunchStatus(effectiveLaunchStatus(launch, today));
}

export interface LaunchStatusView {
  /** What users see. */
  status: LaunchStatus;
  /** The pinned value, or null when the launch is on autopilot. */
  status_override: LaunchStatus | null;
  /** What the calendar says, whether or not an override is hiding it. */
  computed_status: ComputedLaunchStatus;
}

/**
 * Everything an API response needs to render the status control: the effective
 * value, whether it is pinned, and what clearing the pin would fall back to.
 */
export function launchStatusView(
  launch: LaunchForStatus,
  today: Date = new Date()
): LaunchStatusView {
  const computed = computeLaunchStatus(launch, today);
  const override = isLaunchStatus(launch.status) ? launch.status : null;
  return {
    status: override ?? computed,
    status_override: override,
    computed_status: computed,
  };
}

/**
 * Merge the derived status onto a launch row read from the database, so every
 * consumer downstream reads one `status` field and never the raw override.
 */
export function withLaunchStatus<T extends LaunchForStatus>(
  launch: T,
  today: Date = new Date()
): T & LaunchStatusView {
  return { ...launch, ...launchStatusView(launch, today) };
}
