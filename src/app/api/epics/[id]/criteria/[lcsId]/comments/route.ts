import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { sendSlackNotification } from '@/lib/slack/notifications';

export const dynamic = 'force-dynamic';

type NotifyReason = 'mention' | 'thread_reply' | 'owner' | 'orphan_watch';
const REASON_RANK: Record<NotifyReason, number> = {
  mention: 3,
  thread_reply: 2,
  owner: 1,
  orphan_watch: 0,
};

// GET - Fetch all comments for a criterion
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
  try {
    const { id: epicId, lcsId } = await params;
    
    const supabase = createClient();
    
    // Authenticate user (supports both Supabase auth and magic link)
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle virtual IDs - they don't have status rows and can't have comments
    if (lcsId.startsWith('virtual-')) {
      return NextResponse.json([]);
    }

    // Fetch comments with user info
    const { data: comments, error } = await supabase
      .from('criterion_comment')
      .select(`
        id,
        comment_text,
        created_at,
        updated_at,
        status_at_comment,
        previous_status,
        mentioned_user_ids,
        created_by:app_user!criterion_comment_created_by_fkey(email, first_name, last_name)
      `)
      .eq('launch_criterion_status_id', lcsId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json(comments || []);
  } catch (error: any) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST - Create a new comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
  try {
    const { id: epicId, lcsId } = await params;
    const supabase = createClient();
    
    // Authenticate user (supports both Supabase auth and magic link)
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user info
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id, first_name, last_name, name')
      .eq('email', userEmail)
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const { comment_text, status_at_comment, previous_status, mentioned_user_ids: rawMentionedIds } = body;

    // Validate that comment has content (strip HTML tags for validation)
    const textContent = comment_text ? comment_text.replace(/<[^>]*>/g, '').trim() : '';
    if (!textContent) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
    }

    const mentionIds = Array.isArray(rawMentionedIds)
      ? [...new Set((rawMentionedIds as string[]).filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [];
    const commenterId = appUser.id;
    let validatedMentionIds: string[] = [];
    if (mentionIds.length > 0) {
      const { data: mentionUsers } = await supabase
        .from('app_user')
        .select('id')
        .in('id', mentionIds);
      const validIds = new Set((mentionUsers || []).map((u) => u.id));
      validatedMentionIds = mentionIds.filter((id) => validIds.has(id) && id !== commenterId);
    }

    // Insert comment
    const { data: comment, error } = await supabase
      .from('criterion_comment')
      .insert({
        launch_criterion_status_id: lcsId,
        comment_text: comment_text,
        created_by: appUser.id,
        status_at_comment: status_at_comment || null,
        previous_status: previous_status || null,
        mentioned_user_ids: validatedMentionIds.length > 0 ? validatedMentionIds : null,
      })
      .select()
      .single();

    if (error) throw error;

    try {
      const { data: criterionStatus, error: statusError } = await supabase
        .from('epic_criterion_status')
        .select(`
          id,
          epic:epic_id (
            id,
            name,
            owner_email,
            pod
          ),
          criterion:criterion_id (
            id,
            label
          ),
          decision_owner:decision_owner_id (
            id,
            email,
            first_name,
            last_name,
            name,
            slack_handle
          )
        `)
        .eq('id', lcsId)
        .single();

      if (statusError || !criterionStatus) return NextResponse.json(comment, { status: 201 });

      const decisionOwner = criterionStatus.decision_owner as any;
      const epic = criterionStatus.epic as any;
      const criterion = criterionStatus.criterion as any;
      const isOwner = decisionOwner?.email?.toLowerCase() === userEmail.toLowerCase();

      const currentUserName = appUser.name ||
        (appUser.first_name && appUser.last_name ? `${appUser.first_name} ${appUser.last_name}` :
          appUser.first_name || appUser.last_name || userEmail);

      const metadata = {
        epic_name: epic.name,
        epic_id: epic.id,
        criterion_label: criterion.label,
        criterion_status_id: lcsId,
        added_by_name: currentUserName,
        has_comment: true,
        has_attachment: false,
        comment_text: textContent || undefined,
      };

      const toSlackUser = (u: { id: string; email: string; first_name?: string; last_name?: string; name?: string; slack_handle?: string }) => ({
        id: u.id,
        email: u.email,
        slack_handle: u.slack_handle || undefined,
        name: u.name || (u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.first_name || u.last_name || u.email),
      });

      // Build the recipient set, tagging each with WHY they're being notified so
      // the Slack message reads differently per reason (I-3). Highest-ranked
      // reason wins if someone qualifies more than one way.
      type Recipient = { id: string; email: string; slack_handle?: string; name: string; reason: NotifyReason };
      const byId = new Map<string, Recipient>();
      const addRecipient = (u: { id: string; email: string; slack_handle?: string; name: string }, reason: NotifyReason) => {
        if (!u.id || u.id === commenterId) return;
        const existing = byId.get(u.id);
        if (existing && REASON_RANK[existing.reason] >= REASON_RANK[reason]) return;
        byId.set(u.id, { ...u, reason });
      };

      // Decision owner (lowest precedence — a plain "comment added" heads-up).
      if (decisionOwner && !isOwner) {
        addRecipient(toSlackUser(decisionOwner), 'owner');
      }

      // Thread participants: anyone who previously commented on this criterion or
      // was @-mentioned earlier in the thread hears about new replies (I-6).
      const { data: priorComments } = await supabase
        .from('criterion_comment')
        .select('created_by, mentioned_user_ids')
        .eq('launch_criterion_status_id', lcsId)
        .neq('id', comment.id);

      const isFirstComment = (priorComments || []).length === 0;

      const threadParticipantIds = new Set<string>();
      for (const pc of priorComments || []) {
        if (pc.created_by && pc.created_by !== commenterId) threadParticipantIds.add(pc.created_by);
        for (const mid of pc.mentioned_user_ids || []) {
          if (mid !== commenterId) threadParticipantIds.add(mid);
        }
      }
      if (threadParticipantIds.size > 0) {
        const { data: participantUsers } = await supabase
          .from('app_user')
          .select('id, email, first_name, last_name, name, slack_handle')
          .in('id', [...threadParticipantIds]);
        for (const u of participantUsers || []) addRecipient(toSlackUser(u), 'thread_reply');
      }

      // Direct @mentions (highest precedence).
      if (validatedMentionIds.length > 0) {
        const { data: mentionedUsers } = await supabase
          .from('app_user')
          .select('id, email, first_name, last_name, name, slack_handle')
          .in('id', validatedMentionIds);
        for (const u of mentionedUsers || []) addRecipient(toSlackUser(u), 'mention');
      }

      // I-5: a first comment with no @mention can silently die, so make sure the
      // epic owner hears about it. Scoped to the owner only — no global watchers.
      if (isFirstComment && validatedMentionIds.length === 0 && epic?.owner_email) {
        const ownerEmail = String(epic.owner_email).toLowerCase();
        if (ownerEmail !== userEmail.toLowerCase()) {
          const { data: owners } = await supabase
            .from('app_user')
            .select('id, email, first_name, last_name, name, slack_handle')
            .eq('email', ownerEmail)
            .limit(1);
          for (const u of owners || []) addRecipient(toSlackUser(u), 'orphan_watch');
        }
      }

      // Send one notification per reason group so wording matches the reason.
      const groups = new Map<NotifyReason, Recipient[]>();
      for (const r of byId.values()) {
        const list = groups.get(r.reason) || [];
        list.push(r);
        groups.set(r.reason, list);
      }

      let sentCount = 0;
      let sendError: string | undefined;
      for (const [reason, groupRecipients] of groups) {
        try {
          await sendSlackNotification({
            type: 'criterion_comment_or_attachment',
            priority: reason === 'mention' ? 'high' : 'medium',
            ...(groupRecipients.length === 1
              ? { recipient: groupRecipients[0] }
              : { recipients: groupRecipients }),
            launch_id: epicId,
            metadata: { ...metadata, reason },
          });
          sentCount += groupRecipients.length;
        } catch (err: any) {
          console.error(`Failed to send Slack notification (${reason}) for comment:`, err);
          sendError = err?.message || 'Failed to send';
        }
      }

      const slackNotification: { sent: boolean; recipient_count: number; error?: string } | undefined =
        byId.size > 0
          ? { sent: sentCount > 0, recipient_count: byId.size, ...(sendError && { error: sendError }) }
          : undefined;
      return NextResponse.json(
        { comment, ...(slackNotification && { slack_notification: slackNotification }) },
        { status: 201 }
      );
    } catch (notificationError: any) {
      console.error('Failed to send Slack notification for comment:', notificationError);
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create comment' },
      { status: 500 }
    );
  }
}






