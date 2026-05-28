import { createClient } from '@/lib/supabase/server';

export type ReleaseStageTimelineRow = {
  id: number;
  name: string;
  sort_order: number;
  duration_days: number | null;
  details: string | null;
  scope?: string;
  level_durations?: Record<string, { min_days: number; max_days: number }> | null;
  is_gate?: boolean;
  stage_type?: 'phase' | 'milestone';
};

export type ReleaseStagesForTimeline = {
  releaseSchedule: ReleaseStageTimelineRow[];
  uiRollout: ReleaseStageTimelineRow[];
};

/** Load release stage config for epics list / timeline (SSR-friendly). */
export async function getReleaseStagesForTimeline(): Promise<ReleaseStagesForTimeline> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('release_stages')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error || !data?.length) {
    return { releaseSchedule: [], uiRollout: [] };
  }

  const rows = data as ReleaseStageTimelineRow[];
  const hasScope = rows.some((r) => r.scope != null && String(r.scope).trim() !== '');
  const releaseSchedule = hasScope
    ? rows.filter((r) => r.scope === 'release_schedule')
  : rows;
  const uiRollout = hasScope ? rows.filter((r) => r.scope === 'ui_rollout') : [];

  return { releaseSchedule, uiRollout };
}
