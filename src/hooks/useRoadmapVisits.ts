'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

export type RoadmapVisitPage = 'snapshot' | 'rewind';

export interface RoadmapVisitorRow {
  id: string;
  app_user_id: string;
  snapshot_date: string;
  page: RoadmapVisitPage;
  first_visited_at: string;
  last_visited_at: string;
  visit_count: number;
  app_user: {
    id: string;
    email: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    roles: string[] | null;
  } | null;
}

/**
 * Fire-and-forget visit tracking. POSTs to `/api/roadmap/visits` once
 * per mount (and again if the snapshotDate or page changes), but only
 * when `enabled` is true — callers should pass `enabled = isLatest`
 * so historical-date scrubbing doesn't bloat counts on old snapshots.
 *
 * Failures are silent: tracking should never affect the user experience.
 */
export function useTrackRoadmapVisit(
  snapshotDate: string | null | undefined,
  page: RoadmapVisitPage,
  enabled: boolean,
) {
  // Guard against double-firing under React Strict Mode in dev and
  // against the same (date, page) pair being recorded twice when the
  // component re-renders with the same props.
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !snapshotDate) return;
    const key = `${page}::${snapshotDate}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    void fetch('/api/roadmap/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ snapshotDate, page }),
    }).catch(() => {
      // Silently ignore — tracking is best-effort.
    });
  }, [snapshotDate, page, enabled]);
}

/**
 * Read all visit rows for a (snapshot_date, page) pair so the popover
 * can show totals, group by role, and list recent visitors. Polls
 * every 60s while the popover is the focused tab so a freshly-tracked
 * visit shows up without a manual refresh.
 */
export function useRoadmapVisitStats(
  snapshotDate: string | null | undefined,
  page: RoadmapVisitPage,
) {
  return useQuery({
    queryKey: ['roadmap-visits', page, snapshotDate],
    enabled: Boolean(snapshotDate),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<RoadmapVisitorRow[]> => {
      if (!snapshotDate) return [];
      const params = new URLSearchParams({ snapshotDate, page });
      const res = await fetch(`/api/roadmap/visits?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { visits?: RoadmapVisitorRow[] };
      return data.visits ?? [];
    },
  });
}

/** Display name for a visitor row, falling back through name → first/last → email. */
export function formatVisitorName(visitor: RoadmapVisitorRow): string {
  const u = visitor.app_user;
  if (!u) return 'Unknown user';
  if (u.name && u.name.trim()) return u.name.trim();
  const composed = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  return u.email || 'Unknown user';
}

/** Primary role to bucket a visitor under. Picks the highest-signal role. */
const ROLE_PRIORITY = [
  'CPO',
  'PRODUCT_OPS',
  'PM',
  'PMM',
  'PRODUCT',
  'ENG',
  'SECURITY',
  'CSM',
  'IMPL',
  'SUPPORT',
  'LEARNING',
  'SALES',
  'REV_OPS',
  'SUPERADMIN',
  'OTHER',
];

export function pickPrimaryRole(roles: string[] | null | undefined): string {
  if (!roles || roles.length === 0) return 'Other';
  const upper = roles.map((r) => r.toUpperCase());
  for (const r of ROLE_PRIORITY) {
    if (upper.includes(r)) return r;
  }
  return upper[0];
}
