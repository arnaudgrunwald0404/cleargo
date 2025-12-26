Free lunch. Carrots are expanded by default, and the carrots also in front of the readiness matrix. The whole thing should be collapsed in one go, so you can see it. So, do soimport { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// DELETE - Delete a feedback
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; feedbackId: string }> }
) {
  try {
    const { id: epicId, feedbackId } = await params;
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if feedback belongs to user
    const { data: feedback, error: fetchError } = await supabase
      .from('epic_feedback')
      .select('created_by')
      .eq('id', feedbackId)
      .single();

    if (fetchError || !feedback) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    if (feedback.created_by !== appUser.id) {
      return NextResponse.json({ error: 'You can only delete your own feedback' }, { status: 403 });
    }

    // Delete feedback
    const { error: deleteError } = await supabase
      .from('epic_feedback')
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






