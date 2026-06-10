import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { getActiveReleaseScheduleRows } from '@/lib/release-schedule';
import { getReleaseStagesForTimeline } from '@/lib/release-stages-server';
import { getEpicGtmAccessDateYmd } from '@/lib/epic-rollout-dates';
import {
  diffCalendarDaysBetweenYmd,
  getCalendarDateStringInTimeZone,
} from '@/lib/date-utils';
import { getSettings } from '@/lib/settings-db';
import { defaults } from '@/lib/settings';
import type { Epic } from '@/types/epics';

export const GTM_ACCESS_NUDGE_TYPE = 'gtm_access_nudge';
export const GTM_ACCESS_WEEKLY_DEDUPE_DAYS = 7;
export const GTM_ACCESS_MAX_LIFETIME_NUDGES = 4;
/** Stop nudging when planned date is more than this many days in the past (no actual date set). */
export const GTM_ACCESS_STALE_CUTOFF_DAYS = 14;

export type GtmAccessPendingEpic = {
  epicId: string;
  epicName: string;
  plannedGtmYmd: string;
  daysSincePlanned: number;
  ownerEmail: string;
  actualGtmAccessDate: string | null;
};

type EpicRow = Pick<
  Epic,
  | 'id'
  | 'name'
  | 'owner_email'
  | 'owner_id'
  | 'pod'
  | 'aha_fields'
  | 'target_launch_date'
  | 'gtm_access_confirmed'
  | 'gtm_access_na'
  | 'actual_gtm_access_date'
  | 'archived'
  | 'status'
>;

/** Resolve PM email for GTM notifications (pod mapping wins over stored owner_email). */
export function resolveEpicPmEmail(
  epic: Pick<Epic, 'owner_email' | 'pod' | 'aha_fields'>,
  podMapping: Record<string, string>
): string | null {
  const pod =
    epic.pod ||
    (epic.aha_fields as { custom_fields?: { dev_backlog_pod?: string } } | null)?.custom_fields
      ?.dev_backlog_pod ||
    null;

  if (pod) {
    if (podMapping[pod]) return podMapping[pod].trim().toLowerCase();
    const podLower = pod.toLowerCase();
    const key = Object.keys(podMapping).find((k) => k.toLowerCase() === podLower);
    if (key && podMapping[key]) return podMapping[key].trim().toLowerCase();
  }

  if (epic.owner_email?.trim()) return epic.owner_email.trim().toLowerCase();

  const ahaEmail = (epic.aha_fields as { standard_fields?: { assigned_to_user?: { email?: string } } } | null)
    ?.standard_fields?.assigned_to_user?.email;
  if (ahaEmail?.trim()) return ahaEmail.trim().toLowerCase();

  return null;
}

function isActionableGtmPending(
  epic: EpicRow,
  plannedGtmYmd: string,
  todayYmd: string
): boolean {
  if (epic.gtm_access_confirmed === true || epic.gtm_access_na === true) return false;
  if (epic.archived === true) return false;
  if (epic.status === 'Cancelled') return false;

  const daysUntil = diffCalendarDaysBetweenYmd(plannedGtmYmd, todayYmd);
  if (daysUntil == null || daysUntil > 0) return false;

  const daysSince = -daysUntil;
  if (!epic.actual_gtm_access_date && daysSince > GTM_ACCESS_STALE_CUTOFF_DAYS) {
    return false;
  }

  return true;
}

export async function getGtmAccessPendingEpics(
  client?: SupabaseClient,
  options?: { ownerEmail?: string }
): Promise<GtmAccessPendingEpic[]> {
  const supabase = client ?? createAdminClient();
  const settings = await getSettings(supabase);
  const timeZone = settings.timezone || defaults.timezone;
  const todayYmd = getCalendarDateStringInTimeZone(timeZone);
  const podMapping = settings.pod_product_manager_mapping || {};

  const [epicsResult, releaseSchedule, stages] = await Promise.all([
    supabase
      .from('epic')
      .select(
        'id, name, owner_email, owner_id, pod, aha_fields, target_launch_date, gtm_access_confirmed, gtm_access_na, actual_gtm_access_date, archived, status'
      )
      .or('archived.is.null,archived.eq.false')
      .neq('status', 'Cancelled')
      .eq('gtm_access_confirmed', false),
    getActiveReleaseScheduleRows(),
    getReleaseStagesForTimeline(),
  ]);

  const epics = (epicsResult.data || []) as EpicRow[];
  const ownerFilter = options?.ownerEmail?.trim().toLowerCase();

  const pending: GtmAccessPendingEpic[] = [];

  for (const epic of epics) {
    const ownerEmail = resolveEpicPmEmail(epic, podMapping);
    if (!ownerEmail) continue;
    if (ownerFilter && ownerEmail !== ownerFilter) continue;

    const plannedGtmYmd = getEpicGtmAccessDateYmd(
      epic as Epic,
      stages.releaseSchedule,
      stages.uiRollout,
      { releaseTrainDateYmd: undefined }
    );
    if (!plannedGtmYmd) continue;
    if (!isActionableGtmPending(epic, plannedGtmYmd, todayYmd)) continue;

    const daysUntil = diffCalendarDaysBetweenYmd(plannedGtmYmd, todayYmd);
    const daysSincePlanned = daysUntil == null ? 0 : -daysUntil;

    pending.push({
      epicId: epic.id,
      epicName: epic.name,
      plannedGtmYmd,
      daysSincePlanned,
      ownerEmail,
      actualGtmAccessDate: epic.actual_gtm_access_date ?? null,
    });
  }

  pending.sort((a, b) => b.daysSincePlanned - a.daysSincePlanned);
  return pending;
}

export async function wasGtmNudgeSentRecently(
  ownerEmail: string,
  withinDays: number = GTM_ACCESS_WEEKLY_DEDUPE_DAYS
): Promise<boolean> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: user } = await supabase
    .from('app_user')
    .select('id')
    .ilike('email', ownerEmail)
    .maybeSingle();

  let query = supabase
    .from('notification_log')
    .select('id')
    .eq('type', GTM_ACCESS_NUDGE_TYPE)
    .eq('status', 'sent')
    .gte('sent_at', cutoff)
    .limit(1);

  if (user?.id) {
    query = query.eq('user_id', user.id);
  } else {
    query = query.filter('payload->>owner_email', 'eq', ownerEmail);
  }

  const { data } = await query.maybeSingle();
  return !!data;
}

export async function countGtmNudgesForEpic(epicId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('type', GTM_ACCESS_NUDGE_TYPE)
    .eq('epic_id', epicId)
    .eq('status', 'sent');

  if (error) return 0;
  return count ?? 0;
}

export async function getGtmAccessPendingByOwner(): Promise<Map<string, GtmAccessPendingEpic[]>> {
  const pending = await getGtmAccessPendingEpics();
  const byOwner = new Map<string, GtmAccessPendingEpic[]>();

  for (const item of pending) {
    const list = byOwner.get(item.ownerEmail) ?? [];
    list.push(item);
    byOwner.set(item.ownerEmail, list);
  }

  return byOwner;
}
