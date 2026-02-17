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

/**
 * Track activity when a user performs an action (creates audit_log entry)
 * This ensures users who make changes are counted in usage analytics
 * even if /api/me wasn't called (e.g., API-only usage)
 * 
 * Uses throttling: only tracks if last_logged_in is more than 1 hour old or null
 */
export async function trackActivityFromAction(userId: string): Promise<void> {
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    console.warn('[trackActivityFromAction] Missing service role key, skipping activity tracking');
    return;
  }

  try {
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey
    );

    // Check if user has logged in recently (within last hour)
    const { data: user } = await adminClient
      .from('app_user')
      .select('last_logged_in')
      .eq('id', userId)
      .single();

    if (!user) {
      return; // User not found, skip tracking
    }

    const lastLoggedIn = user.last_logged_in ? new Date(user.last_logged_in).getTime() : 0;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Only track if last login was more than 1 hour ago or null (throttled)
    if (!lastLoggedIn || lastLoggedIn < oneHourAgo) {
      // Track as login activity (counts as a visit)
      await trackUserActivity(userId, 'login', {
        timestamp: new Date().toISOString(),
        source: 'action', // Indicates this was triggered by an action, not /api/me
      });
    }
  } catch (error) {
    // Don't throw - activity tracking should not break the app
    console.error('[trackActivityFromAction] Failed to track activity:', error);
  }
}
