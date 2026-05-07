'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RoadmapComparison } from '@/types/roadmap';
import { cleanEpicDescriptionForAi } from '@/lib/roadmap/aiCardDescriptions';
import { getDisplayName } from '@/lib/roadmap/displayNames';

export interface CardDescriptionsResult {
  descriptions: Record<string, string>;
  isLoading: boolean;
  isError: boolean;
  /** True when every requested key was already in DB for this snapshot (no AI call). */
  fromCache?: boolean;
}

/**
 * Loads AI blurbs for snapshot epics (cached per `snapshot_date` + `aha_key`).
 * Pass `enabled: false` while parent data is still loading.
 */
export function useCardDescriptions(
  comparisons: RoadmapComparison[],
  snapshotDate: string | null | undefined,
  enabled: boolean,
): CardDescriptionsResult {
  const normalizedDate = snapshotDate?.split('T')[0] ?? null;

  const payload = useMemo(() => {
    const seen = new Set<string>();
    const items: { ahaKey: string; ahaName: string; ahaDescription: string }[] = [];
    for (const c of comparisons) {
      const k = c.latest.aha_key;
      if (!k || seen.has(k)) continue;
      seen.add(k);
      items.push({
        ahaKey: k,
        ahaName: getDisplayName(c.latest),
        ahaDescription: cleanEpicDescriptionForAi(c.latest.aha_description),
      });
    }
    items.sort((a, b) => a.ahaKey.localeCompare(b.ahaKey));
    return {
      items,
      keySig: items.map((i) => i.ahaKey).join('\0'),
    };
  }, [comparisons]);

  const query = useQuery({
    queryKey: ['roadmap-card-descriptions', normalizedDate, payload.keySig],
    queryFn: async () => {
      const res = await fetch('/api/roadmap/card-descriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotDate: normalizedDate,
          items: payload.items,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        descriptions?: Record<string, string>;
        fromCache?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? res.statusText);
      }
      return {
        descriptions: json.descriptions ?? {},
        fromCache: Boolean(json.fromCache),
      };
    },
    enabled: Boolean(enabled && normalizedDate && payload.items.length > 0),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    descriptions: query.data?.descriptions ?? {},
    isLoading: query.isLoading || query.isFetching,
    isError: query.isError,
    fromCache: query.data?.fromCache,
  };
}
