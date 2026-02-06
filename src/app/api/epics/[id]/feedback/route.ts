import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { notifySuperAdminsOfFeedback } from '@/lib/slack/notifications';

export const dynamic = 'force-dynamic';

// GET - Fetch all feedback for an epic
export async function GET(
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

    const { data: feedbacks, error } = await supabase
      .from('feedback')
      .select('id, feedback_text, created_at, created_by_id, status, status_updated_at')
      .eq('epic_id', epicId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list = feedbacks || [];
    const userIds = [...new Set(list.map((f: any) => f.created_by_id).filter(Boolean))];
    const { data: users } = userIds.length
      ? await supabase.from('app_user').select('id, email, first_name, last_name, avatar_url').in('id', userIds)
      : { data: [] };
    const usersById = new Map((users || []).map((u: any) => [u.id, u]));

    const result = list.map((f: any) => ({
      ...f,
      created_by: f.created_by_id ? usersById.get(f.created_by_id) ?? null : null,
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}

// POST - Create new feedback
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

    // Get user ID
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const { feedback_text } = body;

    if (!feedback_text || !feedback_text.trim()) {
      return NextResponse.json({ error: 'Feedback text is required' }, { status: 400 });
    }

    // Insert feedback
    const { data: feedback, error } = await supabase
      .from('feedback')
      .insert({
        epic_id: epicId,
        feedback_text: feedback_text.trim(),
        feedback_type: 'EPIC',
        created_by_id: appUser.id,
        source: 'manual',
      })
      .select()
      .single();

    if (error) throw error;

    await notifySuperAdminsOfFeedback({
      feedbackId: feedback.id,
      feedbackText: feedback.feedback_text,
      feedbackType: 'EPIC',
      epicId: epicId,
      authorEmail: userEmail,
    }).catch((e) => {
      console.error('Feedback created but super admin notification failed:', e?.message ?? e);
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (error: any) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create feedback' },
      { status: 500 }
    );
  }
}







