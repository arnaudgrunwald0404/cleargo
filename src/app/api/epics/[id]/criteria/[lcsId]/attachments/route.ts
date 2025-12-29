import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Fetch all attachments for a criterion status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
  try {
    const { id: epicId, lcsId } = await params;
    
    // Validate lcsId
    if (!lcsId || typeof lcsId !== 'string') {
      return NextResponse.json({ error: 'Invalid criterion status ID' }, { status: 400 });
    }
    
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch attachments with user info
    const { data: attachments, error } = await supabase
      .from('criterion_attachment')
      .select(`
        id,
        file_name,
        file_size,
        file_type,
        uploaded_at,
        uploaded_by:app_user!criterion_attachment_uploaded_by_fkey(email, first_name, last_name)
      `)
      .eq('launch_criterion_status_id', lcsId)
      .is('comment_id', null) // Only get attachments for criterion status, not comments
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Database error fetching attachments:', error);
      // Check for specific error types
      if (error.code === 'PGRST116') {
        // Table not found or RLS issue
        return NextResponse.json(
          { error: 'Database configuration error' },
          { status: 500 }
        );
      }
      throw error;
    }

    return NextResponse.json(attachments || []);
  } catch (error: any) {
    console.error('Error fetching attachments:', error);
    // Don't expose internal error details in production
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error.message || 'Failed to fetch attachments'
      : 'Failed to fetch attachments';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// POST - Upload a new attachment
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

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const commentId = formData.get('comment_id') as string | null; // Optional: link to comment

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Check file size (max 50MB)
    if (file.size > 52428800) {
      return NextResponse.json({ error: 'File size must be less than 50MB' }, { status: 400 });
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storagePath = `criterion-attachments/${lcsId}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('criterion-attachments')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
    }

    // Create attachment record
    const attachmentData: any = {
      launch_criterion_status_id: commentId ? null : lcsId, // Only set if not a comment attachment
      comment_id: commentId || null,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      storage_path: storagePath,
      uploaded_by: appUser.id,
    };

    const { data: attachment, error: insertError } = await supabase
      .from('criterion_attachment')
      .insert(attachmentData)
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('criterion-attachments').remove([storagePath]);
      throw insertError;
    }

    return NextResponse.json(attachment, { status: 201 });
  } catch (error: any) {
    console.error('Error creating attachment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create attachment' },
      { status: 500 }
    );
  }
}


