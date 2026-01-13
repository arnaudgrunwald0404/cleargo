import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { sendSlackNotification } from '@/lib/slack/notifications';

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
    
    // Handle virtual IDs - they don't have status rows and can't have attachments
    if (lcsId.startsWith('virtual-')) {
      return NextResponse.json([]);
    }
    
    const supabase = createClient();
    
    // Authenticate user (supports both Supabase auth and magic link)
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
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
    
    // Authenticate user (supports both Supabase auth and magic link)
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user info
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id, first_name, last_name, name')
      .eq('email', userEmail)
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
      const errorMessage = process.env.NODE_ENV === 'development'
        ? `Failed to upload file to storage: ${uploadError.message || JSON.stringify(uploadError)}`
        : 'Failed to upload file to storage. Please ensure the storage bucket exists and you have permission to upload.';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
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

    // Send Slack notification to the approver (decision_owner)
    // Note: We send notifications for all attachments, whether attached to comments or standalone
    try {
      // Fetch criterion status with epic, criterion, and decision_owner info
      const { data: criterionStatus, error: statusError } = await supabase
        .from('epic_criterion_status')
        .select(`
          id,
          epic:epic_id (
            id,
            name
          ),
          criterion:criterion_id (
            id,
            label
          ),
          decision_owner:decision_owner_id (
            id,
            email,
            first_name,
            last_name,
            name,
            slack_handle
          )
        `)
        .eq('id', lcsId)
        .single();

      if (!statusError && criterionStatus && criterionStatus.decision_owner) {
        const decisionOwner = criterionStatus.decision_owner as any;
        const epic = criterionStatus.epic as any;
        const criterion = criterionStatus.criterion as any;

        // Get current user's display name
        const currentUserName = appUser.name || 
          (appUser.first_name && appUser.last_name ? `${appUser.first_name} ${appUser.last_name}` : 
           appUser.first_name || appUser.last_name || userEmail);

        // Send notification (even if the approver is the one who added the attachment)
        await sendSlackNotification({
          type: 'criterion_comment_or_attachment',
          priority: 'medium',
          recipient: {
            id: decisionOwner.id,
            email: decisionOwner.email,
            slack_handle: decisionOwner.slack_handle || undefined,
            name: decisionOwner.name || 
              (decisionOwner.first_name && decisionOwner.last_name ? `${decisionOwner.first_name} ${decisionOwner.last_name}` : 
               decisionOwner.first_name || decisionOwner.last_name || decisionOwner.email),
          },
          launch_id: epicId,
          metadata: {
            epic_name: epic.name,
            epic_id: epic.id,
            criterion_label: criterion.label,
            criterion_status_id: lcsId,
            added_by_name: currentUserName,
            has_comment: false,
            has_attachment: true,
          },
        });
      }
    } catch (notificationError: any) {
      // Log error but don't fail the attachment creation
      console.error('Failed to send Slack notification for attachment:', notificationError);
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


