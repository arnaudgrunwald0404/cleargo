import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  getAdoptionMetrics,
  getStickinessMetrics,
  getUsageByRole,
  getUserActivityTrends,
} from '@/lib/services/usageAnalyticsService';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: appUser } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();
    
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((appUser?.roles as string[]) || [], 'analytics.read', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const metric = searchParams.get('metric') || 'adoption';
    const filters = {
      dateRangeStart: searchParams.get('date_range_start') || undefined,
      dateRangeEnd: searchParams.get('date_range_end') || undefined,
      role: searchParams.get('role') || undefined,
    };
    const daysBack = Math.min(90, Math.max(7, parseInt(searchParams.get('days_back') || '30', 10)));

    switch (metric) {
      case 'adoption':
        const adoptionMetrics = await getAdoptionMetrics(filters);
        return NextResponse.json(adoptionMetrics);

      case 'stickiness':
        const stickinessMetrics = await getStickinessMetrics(filters);
        return NextResponse.json(stickinessMetrics);

      case 'by-role':
        const usageByRole = await getUsageByRole(filters);
        return NextResponse.json(usageByRole);

      case 'trends':
        const trends = await getUserActivityTrends(filters, daysBack);
        return NextResponse.json(trends);

      default:
        return NextResponse.json({ error: 'Invalid metric. Use: adoption, stickiness, by-role, or trends' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error fetching usage analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage analytics', details: error.message },
      { status: 500 }
    );
  }
}
