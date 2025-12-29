import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET - Download an attachment
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string; attachmentId: string }> }
) {
  try {
    const { id: epicId, lcsId, attachmentId } = await params;
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch attachment record
    const { data: attachment, error } = await supabase
      .from('criterion_attachment')
      .select('storage_path, file_name, file_type')
      .eq('id', attachmentId)
      .single();

    if (error || !attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('criterion-attachments')
      .download(attachment.storage_path);

    if (downloadError || !fileData) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    // Convert blob to buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Return file with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.file_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${attachment.file_name}"`,
      },
    });
  } catch (error: any) {
    console.error('Error downloading attachment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download attachment' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an attachment
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string; attachmentId: string }> }
) {
  try {
    const { id: epicId, lcsId, attachmentId } = await params;
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

    // Fetch attachment to get storage path and verify ownership
    const { data: attachment, error: fetchError } = await supabase
      .from('criterion_attachment')
      .select('storage_path, uploaded_by')
      .eq('id', attachmentId)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Check if user owns the attachment
    if (attachment.uploaded_by !== appUser.id) {
      return NextResponse.json({ error: 'Forbidden: You can only delete your own attachments' }, { status: 403 });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('criterion-attachments')
      .remove([attachment.storage_path]);

    if (storageError) {
      console.warn('Failed to delete file from storage:', storageError);
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('criterion_attachment')
      .delete()
      .eq('id', attachmentId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete attachment' },
      { status: 500 }
    );
  }
}


