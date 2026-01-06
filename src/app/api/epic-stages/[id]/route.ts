import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Capability: epicStages.manage
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();

    // Handle case where user doesn't exist in app_user table
    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }

    const { canRolesPerform } = await import('@/lib/permissions');
    const ok = await canRolesPerform((me?.roles as string[]) || [], 'epicStages.manage');
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const { error } = await supabase.from('launch_stages').delete().eq('id', id);

    if (error) {
      console.error('Error deleting launch stage:', error);
      return NextResponse.json(
        { error: 'Failed to delete launch stage', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/epic-stages/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to delete launch stage', details: error.message },
      { status: 500 }
    );
  }
}

