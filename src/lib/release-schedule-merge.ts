import { toDateOnlyString } from '@/lib/date-utils';
import type { ReleaseScheduleDateRow } from '@/lib/epic-ga-date';

/** Client-safe release schedule row shape (no server imports). */
export type ReleaseScheduleRow = ReleaseScheduleDateRow & {
  id?: number;
  archived?: boolean;
  aha_epic_count?: number | null;
};

export type ReleaseSchedulePatch = {
  release_name: string;
  launch_date?: string | null;
  cohort2_date?: string | null;
};

/** Apply date patches onto existing rows (used after Aha release-dates fetch). */
export function mergeReleaseScheduleRows(
  prev: ReleaseScheduleRow[],
  patches: ReleaseSchedulePatch[]
): ReleaseScheduleRow[] {
  const patchMap = new Map(patches.map((p) => [p.release_name, p]));
  return prev.map((row) => {
    const patch = patchMap.get(row.release_name);
    if (!patch) return row;
    const launch =
      patch.launch_date != null && patch.launch_date !== ''
        ? (toDateOnlyString(patch.launch_date) ?? patch.launch_date)
        : row.launch_date;
    const cohort2 =
      patch.cohort2_date != null && patch.cohort2_date !== ''
        ? (toDateOnlyString(patch.cohort2_date) ?? patch.cohort2_date)
        : row.cohort2_date;
    return { ...row, launch_date: launch, cohort2_date: cohort2 };
  });
}

/**
 * Merge a fresh GET /api/releases payload into client state without wiping dates
 * that were already present (avoids race: SSR had dates, slower refetch returned nulls).
 */
export function mergeReleaseScheduleApiResponse(
  prev: ReleaseScheduleRow[],
  incoming: ReleaseScheduleRow[]
): ReleaseScheduleRow[] {
  const prevByName = new Map(prev.map((r) => [r.release_name, r]));
  return incoming.map((inc) => {
    const old = prevByName.get(inc.release_name);
    if (!old) return inc;
    return {
      ...inc,
      launch_date: inc.launch_date ?? old.launch_date,
      cohort2_date: inc.cohort2_date ?? old.cohort2_date,
    };
  });
}

/** Slim rows for releaseDateMap (launch_date only). */
export function toReleaseScheduleSummary(
  rows: ReleaseScheduleRow[]
): Array<{ release_name: string; launch_date: string | null; archived?: boolean; aha_epic_count?: number | null }> {
  return rows.map(({ release_name, launch_date, archived, aha_epic_count }) => ({
    release_name,
    launch_date,
    archived,
    aha_epic_count,
  }));
}
