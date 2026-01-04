import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch all feedback for an epic
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // #region agent log
  const fs = require('fs');
  const logEntry = {location:'feedback/route.ts:7',message:'GET feedback endpoint called',data:{paramsResolved:false},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'};
  try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry) + '\n'); } catch(e) {}
  // #endregion
  try {
    const { id: epicId } = await params;
    // #region agent log
    const logEntry2 = {location:'feedback/route.ts:12',message:'Params resolved',data:{epicId},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry2) + '\n'); } catch(e) {}
    // #endregion
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      // #region agent log
      const logEntry3 = {location:'feedback/route.ts:18',message:'Unauthorized - no user email',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'};
      try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry3) + '\n'); } catch(e) {}
      // #endregion
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // #region agent log
    const logEntry4 = {location:'feedback/route.ts:22',message:'Before database query',data:{epicId,userEmail:user.email},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry4) + '\n'); } catch(e) {}
    // #endregion

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

    // #region agent log
    const logEntry5 = {location:'feedback/route.ts:33',message:'After database query',data:{hasError:!!error,errorMessage:error?.message,errorCode:error?.code,errorDetails:error?.details,feedbacksCount:feedbacks?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry5) + '\n'); } catch(e) {}
    // #endregion

    if (error) throw error;

    return NextResponse.json(feedbacks || []);
  } catch (error: any) {
    // #region agent log
    const fs2 = require('fs');
    const logEntry6 = {location:'feedback/route.ts:36',message:'Error caught in catch block',data:{errorMessage:error?.message,errorCode:error?.code,errorDetails:error?.details,errorStack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'F'};
    try { fs2.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry6) + '\n'); } catch(e) {}
    // #endregion
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







