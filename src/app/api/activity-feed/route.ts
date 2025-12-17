import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface ActivityFeedItem {
  id: string;
  type: 'criterion_change' | 'epic_added' | 'release_updated' | 'feedback_added';
  title: string;
  description: string;
  timestamp: string;
  actor?: {
    name: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
  };
  entity_type?: string;
  entity_id?: string;
}

function firstItem<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function normalizeActor(actor: any): ActivityFeedItem['actor'] | undefined {
  const candidate = firstItem(actor);
  if (!candidate) return undefined;

  const email = candidate.email ?? '';
  if (!email) return undefined;

  const name = candidate.name ?? candidate.full_name ?? email;

  return {
    name,
    email,
    first_name: candidate.first_name ?? null,
    last_name: candidate.last_name ?? null,
    avatar_url: candidate.avatar_url ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');

    // Fetch recent audit log entries
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_log')
      .select(
        `
                id,
                entity_type,
                entity_id,
                taken_at,
                json_diff,
                actor:actor_id (
                    name,
                    email,
                    first_name,
                    last_name,
                    avatar_url
                )
            `
      )
      .order('taken_at', { ascending: false })
      .limit(limit * 2);

    if (auditError) throw auditError;

    // Fetch recent feedback
    const { data: feedbackItems, error: feedbackError } = await supabase
      .from('feedback')
      .select(
        `
                id,
                feedback_text,
                source,
                created_at,
                launch:launch_id (
                    id,
                    name
                ),
                attributed_to:attributed_to_id (
                    name,
                    email,
                    first_name,
                    last_name,
                    avatar_url
                )
            `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (feedbackError) console.warn('Failed to fetch feedback:', feedbackError);

    // Transform audit logs into activity feed items
    const activities: ActivityFeedItem[] = [];

    for (const log of auditLogs || []) {
      let activity: ActivityFeedItem | null = null;

      // Parse different types of activities
      if (
        log.entity_type === 'criterion' ||
        log.entity_type === 'launch_criterion_status' ||
        log.entity_type === 'epic_criterion_status'
      ) {
        // Criteria status change
        const diff = log.json_diff;
        const statusChange = diff?.status || diff?.readiness_status;

        if (statusChange) {
          activity = {
            id: log.id,
            type: 'criterion_change',
            title: 'Criterion Updated',
            description: `Status changed from "${statusChange.old || 'N/A'}" to "${statusChange.new || 'N/A'}"`,
            timestamp: log.taken_at,
            actor: normalizeActor(log.actor),
            entity_type: log.entity_type,
            entity_id: log.entity_id,
          };
        }
      } else if (log.entity_type === 'launch' || log.entity_type === 'epic') {
        const diff = log.json_diff;

        // Check if it's a new epic/launch (created event)
        if (diff && Object.keys(diff).length > 5) {
          activity = {
            id: log.id,
            type: 'epic_added',
            title: log.entity_type === 'epic' ? 'New Epic Created' : 'New Launch Created',
            description: diff.name?.new || diff.title?.new || 'A new item has been added',
            timestamp: log.taken_at,
            actor: normalizeActor(log.actor),
            entity_type: log.entity_type,
            entity_id: log.entity_id,
          };
        } else if (diff?.release_id || diff?.release) {
          // Release assignment change
          activity = {
            id: log.id,
            type: 'release_updated',
            title: 'Release Updated',
            description: `${log.entity_type === 'epic' ? 'Epic' : 'Launch'} assigned to release`,
            timestamp: log.taken_at,
            actor: normalizeActor(log.actor),
            entity_type: log.entity_type,
            entity_id: log.entity_id,
          };
        }
      }

      if (activity) {
        activities.push(activity);
      }

      if (activities.length >= limit) {
        break;
      }
    }

    // Add feedback activities
    for (const feedback of feedbackItems || []) {
      const launch = firstItem(feedback.launch);
      const launchName = launch?.name || 'Unknown Launch';
      const truncatedFeedback =
        feedback.feedback_text.length > 100
          ? feedback.feedback_text.substring(0, 100) + '...'
          : feedback.feedback_text;

      activities.push({
        id: feedback.id,
        type: 'feedback_added',
        title: 'Feedback Added',
        description: `${launchName}: "${truncatedFeedback}"`,
        timestamp: feedback.created_at,
        actor: normalizeActor(feedback.attributed_to),
        entity_type: 'feedback',
        entity_id: feedback.id,
      });

      if (activities.length >= limit) {
        break;
      }
    }

    // Sort all activities by timestamp
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Trim to limit
    const finalActivities = activities.slice(0, limit);

    return NextResponse.json({ activities: finalActivities });
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    return NextResponse.json({ error: 'Failed to fetch activity feed' }, { status: 500 });
  }
}
