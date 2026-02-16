import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

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
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const { data: notifications, error } = await supabase
      .from('notification_log')
      .select(`
        id,
        type,
        delivery_channel,
        status,
        error,
        slack_ts,
        slack_channel,
        sent_at,
        payload,
        user_id,
        epic_id
      `)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notifications', details: error.message },
        { status: 500 }
      );
    }

    console.log(`Fetched ${notifications?.length || 0} notifications from database`);

    if (!notifications || notifications.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch user and epic details separately if needed
    const userIds = [...new Set((notifications || []).map(n => n.user_id).filter(Boolean))];
    const epicIds = [...new Set((notifications || []).map(n => n.epic_id).filter(Boolean))];

    const usersMap = new Map();
    const epicsMap = new Map();

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('app_user')
        .select('id, email, name')
        .in('id', userIds);
      
      if (users) {
        users.forEach(user => usersMap.set(user.id, user));
      }
    }

    if (epicIds.length > 0) {
      const { data: epics } = await supabase
        .from('epic')
        .select('id, name')
        .in('id', epicIds);
      
      if (epics) {
        epics.forEach(epic => epicsMap.set(epic.id, epic));
      }
    }

    // Enrich notifications with user and epic data
    const enrichedNotifications = (notifications || []).map(notification => ({
      ...notification,
      app_user: notification.user_id ? usersMap.get(notification.user_id) : null,
      epic: notification.epic_id ? epicsMap.get(notification.epic_id) : null,
    }));

    return NextResponse.json(enrichedNotifications);
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications', details: error.message },
      { status: 500 }
    );
  }
}
