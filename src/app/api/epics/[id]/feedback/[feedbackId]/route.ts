import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// PATCH - Update a feedback (own only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; feedbackId: string }> }
) {
  try {
    const { feedbackId } = await params;
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

    const { data: feedback, error: fetchError } = await supabase
      .from('feedback')
      .select('created_by_id')
      .eq('id', feedbackId)
      .single();

    if (fetchError || !feedback) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    if (feedback.created_by_id !== appUser.id) {
      return NextResponse.json({ error: 'You can only edit your own feedback' }, { status: 403 });
    }

    const body = await req.json();
    const { feedback_text } = body;

    if (feedback_text === undefined || feedback_text === null) {
      return NextResponse.json({ error: 'feedback_text is required' }, { status: 400 });
    }
    const trimmed = typeof feedback_text === 'string' ? feedback_text.trim() : '';
    if (!trimmed) {
      return NextResponse.json({ error: 'feedback_text cannot be empty' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('feedback')
      .update({ feedback_text: trimmed })
      .eq('id', feedbackId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update feedback' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a feedback
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; feedbackId: string }> }
) {
  try {
    const { id: epicId, feedbackId } = await params;
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

    // Check if feedback belongs to user
    const { data: feedback, error: fetchError } = await supabase
      .from('feedback')
      .select('created_by_id')
      .eq('id', feedbackId)
      .single();

    if (fetchError || !feedback) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    if (feedback.created_by_id !== appUser.id) {
      return NextResponse.json({ error: 'You can only delete your own feedback' }, { status: 403 });
    }

    // Delete feedback
    const { error: deleteError } = await supabase
      .from('feedback')
      .delete()
      .eq('id', feedbackId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete feedback' },
      { status: 500 }
    );
  }
}







