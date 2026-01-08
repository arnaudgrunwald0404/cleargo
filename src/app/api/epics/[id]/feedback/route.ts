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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch feedback with user info
    // Use created_by_id foreign key to join with app_user table
    const { data: feedbacks, error } = await supabase
      .from('feedback')
      .select(`
        id,
        feedback_text,
        created_at,
        created_by_id,
        created_by:app_user!created_by_id(email, first_name, last_name, avatar_url)
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
      .from('feedback')
      .insert({
        epic_id: epicId,
        feedback_text: feedback_text.trim(),
        created_by_id: appUser.id,
        source: 'manual',
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







