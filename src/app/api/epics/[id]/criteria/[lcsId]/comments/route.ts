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
    const { comment_text } = body;

    // Validate that comment has content (strip HTML tags for validation)
    const textContent = comment_text ? comment_text.replace(/<[^>]*>/g, '').trim() : '';
    if (!textContent) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
    }

    // Insert comment
    const { data: comment, error } = await supabase
      .from('criterion_comment')
      .insert({
        launch_criterion_status_id: lcsId,
        comment_text: comment_text, // Store HTML as-is
        created_by: appUser.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Send Slack notification to the approver (decision_owner)
    try {
      // Fetch criterion status with epic, criterion, and decision_owner info
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

      if (!statusError && criterionStatus && criterionStatus.decision_owner) {
        const decisionOwner = criterionStatus.decision_owner as any;
        const epic = criterionStatus.epic as any;
        const criterion = criterionStatus.criterion as any;

        // Get current user's display name
        const currentUserName = appUser.name || 
          (appUser.first_name && appUser.last_name ? `${appUser.first_name} ${appUser.last_name}` : 
           appUser.first_name || appUser.last_name || userEmail);

        // Send notification (even if the approver is the one who added the comment)
        await sendSlackNotification({
          type: 'criterion_comment_or_attachment',
          priority: 'medium',
          recipient: {
            id: decisionOwner.id,
            email: decisionOwner.email,
            slack_handle: decisionOwner.slack_handle || undefined,
            name: decisionOwner.name || 
              (decisionOwner.first_name && decisionOwner.last_name ? `${decisionOwner.first_name} ${decisionOwner.last_name}` : 
               decisionOwner.first_name || decisionOwner.last_name || decisionOwner.email),
          },
          launch_id: epicId,
          metadata: {
            epic_name: epic.name,
            epic_id: epic.id,
            criterion_label: criterion.label,
            criterion_status_id: lcsId,
            added_by_name: currentUserName,
            has_comment: true,
            has_attachment: false,
          },
        });
      }
    } catch (notificationError: any) {
      // Log error but don't fail the comment creation
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






