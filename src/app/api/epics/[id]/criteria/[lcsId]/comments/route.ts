import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch all comments for a criterion
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
  try {
    const { id: epicId, lcsId } = await params;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/epics/[id]/criteria/[lcsId]/comments/route.ts:12',message:'GET comments endpoint called',data:{epicId,lcsId,isVirtual:lcsId?.startsWith('virtual-')},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/epics/[id]/criteria/[lcsId]/comments/route.ts:24',message:'Before database query',data:{lcsId,isVirtual:lcsId.startsWith('virtual-')},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/epics/[id]/criteria/[lcsId]/comments/route.ts:35',message:'After database query',data:{lcsId,isVirtual:lcsId.startsWith('virtual-'),hasError:!!error,errorCode:error?.code,errorMessage:error?.message,commentCount:comments?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/epics/[id]/criteria/[lcsId]/comments/route.ts:38',message:'Database error caught',data:{lcsId,isVirtual:lcsId.startsWith('virtual-'),errorCode:error.code,errorMessage:error.message,errorDetails:error},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
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

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create comment' },
      { status: 500 }
    );
  }
}






