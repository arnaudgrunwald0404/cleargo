/**
 * Service for tracking epic success reviews
 * Part of Sprint 8: PM Monitoring Assignment + Reminders + Escalation
 */
import { getClient } from '@/lib/db';

export interface EpicReview {
  id: string;
  epic_id: string;
  reviewer_user_id: string;
  reviewed_at: string;
  created_at: string;
}

export interface EpicWithReviewStatus {
  epicId: string;
  epicName: string;
  launchDate: string | null;
  lastReviewDate: string | null;
  daysSinceLastReview: number | null;
  needsReview: boolean;
  postLaunchOwnerEmail: string | null;
  postLaunchOwnerId: string | null;
}

/**
 * Mark an epic's scorecard as reviewed by a user
 */
export async function markEpicAsReviewed(
  epicId: string,
  reviewerUserId: string
): Promise<EpicReview> {
  const supabase = getClient();
  
  const { data: review, error } = await supabase
    .from('epic_success_reviews')
    .insert({
      epic_id: epicId,
      reviewer_user_id: reviewerUserId,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error marking epic as reviewed:', error);
    throw new Error(`Failed to mark epic as reviewed: ${error.message}`);
  }
  
  return review as EpicReview;
}

/**
 * Get the most recent review for an epic
 */
export async function getLatestReview(epicId: string): Promise<EpicReview | null> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .from('epic_success_reviews')
    .select('*')
    .eq('epic_id', epicId)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching latest review:', error);
    throw new Error(`Failed to fetch latest review: ${error.message}`);
  }
  
  return data as EpicReview | null;
}

/**
 * Get epics that need review (no review in last 7 days)
 */
export async function getEpicsNeedingReview(): Promise<EpicWithReviewStatus[]> {
  const supabase = getClient();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  // Find epics with locked configs and launch dates within last 90 days
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const { data: epics, error: epicsError } = await supabase
    .from('epic')
    .select(`
      id,
      name,
      target_launch_date,
      status
    `)
    .in('status', ['LAUNCHED', 'POST_LAUNCH'])
    .lte('target_launch_date', today.toISOString().split('T')[0])
    .gte('target_launch_date', ninetyDaysAgo.toISOString().split('T')[0])
    .not('target_launch_date', 'is', null);
  
  if (epicsError) {
    console.error('Error fetching epics for review check:', epicsError);
    throw new Error(`Failed to fetch epics: ${epicsError.message}`);
  }
  
  if (!epics || epics.length === 0) {
    return [];
  }
  
  // Get success configs for these epics
  const epicIds = epics.map(e => e.id);
  const { data: configs } = await supabase
    .from('epic_success_configs')
    .select(`
      epic_id,
      locked,
      post_launch_owner,
      post_launch_owner_user:app_user!post_launch_owner(email, id)
    `)
    .in('epic_id', epicIds)
    .eq('locked', true);
  
  const configMap = new Map((configs || []).map(c => {
    const ownerUser = Array.isArray(c.post_launch_owner_user) 
      ? c.post_launch_owner_user[0] 
      : c.post_launch_owner_user;
    return [c.epic_id, {
      postLaunchOwnerEmail: ownerUser?.email || null,
      postLaunchOwnerId: ownerUser?.id || null,
    }];
  }));
  
  // Get latest reviews for all epics
  const { data: reviews } = await supabase
    .from('epic_success_reviews')
    .select('epic_id, reviewed_at')
    .in('epic_id', epicIds)
    .order('reviewed_at', { ascending: false });
  
  // Group reviews by epic_id and get the latest for each
  const latestReviews = new Map<string, string>();
  if (reviews) {
    for (const review of reviews) {
      if (!latestReviews.has(review.epic_id)) {
        latestReviews.set(review.epic_id, review.reviewed_at);
      }
    }
  }
  
  const results: EpicWithReviewStatus[] = [];
  
  for (const epic of epics) {
    const config = configMap.get(epic.id);
    if (!config) continue; // Skip epics without locked configs
    
    const lastReviewDate = latestReviews.get(epic.id) || null;
    let daysSinceLastReview: number | null = null;
    let needsReview = false;
    
    if (lastReviewDate) {
      const reviewDate = new Date(lastReviewDate);
      const diffTime = today.getTime() - reviewDate.getTime();
      daysSinceLastReview = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      needsReview = daysSinceLastReview >= 7;
    } else {
      // No review ever - needs review
      needsReview = true;
    }
    
    if (needsReview) {
      results.push({
        epicId: epic.id,
        epicName: epic.name,
        launchDate: epic.target_launch_date,
        lastReviewDate,
        daysSinceLastReview,
        needsReview: true,
        postLaunchOwnerEmail: config.postLaunchOwnerEmail,
        postLaunchOwnerId: config.postLaunchOwnerId,
      });
    }
  }
  
  return results;
}

/**
 * Get epics that need escalation (no review for 14+ days or overdue retros)
 */
export async function getEpicsNeedingEscalation(): Promise<Array<{
  epicId: string;
  epicName: string;
  escalationReason: 'unreviewed' | 'overdue_retro';
  daysSinceLastReview: number | null;
  overdueRetroDayMarker: number | null;
  postLaunchOwnerEmail: string | null;
  postLaunchOwnerId: string | null;
}>> {
  const supabase = getClient();
  const today = new Date();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  
  // Get epics needing review (14+ days)
  const unreviewedEpics = await getEpicsNeedingReview();
  const escalationEpics: Array<{
    epicId: string;
    epicName: string;
    escalationReason: 'unreviewed' | 'overdue_retro';
    daysSinceLastReview: number | null;
    overdueRetroDayMarker: number | null;
    postLaunchOwnerEmail: string | null;
    postLaunchOwnerId: string | null;
  }> = [];
  
  // Add unreviewed epics (14+ days)
  for (const epic of unreviewedEpics) {
    if (epic.daysSinceLastReview === null || epic.daysSinceLastReview >= 14) {
      escalationEpics.push({
        epicId: epic.epicId,
        epicName: epic.epicName,
        escalationReason: 'unreviewed',
        daysSinceLastReview: epic.daysSinceLastReview,
        overdueRetroDayMarker: null,
        postLaunchOwnerEmail: epic.postLaunchOwnerEmail,
        postLaunchOwnerId: epic.postLaunchOwnerId,
      });
    }
  }
  
  // Find epics with overdue retros (7+ days past due date)
  const { data: epicsWithRetros } = await supabase
    .from('epic')
    .select(`
      id,
      name,
      target_launch_date,
      epic_success_configs!inner(
        post_launch_owner,
        post_launch_owner_user:app_user!post_launch_owner(email, id)
      ),
      epic_retros!inner(
        day_marker,
        status
      )
    `)
    .in('status', ['LAUNCHED', 'POST_LAUNCH'])
    .lte('target_launch_date', today.toISOString().split('T')[0])
    .not('target_launch_date', 'is', null)
    .eq('epic_retros.status', 'PENDING');
  
  if (epicsWithRetros) {
    for (const epic of epicsWithRetros) {
      if (!epic.target_launch_date) continue;
      
      const launchDate = new Date(epic.target_launch_date);
      const daysSinceLaunch = Math.floor((today.getTime() - launchDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const config = Array.isArray(epic.epic_success_configs) 
        ? epic.epic_success_configs[0] 
        : epic.epic_success_configs;
      const ownerUser = Array.isArray(config?.post_launch_owner_user)
        ? config.post_launch_owner_user[0]
        : config?.post_launch_owner_user;
      
      const retros = Array.isArray(epic.epic_retros) ? epic.epic_retros : [epic.epic_retros];
      
      for (const retro of retros) {
        const dayMarker = retro.day_marker;
        const daysPastDue = daysSinceLaunch - dayMarker;
        
        // Retro is overdue if it's 7+ days past the due date
        if (daysPastDue >= 7) {
          escalationEpics.push({
            epicId: epic.id,
            epicName: epic.name,
            escalationReason: 'overdue_retro',
            daysSinceLastReview: null,
            overdueRetroDayMarker: dayMarker,
            postLaunchOwnerEmail: ownerUser?.email || null,
            postLaunchOwnerId: ownerUser?.id || null,
          });
          break; // Only add once per epic
        }
      }
    }
  }
  
  return escalationEpics;
}

