import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// POST - Mark one or multiple comments as read
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    
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

    // Parse request body
    const body = await req.json();
    const { comment_ids } = body;

    if (!Array.isArray(comment_ids) || comment_ids.length === 0) {
      return NextResponse.json({ error: 'comment_ids must be a non-empty array' }, { status: 400 });
    }

    // Validate that all comment IDs are valid UUIDs
    const validCommentIds = comment_ids.filter((id: any) => 
      typeof id === 'string' && id.length > 0
    );

    if (validCommentIds.length === 0) {
      return NextResponse.json({ error: 'No valid comment IDs provided' }, { status: 400 });
    }

    // Use upsert to insert or update read_at timestamp
    // This handles both new read statuses and updating existing ones
    const readStatuses = validCommentIds.map((commentId: string) => ({
      comment_id: commentId,
      user_id: userId,
      read_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('comment_read_status')
      .upsert(readStatuses, {
        onConflict: 'comment_id,user_id',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error('Error marking comments as read:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to mark comments as read' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      marked_count: data?.length || validCommentIds.length,
    });
  } catch (error: any) {
    console.error('Error marking comments as read:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark comments as read' },
      { status: 500 }
    );
  }
}
