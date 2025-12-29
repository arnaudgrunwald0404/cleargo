import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch all feedback for an epic
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch feedback with user info
    const { data: feedbacks, error } = await supabase
      .from('epic_feedback')
      .select(`
        id,
        feedback_text,
        created_at,
        created_by:app_user!epic_feedback_created_by_fkey(email, first_name, last_name)
      `)
      .eq('epic_id', epicId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(feedbacks || []);
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

    const body = await req.json();
    const { feedback_text } = body;

    if (!feedback_text || !feedback_text.trim()) {
      return NextResponse.json({ error: 'Feedback text is required' }, { status: 400 });
    }

    // Insert feedback
    const { data: feedback, error } = await supabase
      .from('epic_feedback')
      .insert({
        epic_id: epicId,
        feedback_text: feedback_text.trim(),
        created_by: appUser.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(feedback, { status: 201 });
  } catch (error: any) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create feedback' },
      { status: 500 }
    );
  }
}







