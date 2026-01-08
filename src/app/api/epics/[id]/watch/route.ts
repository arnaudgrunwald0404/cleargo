import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user_id from app_user table
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is watching this epic (optimized with composite index)
    const { data: watch, error: watchError } = await supabase
      .from('epic_watches')
      .select('id')
      .eq('epic_id', epicId)
      .eq('user_id', appUser.id)
      .maybeSingle();

    if (watchError && watchError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine
      console.error('Error checking watch status:', watchError);
      return NextResponse.json({ error: 'Failed to check watch status' }, { status: 500 });
    }

    return NextResponse.json({ isWatching: !!watch });
  } catch (error: any) {
    console.error('Error fetching watch status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watch status', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user_id from app_user table
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if epic exists
    const { data: epic, error: epicError } = await supabase
      .from('epic')
      .select('id')
      .eq('id', epicId)
      .single();

    if (epicError || !epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    // Add watch (upsert to handle race conditions)
    const { data: watch, error: watchError } = await supabase
      .from('epic_watches')
      .upsert({
        epic_id: epicId,
        user_id: appUser.id,
      }, {
        onConflict: 'epic_id,user_id'
      })
      .select()
      .single();

    if (watchError) {
      console.error('Error adding watch:', watchError);
      return NextResponse.json({ 
        error: 'Failed to add watch', 
        details: watchError.message,
        code: watchError.code 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, isWatching: true });
  } catch (error: any) {
    console.error('Error adding watch:', error);
    return NextResponse.json(
      { error: 'Failed to add watch', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user_id from app_user table
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Remove watch
    const { error: deleteError } = await supabase
      .from('epic_watches')
      .delete()
      .eq('epic_id', epicId)
      .eq('user_id', appUser.id);

    if (deleteError) {
      console.error('Error removing watch:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to remove watch',
        details: deleteError.message,
        code: deleteError.code
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, isWatching: false });
  } catch (error: any) {
    console.error('Error removing watch:', error);
    return NextResponse.json(
      { error: 'Failed to remove watch', details: error.message },
      { status: 500 }
    );
  }
}

