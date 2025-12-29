import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch all attachments for a comment
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string; commentId: string }> }
) {
  try {
    const { id: epicId, lcsId, commentId } = await params;
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch attachments for this comment
    const { data: attachments, error } = await supabase
      .from('criterion_attachment')
      .select(`
        id,
        file_name,
        file_size,
        file_type,
        uploaded_at
      `)
      .eq('comment_id', commentId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(attachments || []);
  } catch (error: any) {
    console.error('Error fetching comment attachments:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attachments' },
      { status: 500 }
    );
  }
}


