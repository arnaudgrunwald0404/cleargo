import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toDateOnlyString } from '@/lib/date-utils';
import type { ReleaseScheduleRow } from '@/lib/release-schedule-merge';

export type { ReleaseScheduleRow } from '@/lib/release-schedule-merge';

/** Upsert a release-train row; supports composite `(release_name, context)` or legacy `release_name` unique. */
export async function upsertReleaseScheduleRow(
  supabase: SupabaseClient,
  payload: {
    release_name: string;
    launch_date: string | null;
    cohort2_date?: string | null;
  }
): Promise<{ error: { message: string; code?: string } | null }> {
  const row: Record<string, unknown> = {
    release_name: payload.release_name,
    launch_date: payload.launch_date
      ? (toDateOnlyString(payload.launch_date) ?? payload.launch_date)
      : null,
    context: 'release',
    updated_at: new Date().toISOString(),
  };
  if (payload.cohort2_date) {
    row.cohort2_date = toDateOnlyString(payload.cohort2_date) ?? payload.cohort2_date;
  }

  const attempt1 = await supabase
    .from('release_schedule')
    .upsert(row, { onConflict: 'release_name,context' });

  if (attempt1.error?.code === '42P10') {
    const { context: _ctx, ...legacyRow } = row;
    const attempt2 = await supabase
      .from('release_schedule')
      .upsert(legacyRow, { onConflict: 'release_name' });
    return { error: attempt2.error };
  }

  return { error: attempt1.error };
}

/** Active release-train rows (`context = release`, not archived) for GA dates and epics UI. */
export async function getActiveReleaseScheduleRows(): Promise<ReleaseScheduleRow[]> {
  const supabase = createClient();

  let query = supabase
    .from('release_schedule')
    .select('id, release_name, launch_date, cohort2_date, archived, aha_epic_count')
    .eq('context', 'release')
    .eq('archived', false)
    .order('launch_date', { ascending: true });

  let { data, error } = await query;

  if (error?.message?.includes('does not exist')) {
    const retry = await supabase
      .from('release_schedule')
      .select('id, release_name, launch_date, cohort2_date, archived, aha_epic_count')
      .eq('archived', false)
      .order('launch_date', { ascending: true });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('[getActiveReleaseScheduleRows]', error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    release_name: r.release_name,
    launch_date: toDateOnlyString(r.launch_date) ?? r.launch_date,
    cohort2_date: r.cohort2_date ? (toDateOnlyString(r.cohort2_date) ?? r.cohort2_date) : null,
    archived: r.archived,
    aha_epic_count: r.aha_epic_count,
  }));
}
