import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET - Fetch all comments across all epics with read/unread status
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Authenticate user (supports both Supabase auth and magic link)
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = appUser.id;

    // Get query parameters for filtering
    const { searchParams } = new URL(req.url);
    const filterUnread = searchParams.get('unread') === 'true';
    const epicId = searchParams.get('epicId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const myEpicsOnly = searchParams.get('myEpicsOnly') === 'true';

    // If myEpicsOnly, resolve the epic IDs where this user is a decision owner
    let myEpicIds: string[] | null = null;
    if (myEpicsOnly) {
      const { data: ownerRows } = await supabase
        .from('epic_criterion_status')
        .select('epic_id')
        .eq('decision_owner_id', userId);

      myEpicIds = ownerRows
        ? [...new Set(ownerRows.map((r: any) => r.epic_id as string))]
        : [];
    }

    // Build base query for comments
    let commentsQuery = supabase
      .from('criterion_comment')
      .select(`
        id,
        comment_text,
        created_at,
        updated_at,
        status_at_comment,
        previous_status,
        mentioned_user_ids,
        launch_criterion_status_id,
        created_by:app_user!criterion_comment_created_by_fkey(
          id,
          email,
          first_name,
          last_name
        ),
        launch_criterion_status:epic_criterion_status!criterion_comment_launch_criterion_status_id_fkey(
          criterion_id,
          epic_id,
          criterion:criterion_id(
            id,
            label,
            category
          ),
          epic:epic_id(
            id,
            name
          )
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (epicId) {
      commentsQuery = commentsQuery.eq('launch_criterion_status.epic_id', epicId);
    }

    if (myEpicIds !== null) {
      if (myEpicIds.length === 0) {
        return NextResponse.json({ comments: [], unread_count: 0 });
      }
      commentsQuery = commentsQuery.in('launch_criterion_status.epic_id', myEpicIds);
    }

    if (startDate) {
      commentsQuery = commentsQuery.gte('created_at', startDate);
    }

    if (endDate) {
      commentsQuery = commentsQuery.lte('created_at', endDate);
    }

    const { data: comments, error: commentsError } = await commentsQuery;

    if (commentsError) {
      throw commentsError;
    }

    if (!comments || comments.length === 0) {
      return NextResponse.json({
        comments: [],
        unread_count: 0,
      });
    }

    // Get all comment IDs
    const commentIds = comments.map((c: any) => c.id);

    // Fetch read status for all comments for this user
    const { data: readStatuses, error: readError } = await supabase
      .from('comment_read_status')
      .select('comment_id, read_at')
      .eq('user_id', userId)
      .in('comment_id', commentIds);

    if (readError) {
      console.error('Error fetching read statuses:', readError);
      // Continue without read status if there's an error
    }

    // Create a map of comment_id -> read_at
    const readStatusMap = new Map<string, string>();
    if (readStatuses) {
      readStatuses.forEach((rs: any) => {
        readStatusMap.set(rs.comment_id, rs.read_at);
      });
    }

    // Transform comments to include read status and epic/criterion context
    const commentsWithStatus = comments
      .map((comment: any) => {
        const isAuthoredByMe = comment.created_by?.id === userId;
        const isRead = isAuthoredByMe || readStatusMap.has(comment.id);
        const readAt = readStatusMap.get(comment.id);

        // Extract nested data
        const launchCriterionStatus = comment.launch_criterion_status;
        const criterion = launchCriterionStatus?.criterion;
        const epic = launchCriterionStatus?.epic;

        return {
          id: comment.id,
          comment_text: comment.comment_text,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          status_at_comment: comment.status_at_comment,
          previous_status: comment.previous_status,
          mentioned_user_ids: comment.mentioned_user_ids,
          created_by: comment.created_by,
          is_read: isRead,
          read_at: readAt || null,
          epic: epic ? {
            id: epic.id,
            name: epic.name,
          } : null,
          criterion: criterion ? {
            id: criterion.id,
            label: criterion.label,
            category: criterion.category,
          } : null,
          launch_criterion_status_id: comment.launch_criterion_status_id,
        };
      })
      .filter((comment: any) => {
        // Filter out comments without epic/criterion context
        if (!comment.epic || !comment.criterion) {
          return false;
        }

        // Apply unread filter if requested
        if (filterUnread) {
          return !comment.is_read;
        }

        return true;
      });

    // Count unread comments
    const unreadCount = commentsWithStatus.filter((c: any) => !c.is_read).length;

    return NextResponse.json({
      comments: commentsWithStatus,
      unread_count: unreadCount,
    });
  } catch (error: any) {
    console.error('Error fetching all comments:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}
