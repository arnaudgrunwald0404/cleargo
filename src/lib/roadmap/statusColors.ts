/**
 * Maps an Aha! status string to a Mantine color name + visual family.
 * Ported from RRV's `getStatusColor` in src/pages/ThisWeek.tsx, but
 * returns Mantine color tokens rather than Tailwind classes so the
 * existing ClearGo `Badge color="..."` API keeps working.
 */

export type StatusFamily = 'planning' | 'in-progress' | 'released' | 'cancelled' | 'unknown';

export interface StatusColorInfo {
  family: StatusFamily;
  /** Mantine color name (e.g. "blue", "green") */
  color: string;
  /** Light-variant background CSS for inline styles. */
  bg: string;
  /** Border / outline color CSS for inline styles. */
  border: string;
  /** Foreground color CSS for inline styles. */
  fg: string;
}

const PLANNING: StatusColorInfo = {
  family: 'planning',
  color: 'blue',
  bg: 'rgba(59, 130, 246, 0.08)',
  border: 'rgba(59, 130, 246, 0.25)',
  fg: 'rgb(37, 99, 235)',
};

const IN_PROGRESS: StatusColorInfo = {
  family: 'in-progress',
  color: 'violet',
  bg: 'rgba(139, 92, 246, 0.08)',
  border: 'rgba(139, 92, 246, 0.25)',
  fg: 'rgb(124, 58, 237)',
};

const RELEASED: StatusColorInfo = {
  family: 'released',
  color: 'teal',
  bg: 'rgba(16, 185, 129, 0.08)',
  border: 'rgba(16, 185, 129, 0.25)',
  fg: 'rgb(5, 150, 105)',
};

const CANCELLED: StatusColorInfo = {
  family: 'cancelled',
  color: 'gray',
  bg: 'rgba(100, 116, 139, 0.08)',
  border: 'rgba(100, 116, 139, 0.25)',
  fg: 'rgb(71, 85, 105)',
};

const UNKNOWN: StatusColorInfo = {
  family: 'unknown',
  color: 'gray',
  bg: 'transparent',
  border: 'var(--color-gray-200)',
  fg: 'var(--color-gray-700)',
};

/**
 * Classify any Aha! status string into one of the four families used in
 * RRV's snapshot table. Match order matters: we check `released` first so
 * "Released to GTM Team" / "Complete/Done (GA)" / "Released to Cohort 1"
 * win over "in progress" rules.
 */
export function getStatusColorInfo(status: string | null | undefined): StatusColorInfo {
  const s = (status ?? '').toLowerCase();
  if (!s) return UNKNOWN;

  if (
    s.includes('cancelled') ||
    s.includes('will not') ||
    s.includes('wont do') ||
    s.includes("won't do")
  ) {
    return CANCELLED;
  }

  if (
    s.includes('complete') ||
    s.includes('done') ||
    s.includes('released') ||
    s.includes('gtm') ||
    s.includes('cohort') ||
    s.includes('ga') ||
    s.includes('feature complete')
  ) {
    return RELEASED;
  }

  if (
    s.includes('development') ||
    s.includes('testing') ||
    s.includes('in progress') ||
    s.includes('story mapping') ||
    s.includes('pod planning')
  ) {
    return IN_PROGRESS;
  }

  if (
    s.includes('not started') ||
    s.includes('research') ||
    s.includes('planning') ||
    s.includes('n+1') ||
    s.includes('discovery')
  ) {
    return PLANNING;
  }

  return UNKNOWN;
}
