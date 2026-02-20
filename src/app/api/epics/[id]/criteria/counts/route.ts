import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// POST - Get comment and attachment counts for multiple criterion status IDs
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    
    // Authenticate user (supports both Supabase auth and magic link)
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID for unread count calculation
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();

    const userId = appUser?.id || null;

    // Parse request body
    const body = await req.json();
    const { statusIds } = body;

    if (!Array.isArray(statusIds) || statusIds.length === 0) {
      return NextResponse.json({ error: 'statusIds must be a non-empty array' }, { status: 400 });
    }

    // Filter out virtual IDs
    const realStatusIds = statusIds.filter((id: string) => !id.startsWith('virtual-'));

    if (realStatusIds.length === 0) {
      // All IDs are virtual, return empty results
      const emptyResults: Record<string, { commentCount: number; attachmentCount: number }> = {};
      statusIds.forEach((id: string) => {
        emptyResults[id] = { commentCount: 0, attachmentCount: 0 };
      });
      return NextResponse.json(emptyResults);
    }

    // Fetch comment counts for all status IDs in a single query with user info
    const { data: comments, error: commentsError } = await supabase
      .from('criterion_comment')
      .select(`
        launch_criterion_status_id,
        id,
        comment_text,
        created_at,
        updated_at,
        created_by:app_user!criterion_comment_created_by_fkey(email, first_name, last_name)
      `)
      .in('launch_criterion_status_id', realStatusIds)
      .order('created_at', { ascending: false });

    // Re-sort by last activity (updated_at or created_at) so "last comment" is most recently edited
    if (comments && comments.length > 1) {
      comments.sort((a: any, b: any) => {
        const aAt = a.updated_at ? new Date(a.updated_at).getTime() : new Date(a.created_at).getTime();
        const bAt = b.updated_at ? new Date(b.updated_at).getTime() : new Date(b.created_at).getTime();
        return bAt - aAt;
      });
    }

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
      // Continue with empty comments rather than failing
    }

    // Fetch attachment counts for all status IDs in a single query
    const { data: attachments, error: attachmentsError } = await supabase
      .from('criterion_attachment')
      .select('launch_criterion_status_id, id')
      .in('launch_criterion_status_id', realStatusIds)
      .is('comment_id', null); // Only count attachments for criterion status, not comments

    if (attachmentsError) {
      console.error('Error fetching attachments:', attachmentsError);
      // Continue with empty attachments rather than failing
    }

    // Fetch read status for all comments if user is authenticated
    let readStatusMap = new Map<string, boolean>();
    if (userId && comments && comments.length > 0) {
      const commentIds = comments.map((c: any) => c.id);
      const { data: readStatuses, error: readError } = await supabase
        .from('comment_read_status')
        .select('comment_id')
        .eq('user_id', userId)
        .in('comment_id', commentIds);

      if (!readError && readStatuses) {
        readStatuses.forEach((rs: any) => {
          readStatusMap.set(rs.comment_id, true);
        });
      }
    }

    // Aggregate counts by status ID
    const commentCounts = new Map<string, number>();
    const unreadCounts = new Map<string, number>();
    const attachmentCounts = new Map<string, number>();
    const lastComments = new Map<string, any>();

    // Process comments
    if (comments) {
      comments.forEach((comment: any) => {
        const statusId = comment.launch_criterion_status_id;
        if (!statusId) return;

        // Increment count
        commentCounts.set(statusId, (commentCounts.get(statusId) || 0) + 1);

        // Track unread count (if user is authenticated and comment is not read)
        if (userId && !readStatusMap.has(comment.id)) {
          unreadCounts.set(statusId, (unreadCounts.get(statusId) || 0) + 1);
        }

        // Track last comment (comments are already sorted by created_at DESC)
        if (!lastComments.has(statusId)) {
          lastComments.set(statusId, {
            comment_text: comment.comment_text,
            created_at: comment.created_at,
            updated_at: comment.updated_at ?? undefined,
            created_by: comment.created_by,
          });
        }
      });
    }

    // Process attachments
    if (attachments) {
      attachments.forEach((attachment: any) => {
        const statusId = attachment.launch_criterion_status_id;
        if (!statusId) return;
        attachmentCounts.set(statusId, (attachmentCounts.get(statusId) || 0) + 1);
      });
    }

    // Build result object with all status IDs (including virtual ones)
    const result: Record<string, { commentCount: number; unreadCount: number; attachmentCount: number; lastComment?: any }> = {};
    
    statusIds.forEach((statusId: string) => {
      if (statusId.startsWith('virtual-')) {
        result[statusId] = { commentCount: 0, unreadCount: 0, attachmentCount: 0 };
      } else {
        const commentCount = commentCounts.get(statusId) || 0;
        const unreadCount = unreadCounts.get(statusId) || 0;
        const attachmentCount = attachmentCounts.get(statusId) || 0;
        const lastComment = lastComments.get(statusId);

        result[statusId] = {
          commentCount,
          unreadCount,
          attachmentCount,
          ...(lastComment ? { lastComment } : {}),
        };
      }
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching batch counts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch counts' },
      { status: 500 }
    );
  }
}

