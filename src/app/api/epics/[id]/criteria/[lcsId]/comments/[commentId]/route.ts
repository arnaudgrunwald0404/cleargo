import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// DELETE - Delete a comment
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string; commentId: string }> }
) {
  try {
    const { id: epicId, lcsId, commentId } = await params;
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

    // Check if comment belongs to user
    const { data: comment, error: fetchError } = await supabase
      .from('criterion_comment')
      .select('created_by')
      .eq('id', commentId)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (comment.created_by !== appUser.id) {
      return NextResponse.json({ error: 'You can only delete your own comments' }, { status: 403 });
    }

    // Delete comment
    const { error: deleteError } = await supabase
      .from('criterion_comment')
      .delete()
      .eq('id', commentId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete comment' },
      { status: 500 }
    );
  }
}

// PATCH - Update a comment (author only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string; commentId: string }> }
) {
  try {
    const { id: epicId, lcsId, commentId } = await params;
    const supabase = createClient();

    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: comment, error: fetchError } = await supabase
      .from('criterion_comment')
      .select('created_by')
      .eq('id', commentId)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (comment.created_by !== appUser.id) {
      return NextResponse.json({ error: 'You can only edit your own comments' }, { status: 403 });
    }

    const body = await req.json();
    const { comment_text, mentioned_user_ids: rawMentionedIds } = body;

    const textContent = comment_text ? comment_text.replace(/<[^>]*>/g, '').trim() : '';
    if (!textContent) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
    }

    const mentionIds = Array.isArray(rawMentionedIds)
      ? [...new Set((rawMentionedIds as string[]).filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [];
    let validatedMentionIds: string[] = [];
    if (mentionIds.length > 0) {
      const { data: mentionUsers } = await supabase
        .from('app_user')
        .select('id')
        .in('id', mentionIds);
      const validIds = new Set((mentionUsers || []).map((u) => u.id));
      validatedMentionIds = mentionIds.filter((id) => validIds.has(id) && id !== appUser.id);
    }

    const { data: updated, error: updateError } = await supabase
      .from('criterion_comment')
      .update({
        comment_text: comment_text,
        mentioned_user_ids: validatedMentionIds.length > 0 ? validatedMentionIds : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating comment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update comment' },
      { status: 500 }
    );
  }
}





