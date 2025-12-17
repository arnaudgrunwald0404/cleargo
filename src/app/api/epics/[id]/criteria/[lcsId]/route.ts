import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeEpicReadiness } from '@/lib/readiness';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
  try {
    const { id, lcsId } = await params;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get app_user ID from email
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userError || !appUser) {
      console.error('Failed to find app_user:', userError);
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const body = await req.json();
    const { status, notes, condition, condition_due_date, condition_owner_id } = body;

    // Fetch existing to detect assignee change
    const { data: existing, error: fetchErr } = await supabase
      .from('epic_criterion_status')
      .select('id, condition_owner_id')
      .eq('id', lcsId)
      .eq('epic_id', id)
      .single();
    if (fetchErr || !existing) {
      console.error('Failed to fetch existing criterion status', fetchErr);
      return NextResponse.json({ error: 'Criterion status not found' }, { status: 404 });
    }
    // Load current user's roles
    const { data: me } = await supabase
      .from('app_user')
      .select('roles')
      .eq('id', appUser.id)
      .single();

    // Check permission to update criterion status in general
    {
      const { canRolesPerform } = await import('@/lib/permissions');
      const canUpdate = await canRolesPerform(
        (me?.roles as string[]) || [],
        'criteria.status.update'
      );
      if (!canUpdate) {
        return NextResponse.json(
          { error: 'Forbidden: cannot update criterion status' },
          { status: 403 }
        );
      }
    }

    // If changing assigned owner, require stronger permission
    if (
      typeof condition_owner_id !== 'undefined' &&
      condition_owner_id !== existing.condition_owner_id
    ) {
      const { canRolesPerform } = await import('@/lib/permissions');
      const ok = await canRolesPerform((me?.roles as string[]) || [], 'criteria.assignee.override');
      if (!ok) {
        return NextResponse.json(
          { error: 'Forbidden: cannot override criterion assignee' },
          { status: 403 }
        );
      }
    }

    console.log('Updating criterion status:', {
      lcsId,
      epicId: id,
      status,
      appUserId: appUser.id,
      body,
    });

    // Update the status
    const { data, error } = await supabase
      .from('epic_criterion_status')
      .update({
        status,
        current_status_notes: notes,
        condition,
        condition_due_date,
        condition_owner_id,
        last_updated_at: new Date().toISOString(),
        last_updated_by: appUser.id,
      })
      .eq('id', lcsId)
      .eq('epic_id', id) // Security check
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        {
          error: error.message || 'Database error',
          details: error.details || null,
          hint: error.hint || null,
          code: error.code || null,
        },
        { status: 500 }
      );
    }

    // Trigger readiness re-computation asynchronously (or await if we want immediate consistency)
    await recomputeEpicReadiness(id);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error updating criterion status:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Failed to update status',
        details: error?.details || null,
      },
      { status: 500 }
    );
  }
}
