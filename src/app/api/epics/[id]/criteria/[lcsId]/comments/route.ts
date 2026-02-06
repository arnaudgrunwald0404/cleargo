import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { sendSlackNotification } from '@/lib/slack/notifications';

export const dynamic = 'force-dynamic';

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
            name
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
      };

      const toSlackUser = (u: { id: string; email: string; first_name?: string; last_name?: string; name?: string; slack_handle?: string }) => ({
        id: u.id,
        email: u.email,
        slack_handle: u.slack_handle || undefined,
        name: u.name || (u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.first_name || u.last_name || u.email),
      });

      const recipients: Array<{ id: string; email: string; slack_handle?: string; name: string }> = [];
      if (decisionOwner && !isOwner) {
        recipients.push(toSlackUser(decisionOwner));
      }
      if (validatedMentionIds.length > 0) {
        const { data: mentionedUsers } = await supabase
          .from('app_user')
          .select('id, email, first_name, last_name, name, slack_handle')
          .in('id', validatedMentionIds);
        const ownerId = decisionOwner?.id;
        for (const u of mentionedUsers || []) {
          if (u.id === commenterId) continue;
          if (ownerId && u.id === ownerId) continue;
          if (recipients.some((r) => r.id === u.id)) continue;
          recipients.push(toSlackUser(u));
        }
      }

      let slackNotification: { sent: boolean; recipient_count: number; error?: string } | undefined;
      if (recipients.length > 0) {
        try {
          await sendSlackNotification({
            type: 'criterion_comment_or_attachment',
            priority: 'medium',
            ...(recipients.length === 1
              ? { recipient: recipients[0] }
              : { recipients }),
            launch_id: epicId,
            metadata,
          });
          slackNotification = { sent: true, recipient_count: recipients.length };
        } catch (sendError: any) {
          console.error('Failed to send Slack notification for comment:', sendError);
          slackNotification = { sent: false, recipient_count: recipients.length, error: sendError?.message || 'Failed to send' };
        }
      }
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






