/**
 * API endpoint for marking epic success scorecards as reviewed
 * Part of Sprint 8: PM Monitoring Assignment + Reminders + Escalation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { markEpicAsReviewed } from '@/lib/services/successReviewService';
import { resolveRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

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
    
    // Check permissions - PM or Admin only
    const role = await resolveRole(user.email);
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('id, roles')
      .eq('email', user.email)
      .single();
    
    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }
    
    const userRoles = (me?.roles as string[]) || [];
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';
    const isPM = userRoles.includes('PM');
    
    if (!isAdmin && !isPM) {
      return NextResponse.json({ error: 'Forbidden: Only PMs and Admins can mark scorecards as reviewed' }, { status: 403 });
    }
    
    // Verify epic has a success config
    const { data: config } = await supabase
      .from('epic_success_configs')
      .select('epic_id')
      .eq('epic_id', epicId)
      .single();
    
    if (!config) {
      return NextResponse.json({ error: 'Epic does not have a success configuration' }, { status: 404 });
    }
    
    const review = await markEpicAsReviewed(epicId, me!.id);
    
    return NextResponse.json(review, { status: 201 });
  } catch (error: any) {
    console.error('Error marking epic as reviewed:', error);
    return NextResponse.json(
      { error: 'Failed to mark epic as reviewed', details: error.message },
      { status: 500 }
    );
  }
}

