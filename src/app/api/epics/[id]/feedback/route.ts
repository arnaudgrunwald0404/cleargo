import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch all feedback for an epic
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:7',message:'GET feedback endpoint called',data:{url:req.url,hasCookies:req.cookies.getAll().length>0,cookieNames:req.cookies.getAll().map(c=>c.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    const { id: epicId } = await params;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:11',message:'Params resolved',data:{epicId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // #region agent log
    const envCheck = {hasSupabaseUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasPublishableKey:!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,hasAnonKey:!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY};
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:13',message:'Before createClient - env check',data:envCheck,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const supabase = createClient();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:15',message:'After createClient - before getUser',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:19',message:'After getUser',data:{hasUser:!!user,userEmail:user?.email,authError:authError?.message,authErrorCode:authError?.code,authErrorStatus:authError?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!user?.email) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:22',message:'Returning 401 - no user email',data:{authError:authError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:26',message:'Before database query',data:{epicId,userEmail:user.email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
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
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:40',message:'After database query',data:{hasError:!!error,errorMessage:error?.message,errorCode:error?.code,feedbacksCount:feedbacks?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (error) throw error;

    return NextResponse.json(feedbacks || []);
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'feedback/route.ts:45',message:'Error caught in catch block',data:{errorMessage:error?.message,errorCode:error?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
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







