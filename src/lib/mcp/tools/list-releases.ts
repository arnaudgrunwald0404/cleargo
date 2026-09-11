/**
 * Tool: list-releases
 *
 * The active release train — the GA dates every criterion deadline is derived
 * from. Useful on its own ("when does 2026.3 ship") and as the vocabulary for
 * find-epics' releaseName filter.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveReleaseScheduleRows } from '@/lib/release-schedule';

export async function listReleases(
  supabase: SupabaseClient,
  _args: Record<string, unknown>
): Promise<unknown> {
  const rows = await getActiveReleaseScheduleRows(supabase);

  return {
    releases: rows.map((r) => ({
      name: r.release_name,
      launchDate: r.launch_date ?? null,
      cohort2Date: (r as { cohort2_date?: string | null }).cohort2_date ?? null,
      epicCount: (r as { aha_epic_count?: number | null }).aha_epic_count ?? null,
    })),
    count: rows.length,
  };
}
