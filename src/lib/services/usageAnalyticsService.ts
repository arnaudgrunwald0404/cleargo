/**
 * Usage Analytics Service
 * Provides adoption, stickiness, and usage metrics for analytics dashboard
 */

import { getClient } from '@/lib/db';

export interface AnalyticsFilters {
  dateRangeStart?: string;
  dateRangeEnd?: string;
  role?: string;
}

export interface AdoptionMetrics {
  totalUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  newUsersThisMonth: number;
  newUsersLastMonth: number;
}

export interface StickinessMetrics {
  dauMauRatio: number; // Daily Active Users / Monthly Active Users
  wauMauRatio: number; // Weekly Active Users / Monthly Active Users
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  dailyActiveUsers: number;
}

export interface UsageByRole {
  role: string;
  totalUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  loginCount: number;
}

export interface UserActivityTrends {
  dataPoints: Array<{
    date: string;
    activeUsers: number;
    newUsers: number;
    logins: number;
  }>;
}

/**
 * Get adoption metrics: total users, active users, new users
 */
export async function getAdoptionMetrics(
  filters?: AnalyticsFilters
): Promise<AdoptionMetrics> {
  const supabase = getClient();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Build base query
  let userQuery = supabase.from('app_user').select('id, email, created_at, last_logged_in, roles', { count: 'exact' });

  // Apply role filter if provided
  if (filters?.role) {
    userQuery = userQuery.contains('roles', [filters.role]);
  }

  const { data: allUsers, error } = await userQuery;

  if (error || !allUsers) {
    return {
      totalUsers: 0,
      activeUsers7d: 0,
      activeUsers30d: 0,
      newUsersThisMonth: 0,
      newUsersLastMonth: 0,
    };
  }

  const totalUsers = allUsers.length;

  // Count active users (have logged in within time period)
  const activeUsers7d = allUsers.filter(u => {
    if (!u.last_logged_in) return false;
    const lastLogin = new Date(u.last_logged_in);
    return lastLogin >= sevenDaysAgo;
  }).length;

  const activeUsers30d = allUsers.filter(u => {
    if (!u.last_logged_in) return false;
    const lastLogin = new Date(u.last_logged_in);
    return lastLogin >= thirtyDaysAgo;
  }).length;

  // Count new users
  const newUsersThisMonth = allUsers.filter(u => {
    if (!u.created_at) return false;
    const createdAt = new Date(u.created_at);
    return createdAt >= startOfMonth;
  }).length;

  const newUsersLastMonth = allUsers.filter(u => {
    if (!u.created_at) return false;
    const createdAt = new Date(u.created_at);
    return createdAt >= startOfLastMonth && createdAt < endOfLastMonth;
  }).length;

  return {
    totalUsers,
    activeUsers7d,
    activeUsers30d,
    newUsersThisMonth,
    newUsersLastMonth,
  };
}

/**
 * Get stickiness metrics: DAU/MAU, WAU/MAU ratios
 */
export async function getStickinessMetrics(
  filters?: AnalyticsFilters
): Promise<StickinessMetrics> {
  const supabase = getClient();

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get activity data from user_activity table
  let activityQuery = supabase
    .from('user_activity')
    .select('user_id, created_at, activity_type')
    .eq('activity_type', 'login');

  if (filters?.dateRangeStart) {
    activityQuery = activityQuery.gte('created_at', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    activityQuery = activityQuery.lte('created_at', filters.dateRangeEnd);
  }

  const { data: activities, error } = await activityQuery;

  if (error || !activities) {
    return {
      dauMauRatio: 0,
      wauMauRatio: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
      dailyActiveUsers: 0,
    };
  }

  // Get unique users by time period
  const dailyActiveUsers = new Set(
    activities
      .filter(a => new Date(a.created_at) >= oneDayAgo)
      .map(a => a.user_id)
  ).size;

  const weeklyActiveUsers = new Set(
    activities
      .filter(a => new Date(a.created_at) >= sevenDaysAgo)
      .map(a => a.user_id)
  ).size;

  const monthlyActiveUsers = new Set(
    activities
      .filter(a => new Date(a.created_at) >= thirtyDaysAgo)
      .map(a => a.user_id)
  ).size;

  const dauMauRatio = monthlyActiveUsers > 0 ? (dailyActiveUsers / monthlyActiveUsers) * 100 : 0;
  const wauMauRatio = monthlyActiveUsers > 0 ? (weeklyActiveUsers / monthlyActiveUsers) * 100 : 0;

  return {
    dauMauRatio: Math.round(dauMauRatio * 100) / 100,
    wauMauRatio: Math.round(wauMauRatio * 100) / 100,
    weeklyActiveUsers,
    monthlyActiveUsers,
    dailyActiveUsers,
  };
}

/**
 * Get usage breakdown by role
 */
export async function getUsageByRole(
  filters?: AnalyticsFilters
): Promise<UsageByRole[]> {
  const supabase = getClient();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get all users with their roles
  const { data: users, error: usersError } = await supabase
    .from('app_user')
    .select('id, email, roles, last_logged_in');

  if (usersError || !users) {
    return [];
  }

  // Get login activities
  let activityQuery = supabase
    .from('user_activity')
    .select('user_id, created_at')
    .eq('activity_type', 'login');

  if (filters?.dateRangeStart) {
    activityQuery = activityQuery.gte('created_at', filters.dateRangeStart);
  }
  if (filters?.dateRangeEnd) {
    activityQuery = activityQuery.lte('created_at', filters.dateRangeEnd);
  }

  const { data: activities } = await activityQuery;

  // Group users by role
  const roleMap = new Map<string, {
    userIds: Set<string>;
    active7d: Set<string>;
    active30d: Set<string>;
    loginCount: number;
  }>();

  // Process activities
  const activityByUser = new Map<string, number>();
  if (activities) {
    for (const activity of activities) {
      const userId = activity.user_id;
      activityByUser.set(userId, (activityByUser.get(userId) || 0) + 1);
      
      const activityDate = new Date(activity.created_at);
      if (activityDate >= sevenDaysAgo) {
        // Will be counted in active7d
      }
      if (activityDate >= thirtyDaysAgo) {
        // Will be counted in active30d
      }
    }
  }

  // Process users
  for (const user of users) {
    const roles = (user.roles as string[]) || [];
    if (roles.length === 0) {
      roles.push('OTHER');
    }

    for (const role of roles) {
      if (!roleMap.has(role)) {
        roleMap.set(role, {
          userIds: new Set(),
          active7d: new Set(),
          active30d: new Set(),
          loginCount: 0,
        });
      }

      const roleData = roleMap.get(role)!;
      roleData.userIds.add(user.id);

      // Check if user is active
      if (user.last_logged_in) {
        const lastLogin = new Date(user.last_logged_in);
        if (lastLogin >= sevenDaysAgo) {
          roleData.active7d.add(user.id);
        }
        if (lastLogin >= thirtyDaysAgo) {
          roleData.active30d.add(user.id);
        }
      }

      // Count logins for this user
      roleData.loginCount += activityByUser.get(user.id) || 0;
    }
  }

  // Convert to array
  const results: UsageByRole[] = [];
  for (const [role, data] of roleMap.entries()) {
    results.push({
      role,
      totalUsers: data.userIds.size,
      activeUsers7d: data.active7d.size,
      activeUsers30d: data.active30d.size,
      loginCount: data.loginCount,
    });
  }

  return results.sort((a, b) => b.totalUsers - a.totalUsers);
}

/**
 * Get user activity trends over time
 */
export async function getUserActivityTrends(
  filters?: AnalyticsFilters,
  daysBack: number = 30
): Promise<UserActivityTrends> {
  const supabase = getClient();

  const now = new Date();
  const startDate = filters?.dateRangeStart 
    ? new Date(filters.dateRangeStart)
    : new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const endDate = filters?.dateRangeEnd 
    ? new Date(filters.dateRangeEnd)
    : now;

  // Get all activities in date range
  let activityQuery = supabase
    .from('user_activity')
    .select('user_id, created_at, activity_type')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const { data: activities, error } = await activityQuery;

  if (error || !activities) {
    return { dataPoints: [] };
  }

  // Get new users in date range
  const { data: newUsers } = await supabase
    .from('app_user')
    .select('id, created_at')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  // Group activities by date
  const dailyData = new Map<string, {
    activeUsers: Set<string>;
    logins: number;
    newUsers: number;
  }>();

  // Initialize all dates in range
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    dailyData.set(dateStr, {
      activeUsers: new Set(),
      logins: 0,
      newUsers: 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Process activities
  for (const activity of activities) {
    const dateStr = new Date(activity.created_at).toISOString().split('T')[0];
    const dayData = dailyData.get(dateStr);
    if (dayData) {
      dayData.activeUsers.add(activity.user_id);
      if (activity.activity_type === 'login') {
        dayData.logins++;
      }
    }
  }

  // Process new users
  if (newUsers) {
    for (const user of newUsers) {
      const dateStr = new Date(user.created_at).toISOString().split('T')[0];
      const dayData = dailyData.get(dateStr);
      if (dayData) {
        dayData.newUsers++;
      }
    }
  }

  // Convert to array
  const dataPoints = Array.from(dailyData.entries())
    .map(([date, data]) => ({
      date,
      activeUsers: data.activeUsers.size,
      newUsers: data.newUsers,
      logins: data.logins,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { dataPoints };
}
