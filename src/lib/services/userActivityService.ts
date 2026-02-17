/**
 * User Activity Tracking Service
 * Tracks user logins and activity for usage analytics
 */

import { getClient } from '@/lib/db';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export type ActivityType = 'login' | 'page_view' | 'action';

export interface ActivityData {
  page?: string;
  action?: string;
  [key: string]: unknown;
}

/**
 * Track user activity
 * Uses admin client to bypass RLS for activity tracking
 */
export async function trackUserActivity(
  userId: string,
  activityType: ActivityType,
  activityData?: ActivityData
): Promise<void> {
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    console.warn('[trackUserActivity] Missing service role key, skipping activity tracking');
    return;
  }

  try {
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey
    );

    await adminClient
      .from('user_activity')
      .insert({
        user_id: userId,
        activity_type: activityType,
        activity_data: activityData || null,
      });

    // Update last_logged_in for login activities
    if (activityType === 'login') {
      await adminClient
        .from('app_user')
        .update({ last_logged_in: new Date().toISOString() })
        .eq('id', userId);
    }
  } catch (error) {
    // Don't throw - activity tracking should not break the app
    console.error('[trackUserActivity] Failed to track activity:', error);
  }
}

/**
 * Track login activity for a user by email
 */
export async function trackLogin(email: string): Promise<void> {
  const supabase = getClient();
  const { data: user } = await supabase
    .from('app_user')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (user?.id) {
    await trackUserActivity(user.id, 'login', {
      timestamp: new Date().toISOString(),
    });
  }
}
