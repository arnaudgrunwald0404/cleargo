/**
 * Tool: list-roadmap-snapshots
 *
 * Which weekly roadmap snapshots exist. Every other roadmap tool takes an
 * asOfDate, and this is where a valid one comes from -- guessing a date that has
 * no snapshot returns an empty result that looks like "nothing moved".
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listRoadmapSnapshots(
  supabase: SupabaseClient,
  _args: Record<string, unknown>
): Promise<unknown> {
  const { data, error } = await supabase
    .from('roadmap_snapshot')
    .select('snapshot_date, created_at')
    .order('snapshot_date', { ascending: false });

  if (error) return { error: error.message };

  const byDate = new Map<string, string>();
  for (const row of (data ?? []) as { snapshot_date: string; created_at: string }[]) {
    if (!row.snapshot_date) continue;
    if (!byDate.has(row.snapshot_date)) {
      byDate.set(row.snapshot_date, row.created_at || row.snapshot_date);
    }
  }

  const snapshots = Array.from(byDate.entries())
    .map(([date, timestamp]) => ({ date, timestamp }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { snapshots, count: snapshots.length };
}
