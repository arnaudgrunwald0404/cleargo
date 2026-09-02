/**
 * Story Brief notification planner.
 *
 * Discovers epics with incomplete Story Briefs in active launches, assesses
 * completeness, determines whether it's time to notify based on cadence,
 * and returns a list of notifications to send.
 *
 * Cadence scales with proximity to launch:
 *   30+ days: weekly
 *   14-29 days: 2x/week
 *   7-13 days: every other day
 *   0-6 days: daily
 */

import { createAdminClient } from '@/lib/supabase/server';
import { assessCompleteness, type BriefCompleteness } from '@/lib/story-brief/completeness';
import type { StoryBriefContent } from '@/lib/story-brief/generator';
import type { StoryBriefReviewMeta } from '@/lib/slack/templates/story-brief-review';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface StoryBriefNotification {
  epicId: string;
  epicName: string;
  pmEmail: string;
  message: StoryBriefReviewMeta;
}

export interface AssessmentResult {
  epicId: string;
  epicName: string;
  pmEmail: string;
  completeness: BriefCompleteness;
  daysToLaunch: number | null;
  shouldNotify: boolean;
  reason: string;
}

// ── Cadence logic ──────────────────────────────────────────────────────────────

/**
 * Return the cadence in hours based on days until launch.
 */
export function getCadenceHours(daysToLaunch: number | null): number {
  if (daysToLaunch === null || daysToLaunch >= 30) return 168; // weekly (7 * 24)
  if (daysToLaunch >= 14) return 84; // 2x/week
  if (daysToLaunch >= 7) return 48; // every other day
  return 24; // daily
}

/**
 * Check whether enough time has passed since the last notification to send again.
 */
export function shouldNotifyNow(
  lastNotifiedAt: string | null | undefined,
  cadenceHours: number
): boolean {
  if (!lastNotifiedAt) return true;
  const last = new Date(lastNotifiedAt).getTime();
  const elapsed = (Date.now() - last) / 1000 / 3600; // hours
  return elapsed >= cadenceHours;
}

// ── Query helpers ──────────────────────────────────────────────────────────────

/**
 * Find active launches (not archived, not past launch date by more than 30 days)
 * and their epics that have incomplete story briefs.
 */
async function findActiveLaunchEpics() {
  const supabase = createAdminClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get active launches
  const { data: launches, error: launchesError } = await supabase
    .from('launch')
    .select('id, name, target_launch_date')
    .eq('archived', false)
    .gte('target_launch_date', thirtyDaysAgo.toISOString());

  if (launchesError || !launches) {
    console.error('Failed to fetch active launches:', launchesError);
    return [];
  }

  if (launches.length === 0) return [];

  // Get launch_epic join records
  const { data: launchEpics, error: leError } = await supabase
    .from('launch_epic')
    .select('launch_id, epic_id')
    .in('launch_id', launches.map((l) => l.id));

  if (leError || !launchEpics) {
    console.error('Failed to fetch launch_epics:', leError);
    return [];
  }

  // Get epics with PM owner
  const epicIds = launchEpics.map((le) => le.epic_id);
  const { data: epics, error: epicsError } = await supabase
    .from('epic')
    .select('id, name, pm_owner_email')
    .in('id', epicIds);

  if (epicsError || !epics) {
    console.error('Failed to fetch epics:', epicsError);
    return [];
  }

  // Build a map: epic_id -> { launch, epic }
  const launchMap = new Map(launches.map((l) => [l.id, l]));
  const results: Array<{
    launchId: string;
    launchName: string;
    targetLaunchDate: string | null;
    epicId: string;
    epicName: string;
    pmEmail: string;
  }> = [];

  for (const le of launchEpics) {
    const launch = launchMap.get(le.launch_id);
    const epic = epics.find((e) => e.id === le.epic_id);
    if (!launch || !epic || !epic.pm_owner_email) continue;
    results.push({
      launchId: launch.id,
      launchName: launch.name,
      targetLaunchDate: launch.target_launch_date,
      epicId: epic.id,
      epicName: epic.name,
      pmEmail: epic.pm_owner_email,
    });
  }

  return results;
}

/**
 * Fetch the notification state for an epic.
 */
async function getNotificationState(epicId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('story_brief_notification_state')
    .select('*')
    .eq('epic_id', epicId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch notification state for epic ${epicId}:`, error);
  }
  return data;
}

/**
 * Upsert the notification state for an epic.
 */
async function updateNotificationState(
  epicId: string,
  completeness: BriefCompleteness,
  notified: boolean
) {
  const supabase = createAdminClient();

  const existing = await getNotificationState(epicId);

  const now = new Date().toISOString();
  const base = {
    epic_id: epicId,
    last_assessed_at: now,
    last_completeness_score: completeness.score,
    complete_sections: completeness.completeSections,
    total_sections: completeness.sectionCount,
    last_gaps: JSON.stringify(completeness.gaps),
    updated_at: now,
  };

  if (existing) {
    const updateRow = {
      ...base,
      last_notified_at: notified ? now : existing.last_notified_at,
      notification_count: notified
        ? (existing.notification_count ?? 0) + 1
        : existing.notification_count,
    };
    const { error } = await supabase
      .from('story_brief_notification_state')
      .update(updateRow)
      .eq('id', existing.id);

    if (error) {
      console.error(`Failed to update notification state for epic ${epicId}:`, error);
    }
  } else {
    const insertRow = {
      ...base,
      last_notified_at: notified ? now : null,
      notification_count: notified ? 1 : 0,
    };
    const { error } = await supabase
      .from('story_brief_notification_state')
      .insert(insertRow);

    if (error) {
      console.error(`Failed to insert notification state for epic ${epicId}:`, error);
    }
  }
}

/**
 * Fetch the story brief content for an epic.
 */
async function getEpicStoryBrief(epicId: string): Promise<StoryBriefContent | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('epic_story_brief')
    .select('content')
    .eq('epic_id', epicId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch story brief for epic ${epicId}:`, error);
    return null;
  }

  return data?.content ?? null;
}

// ── Main planner ───────────────────────────────────────────────────────────────

/**
 * Plan which notifications to send.
 * Returns a list of notifications and assessment results for logging.
 */
export async function planStoryBriefNotifications(): Promise<{
  notifications: StoryBriefNotification[];
  assessments: AssessmentResult[];
}> {
  const launchEpics = await findActiveLaunchEpics();
  const notifications: StoryBriefNotification[] = [];
  const assessments: AssessmentResult[] = [];

  for (const { launchId, launchName, targetLaunchDate, epicId, epicName, pmEmail } of launchEpics) {
    // Fetch and assess the story brief
    const brief = await getEpicStoryBrief(epicId);
    const completeness = assessCompleteness(brief);

    // If the brief is complete, skip
    if (completeness.complete) {
      assessments.push({
        epicId,
        epicName,
        pmEmail,
        completeness,
        daysToLaunch: daysUntil(targetLaunchDate),
        shouldNotify: false,
        reason: 'Brief is complete',
      });

      // Still update the assessment state
      await updateNotificationState(epicId, completeness, false);
      continue;
    }

    // Calculate days to launch
    const daysToLaunch = daysUntil(targetLaunchDate);
    const cadenceHours = getCadenceHours(daysToLaunch);

    // Check notification state
    const state = await getNotificationState(epicId);
    const notifyNow = shouldNotifyNow(state?.last_notified_at, cadenceHours);

    if (!notifyNow) {
      const elapsed = state?.last_notified_at
        ? Math.round((Date.now() - new Date(state.last_notified_at).getTime()) / 3600 / 1000)
        : null;
      assessments.push({
        epicId,
        epicName,
        pmEmail,
        completeness,
        daysToLaunch,
        shouldNotify: false,
        reason: `Cadence not reached (${elapsed ?? '?'}h elapsed of ${cadenceHours}h needed)`,
      });

      await updateNotificationState(epicId, completeness, false);
      continue;
    }

    // Build the notification
    const notificationCount = (state?.notification_count ?? 0) + 1;

    const meta: StoryBriefReviewMeta = {
      epic_id: epicId,
      epic_name: epicName,
      launch_name: launchName,
      launch_id: launchId,
      daysToLaunch,
      completenessScore: completeness.score,
      completeSections: completeness.completeSections,
      totalSections: completeness.sectionCount,
      gaps: completeness.gaps,
      notificationCount,
    };

    const { buildStoryBriefReviewMessage } = await import('@/lib/slack/templates/story-brief-review');
    const message = buildStoryBriefReviewMessage(meta);

    notifications.push({
      epicId,
      epicName,
      pmEmail,
      message: meta,
    });

    assessments.push({
      epicId,
      epicName,
      pmEmail,
      completeness,
      daysToLaunch,
      shouldNotify: true,
      reason: `Cadence: every ${cadenceHours}h`,
    });

    await updateNotificationState(epicId, completeness, true);
  }

  return { notifications, assessments };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const launch = new Date(dateStr);
  const now = new Date();
  const diffMs = launch.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}