import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCriteriaOnTimeRate } from '@/lib/services/analyticsService';
import { canRolesPerform } from '@/lib/permissions';

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
    const filters = {
      tier: searchParams.get('tier') || undefined,
      pod: searchParams.get('pod') || undefined,
      dateRangeStart: searchParams.get('date_range_start') || undefined,
      dateRangeEnd: searchParams.get('date_range_end') || undefined,
    };

    const result = await getCriteriaOnTimeRate(filters);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching criteria timeliness data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch criteria timeliness data', details: error.message },
      { status: 500 }
    );
  }
}
